// routes/admin/create-payment.js
const express = require('express');
const router = express.Router();
const { Invoice, Payment, Request, RequestStatusLog } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const { sequelize } = require('../../models');

/**
 * Enregistrer un paiement pour une facture
 */
router.post('/:id/payment', async (req, res) => {
    const invoiceId = req.params.id;
    const adminId = req.admin.id;
    const adminRole = req.admin.role;
    const { amount_paid, method, payment_date, reference } = req.body;

    const logData = {
        message: '',
        source: 'admin/create-payment',
        userId: adminId,
        action: 'CREATE_PAYMENT',
        ipAddress: req.ip,
        requestData: {
            invoice_id: invoiceId,
            amount_paid,
            method,
            payment_date,
            has_reference: !!reference
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Validation des données
        if (!amount_paid || !method || !payment_date) {
            logData.message = 'Données de paiement incomplètes';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'MISSING_PAYMENT_DATA' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Le montant, la méthode et la date de paiement sont requis', logData.responseData);
        }

        // Validation du montant
        if (parseFloat(amount_paid) <= 0) {
            logData.message = 'Montant de paiement invalide';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_PAYMENT_AMOUNT' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Le montant du paiement doit être positif', logData.responseData);
        }

        // Validation de la méthode de paiement
        const validMethods = ['wave', 'momo', 'orange_money', 'zeepay', 'cash'];
        if (!validMethods.includes(method)) {
            logData.message = 'Méthode de paiement invalide';
            logData.status = 'FAILED';
            logData.responseData = {
                errorType: 'INVALID_PAYMENT_METHOD',
                validMethods
            };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, `Méthode de paiement invalide. Valeurs acceptées: ${validMethods.join(', ')}`, logData.responseData);
        }

        // Validation de la date de paiement
        try {
            new Date(payment_date);
        } catch (error) {
            logData.message = 'Format de date invalide';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_DATE_FORMAT' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Le format de la date de paiement est invalide', logData.responseData);
        }

        // Récupérer la facture avec les paiements existants
        const invoice = await Invoice.findByPk(invoiceId, {
            include: [
                {
                    model: Payment,
                    as: 'payments'
                },
                {
                    model: Request,
                    as: 'request'
                }
            ]
        });

        // Vérifier si la facture existe
        if (!invoice) {
            logData.message = 'Facture non trouvée';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVOICE_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Facture non trouvée', logData.responseData);
        }

        // Vérifier si la facture est déjà annulée
        if (invoice.status === 'annulé') {
            logData.message = 'Impossible d\'ajouter un paiement à une facture annulée';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVOICE_CANCELLED' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Impossible d\'ajouter un paiement à une facture annulée', logData.responseData);
        }

        // Calculer le montant déjà payé
        const totalPaid = invoice.payments.reduce((sum, payment) => sum + parseFloat(payment.amount_paid), 0);
        const invoiceTotal = parseFloat(invoice.total_amount);
        const remainingAmount = invoiceTotal - totalPaid;

        // Vérifier si le montant n'excède pas le solde restant
        if (parseFloat(amount_paid) > remainingAmount) {
            logData.message = 'Le montant du paiement excède le solde restant';
            logData.status = 'FAILED';
            logData.responseData = {
                errorType: 'PAYMENT_EXCEEDS_REMAINING',
                total_amount: invoiceTotal,
                already_paid: totalPaid,
                remaining_amount: remainingAmount,
                payment_attempt: parseFloat(amount_paid)
            };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, `Le montant du paiement (${amount_paid}) excède le solde restant (${remainingAmount.toFixed(2)})`, logData.responseData);
        }

        // Créer le paiement dans une transaction
        const result = await sequelize.transaction(async (t) => {
            // Créer le paiement
            const payment = await Payment.create({
                invoice_id: invoiceId,
                amount_paid: parseFloat(amount_paid),
                method,
                payment_date: new Date(payment_date),
                confirmed_by: adminId,
                reference: reference || null
            }, { transaction: t });

            // Mise à jour du statut de la facture si entièrement payée
            const newTotalPaid = totalPaid + parseFloat(amount_paid);
            if (newTotalPaid >= invoiceTotal && invoice.status !== 'payé') {
                await invoice.update({ status: 'payé' }, { transaction: t });
            }

            // Mise à jour du statut de la demande à "payé" si nécessaire
            if (newTotalPaid >= invoiceTotal && invoice.request.status !== 'payé') {
                const request = invoice.request;
                const previousStatus = request.status;

                await request.update({ status: 'payé' }, { transaction: t });

                // Ajouter une entrée dans le journal des statuts
                await RequestStatusLog.create({
                    request_id: request.id,
                    previous_status: previousStatus,
                    new_status: 'payé',
                    comment: 'Statut mis à jour automatiquement après paiement complet de la facture',
                    admin_id: adminId
                }, { transaction: t });
            }

            return payment;
        });

        logData.message = 'Paiement enregistré avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            payment_id: result.id,
            amount_paid,
            method
        };
        await Logger.logEvent(logData);

        // Calculer les nouveaux totaux pour la réponse
        const newTotalPaid = totalPaid + parseFloat(amount_paid);
        const newRemainingAmount = invoiceTotal - newTotalPaid;
        const isFullyPaid = newTotalPaid >= invoiceTotal;

        // Préparer la réponse
        const responseData = {
            payment: {
                id: result.id,
                invoice_id: invoiceId,
                amount_paid: parseFloat(amount_paid),
                method,
                payment_date: result.payment_date,
                confirmed_by: adminId,
                created_at: result.created_at
            },
            invoice: {
                id: invoice.id,
                total_amount: invoice.total_amount,
                status: isFullyPaid ? 'payé' : invoice.status,
                total_paid: newTotalPaid,
                remaining_amount: newRemainingAmount,
                is_fully_paid: isFullyPaid,
                payment_progress: Math.min(100, Math.round((newTotalPaid / invoiceTotal) * 100))
            },
            request: {
                id: invoice.request.id,
                status: isFullyPaid ? 'payé' : invoice.request.status
            }
        };

        return ApiResponse.created(res, 'Paiement enregistré avec succès', responseData);
    } catch (error) {
        logData.message = 'Erreur lors de l\'enregistrement du paiement';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;