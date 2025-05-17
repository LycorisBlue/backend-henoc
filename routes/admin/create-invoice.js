// routes/admin/create-invoice.js
const express = require('express');
const router = express.Router();
const { Request, Invoice, InvoiceItem, InvoiceFee, FeeType, RequestStatusLog } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const { Sequelize } = require('sequelize');
const sequelize = require('../../models').sequelize;

/**
 * Créer une facture pour une demande
 */
router.post('/:id/invoice', async (req, res) => {
    const requestId = req.params.id;
    const adminId = req.admin.id;
    const adminRole = req.admin.role;
    const { items, fees } = req.body;

    const logData = {
        message: '',
        source: 'admin/create-invoice',
        userId: adminId,
        action: 'CREATE_INVOICE',
        ipAddress: req.ip,
        requestData: {
            request_id: requestId,
            items_count: items?.length || 0,
            fees_count: fees?.length || 0
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Vérifier la présence des éléments de la facture
        if (!items || !Array.isArray(items) || items.length === 0) {
            logData.message = 'Éléments de facture manquants';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'MISSING_INVOICE_ITEMS' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Les éléments de la facture sont requis', logData.responseData);
        }

        // Vérifier si la demande existe
        const request = await Request.findByPk(requestId);
        if (!request) {
            logData.message = 'Demande non trouvée';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'REQUEST_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Demande non trouvée', logData.responseData);
        }

        // Vérifier que l'admin est assigné à cette demande (sauf pour les superadmins)
        if (adminRole !== 'superadmin' && request.assigned_admin_id !== adminId) {
            logData.message = 'Admin non assigné à cette demande';
            logData.status = 'FAILED';
            logData.responseData = {
                errorType: 'ADMIN_NOT_ASSIGNED',
                request_id: requestId,
                assigned_admin_id: request.assigned_admin_id
            };
            await Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, 'Vous n\'êtes pas autorisé à créer une facture pour cette demande car vous n\'y êtes pas assigné', logData.responseData);
        }

        // Vérifier si une facture existe déjà pour cette demande
        const existingInvoice = await Invoice.findOne({ where: { request_id: requestId } });
        if (existingInvoice) {
            logData.message = 'Une facture existe déjà pour cette demande';
            logData.status = 'FAILED';
            logData.responseData = {
                errorType: 'INVOICE_ALREADY_EXISTS',
                invoice_id: existingInvoice.id
            };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Une facture existe déjà pour cette demande', logData.responseData);
        }

        // Valider les éléments de la facture
        for (const item of items) {
            if (!item.name || !item.unit_price || !item.quantity) {
                logData.message = 'Données d\'élément de facture incomplètes';
                logData.status = 'FAILED';
                logData.responseData = {
                    errorType: 'INVALID_INVOICE_ITEM',
                    item
                };
                await Logger.logEvent(logData);
                return ApiResponse.badRequest(res, 'Chaque élément de facture doit inclure un nom, un prix unitaire et une quantité', logData.responseData);
            }

            // Vérifier que les valeurs numériques sont positives
            if (parseFloat(item.unit_price) <= 0 || parseInt(item.quantity) <= 0) {
                logData.message = 'Valeurs numériques négatives ou nulles';
                logData.status = 'FAILED';
                logData.responseData = {
                    errorType: 'INVALID_NUMERIC_VALUE',
                    item
                };
                await Logger.logEvent(logData);
                return ApiResponse.badRequest(res, 'Le prix unitaire et la quantité doivent être des valeurs positives', logData.responseData);
            }

            // Calculer le sous-total pour chaque élément
            item.subtotal = parseFloat(item.unit_price) * parseInt(item.quantity);
        }

        // Valider les frais si fournis
        if (fees && Array.isArray(fees)) {
            for (const fee of fees) {
                if (!fee.fee_type_id || !fee.amount) {
                    logData.message = 'Données de frais incomplètes';
                    logData.status = 'FAILED';
                    logData.responseData = {
                        errorType: 'INVALID_FEE',
                        fee
                    };
                    await Logger.logEvent(logData);
                    return ApiResponse.badRequest(res, 'Chaque frais doit inclure un type et un montant', logData.responseData);
                }

                // Vérifier que le type de frais existe
                const feeType = await FeeType.findByPk(fee.fee_type_id);
                if (!feeType) {
                    logData.message = 'Type de frais non trouvé';
                    logData.status = 'FAILED';
                    logData.responseData = {
                        errorType: 'FEE_TYPE_NOT_FOUND',
                        fee_type_id: fee.fee_type_id
                    };
                    await Logger.logEvent(logData);
                    return ApiResponse.badRequest(res, 'Le type de frais spécifié n\'existe pas', logData.responseData);
                }

                // Vérifier que le montant est positif
                if (parseFloat(fee.amount) <= 0) {
                    logData.message = 'Montant de frais négatif ou nul';
                    logData.status = 'FAILED';
                    logData.responseData = {
                        errorType: 'INVALID_FEE_AMOUNT',
                        fee
                    };
                    await Logger.logEvent(logData);
                    return ApiResponse.badRequest(res, 'Le montant des frais doit être une valeur positive', logData.responseData);
                }
            }
        }

        // Calculer le montant total de la facture
        const itemsTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const feesTotal = fees && fees.length > 0
            ? fees.reduce((sum, fee) => sum + parseFloat(fee.amount), 0)
            : 0;
        const totalAmount = itemsTotal + feesTotal;

        // Utiliser une transaction pour assurer l'intégrité des données
        const result = await sequelize.transaction(async (t) => {
            // Créer la facture
            const invoice = await Invoice.create({
                request_id: requestId,
                admin_id: adminId,
                total_amount: totalAmount,
                status: 'en_attente'
            }, { transaction: t });

            // Créer les éléments de la facture
            const invoiceItems = await Promise.all(items.map(item => {
                return InvoiceItem.create({
                    invoice_id: invoice.id,
                    name: item.name,
                    unit_price: parseFloat(item.unit_price),
                    quantity: parseInt(item.quantity),
                    subtotal: item.subtotal
                }, { transaction: t });
            }));

            // Créer les frais de la facture si fournis
            let invoiceFees = [];
            if (fees && fees.length > 0) {
                invoiceFees = await Promise.all(fees.map(fee => {
                    return InvoiceFee.create({
                        invoice_id: invoice.id,
                        fee_type_id: fee.fee_type_id,
                        amount: parseFloat(fee.amount)
                    }, { transaction: t });
                }));
            }

            // Mettre à jour le statut de la demande à "facturé" si elle ne l'est pas déjà
            if (request.status !== 'facturé') {
                const previousStatus = request.status;
                await request.update({ status: 'facturé' }, { transaction: t });

                // Ajouter une entrée dans le journal des statuts
                await RequestStatusLog.create({
                    request_id: requestId,
                    previous_status: previousStatus,
                    new_status: 'facturé',
                    comment: 'Statut mis à jour automatiquement lors de la création de la facture',
                    admin_id: adminId
                }, { transaction: t });
            }

            return { invoice, invoiceItems, invoiceFees };
        });

        logData.message = 'Facture créée avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            invoice_id: result.invoice.id,
            total_amount: totalAmount
        };
        await Logger.logEvent(logData);

        // Construire la réponse
        const responseData = {
            invoice: {
                id: result.invoice.id,
                request_id: result.invoice.request_id,
                admin_id: result.invoice.admin_id,
                total_amount: result.invoice.total_amount,
                status: result.invoice.status,
                created_at: result.invoice.created_at
            },
            items: result.invoiceItems.map(item => ({
                id: item.id,
                name: item.name,
                unit_price: item.unit_price,
                quantity: item.quantity,
                subtotal: item.subtotal
            })),
            fees: result.invoiceFees.map(fee => ({
                id: fee.id,
                fee_type_id: fee.fee_type_id,
                amount: fee.amount
            }))
        };

        return ApiResponse.created(res, 'Facture créée avec succès', responseData);
    } catch (error) {
        logData.message = 'Erreur lors de la création de la facture';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;