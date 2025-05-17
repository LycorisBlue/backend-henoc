// routes/admin/invoice-details.js
const express = require('express');
const router = express.Router();
const { Invoice, InvoiceItem, InvoiceFee, Request, Client, Admin, Payment, FeeType } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

/**
 * Récupérer les détails complets d'une facture
 */
router.get('/:id', async (req, res) => {
    const invoiceId = req.params.id;
    const adminId = req.admin.id;
    const adminRole = req.admin.role;

    const logData = {
        message: '',
        source: 'admin/invoice-details',
        userId: adminId,
        action: 'GET_INVOICE_DETAILS',
        ipAddress: req.ip,
        requestData: { invoice_id: invoiceId },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Récupérer la facture avec toutes ses relations
        const invoice = await Invoice.findByPk(invoiceId, {
            include: [
                {
                    model: Request,
                    as: 'request',
                    include: [
                        {
                            model: Client,
                            as: 'client',
                            attributes: ['id', 'whatsapp_number', 'full_name', 'email', 'adresse']
                        }
                    ]
                },
                {
                    model: Admin,
                    as: 'admin',
                    attributes: ['id', 'name', 'email', 'role']
                },
                {
                    model: InvoiceItem,
                    as: 'items'
                },
                {
                    model: InvoiceFee,
                    as: 'fees',
                    include: [
                        {
                            model: FeeType,
                            as: 'type',
                            attributes: ['id', 'name', 'description']
                        }
                    ]
                },
                {
                    model: Payment,
                    as: 'payments',
                    include: [
                        {
                            model: Admin,
                            as: 'confirmer',
                            attributes: ['id', 'name', 'email']
                        }
                    ]
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

        // Déterminer si l'admin peut modifier cette facture
        // Un admin peut modifier s'il est superadmin ou s'il est l'admin qui a créé la facture
        // ou s'il est assigné à la demande associée à la facture
        const canModify = adminRole === 'superadmin' ||
            invoice.admin_id === adminId ||
            invoice.request.assigned_admin_id === adminId;

        // Calculer les montants totaux
        const itemsTotal = invoice.items.reduce((sum, item) => sum + parseFloat(item.subtotal), 0);
        const feesTotal = invoice.fees.reduce((sum, fee) => sum + parseFloat(fee.amount), 0);
        const totalPaid = invoice.payments.reduce((sum, payment) => sum + parseFloat(payment.amount_paid), 0);
        const remainingAmount = parseFloat(invoice.total_amount) - totalPaid;

        // Déterminer le statut de paiement
        let paymentStatus;
        if (totalPaid >= parseFloat(invoice.total_amount)) {
            paymentStatus = 'paid';
        } else if (totalPaid > 0) {
            paymentStatus = 'partial';
        } else {
            paymentStatus = 'unpaid';
        }

        // Construire la réponse
        const responseData = {
            id: invoice.id,
            request_id: invoice.request_id,
            admin_id: invoice.admin_id,
            total_amount: invoice.total_amount,
            status: invoice.status,
            created_at: invoice.created_at,
            updated_at: invoice.updated_at,
            permissions: {
                can_modify: canModify
            },
            payment_info: {
                payment_status: paymentStatus,
                amount_paid: totalPaid,
                remaining_amount: remainingAmount,
                payment_progress: Math.min(100, Math.round((totalPaid / parseFloat(invoice.total_amount)) * 100))
            },
            totals: {
                items_total: itemsTotal,
                fees_total: feesTotal,
                grand_total: invoice.total_amount
            },
            client: {
                id: invoice.request.client.id,
                whatsapp_number: invoice.request.client.whatsapp_number,
                full_name: invoice.request.client.full_name || '',
                email: invoice.request.client.email || '',
                adresse: invoice.request.client.adresse || ''
            },
            request: {
                id: invoice.request.id,
                description: invoice.request.description,
                status: invoice.request.status,
                created_at: invoice.request.created_at
            },
            admin: {
                id: invoice.admin.id,
                name: invoice.admin.name,
                email: invoice.admin.email,
                is_current_admin: invoice.admin.id === adminId
            },
            items: invoice.items.map(item => ({
                id: item.id,
                name: item.name,
                unit_price: item.unit_price,
                quantity: item.quantity,
                subtotal: item.subtotal
            })),
            fees: invoice.fees.map(fee => ({
                id: fee.id,
                fee_type: {
                    id: fee.type.id,
                    name: fee.type.name,
                    description: fee.type.description
                },
                amount: fee.amount
            })),
            payments: invoice.payments.map(payment => ({
                id: payment.id,
                amount_paid: payment.amount_paid,
                method: payment.method,
                payment_date: payment.payment_date,
                confirmed_by: payment.confirmer ? {
                    id: payment.confirmer.id,
                    name: payment.confirmer.name,
                    email: payment.confirmer.email
                } : null,
                created_at: payment.created_at
            }))
        };

        logData.message = 'Détails de la facture récupérés avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            invoice_id: invoiceId,
            can_modify: canModify,
            payment_status: paymentStatus
        };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Détails de la facture', responseData);
    } catch (error) {
        logData.message = 'Erreur lors de la récupération des détails de la facture';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;