// routes/admin/invoices.js
const express = require('express');
const router = express.Router();
const { Invoice, Request, Client, Admin, Payment } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const { Op, literal } = require('sequelize');

/**
 * Récupérer la liste des factures avec filtres optionnels
 */
router.get('/', async (req, res) => {
    const {
        status,
        client_id,
        whatsapp_number,
        admin_id,
        min_amount,
        max_amount,
        date_from,
        date_to,
        payment_status,
        page = 1,
        limit = 10,
        sort_by = 'created_at',
        sort_order = 'DESC'
    } = req.query;

    const logData = {
        message: '',
        source: 'admin/invoices',
        userId: req.admin?.id,
        action: 'LIST_INVOICES',
        ipAddress: req.ip,
        requestData: {
            filters: {
                status,
                client_id,
                whatsapp_number,
                admin_id,
                min_amount,
                max_amount,
                date_from,
                date_to,
                payment_status
            },
            pagination: { page, limit },
            sorting: { sort_by, sort_order }
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Construction des conditions de filtrage pour les factures
        const whereConditions = {};

        // Restriction par rôle : admin ne voit que ses factures
        if (req.admin.role !== 'superadmin') {
            whereConditions.admin_id = req.admin.id;
        }

        if (status) {
            whereConditions.status = status;
        }

        // Pour superadmin uniquement : filtrage par admin_id spécifique
        if (admin_id && req.admin.role === 'superadmin') {
            whereConditions.admin_id = admin_id;
        }

        // Filtrage par montant
        if (min_amount) {
            whereConditions.total_amount = {
                [Op.gte]: parseFloat(min_amount)
            };
        }

        if (max_amount) {
            if (whereConditions.total_amount) {
                whereConditions.total_amount[Op.lte] = parseFloat(max_amount);
            } else {
                whereConditions.total_amount = {
                    [Op.lte]: parseFloat(max_amount)
                };
            }
        }

        // Filtrage par plage de dates
        if (date_from || date_to) {
            whereConditions.created_at = {};
            if (date_from) {
                whereConditions.created_at[Op.gte] = new Date(date_from);
            }
            if (date_to) {
                const endDate = new Date(date_to);
                endDate.setHours(23, 59, 59, 999);
                whereConditions.created_at[Op.lte] = endDate;
            }
        }

        // Conditions pour les relations (client)
        const clientWhereConditions = {};
        if (client_id) {
            clientWhereConditions.id = client_id;
        }
        if (whatsapp_number) {
            clientWhereConditions.whatsapp_number = {
                [Op.like]: `%${whatsapp_number}%`
            };
        }

        // Configuration de la pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Exécution de la requête avec relations
        const { count: totalItems, rows: invoices } = await Invoice.findAndCountAll({
            where: whereConditions,
            include: [
                {
                    model: Request,
                    as: 'request',
                    include: [
                        {
                            model: Client,
                            as: 'client',
                            where: Object.keys(clientWhereConditions).length > 0 ? clientWhereConditions : undefined,
                            attributes: ['id', 'whatsapp_number', 'full_name']
                        }
                    ]
                },
                {
                    model: Admin,
                    as: 'admin',
                    attributes: ['id', 'name']
                },
                {
                    model: Payment,
                    as: 'payments',
                    attributes: ['amount_paid']
                }
            ],
            limit: parseInt(limit),
            offset,
            order: [[sort_by, sort_order.toUpperCase()]],
            distinct: true
        });

        // Configuration de la pagination pour la réponse
        const pagination = {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total_items: totalItems,
            total_pages: Math.ceil(totalItems / parseInt(limit)),
            has_next_page: parseInt(page) < Math.ceil(totalItems / parseInt(limit)),
            has_prev_page: parseInt(page) > 1
        };

        // Formatage des données de réponse
        const responseData = {
            invoices: invoices.map(invoice => {
                const totalPaid = invoice.payments.reduce((sum, payment) => sum + parseFloat(payment.amount_paid), 0);
                const remainingAmount = parseFloat(invoice.total_amount) - totalPaid;

                // Filtrage par statut de paiement si spécifié
                const paymentStatusValue = totalPaid >= parseFloat(invoice.total_amount) ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';
                if (payment_status && payment_status !== paymentStatusValue) {
                    return null;
                }

                return {
                    id: invoice.id,
                    total_amount: invoice.total_amount,
                    status: invoice.status,
                    created_at: invoice.createdAt,
                    payment_status: paymentStatusValue,
                    amount_paid: totalPaid,
                    remaining_amount: remainingAmount,
                    request: {
                        id: invoice.request.id,
                        description: invoice.request.description,
                        status: invoice.request.status
                    },
                    client: {
                        id: invoice.request.client.id,
                        whatsapp_number: invoice.request.client.whatsapp_number,
                        full_name: invoice.request.client.full_name
                    },
                    admin: {
                        id: invoice.admin.id,
                        name: invoice.admin.name
                    },
                    payments: invoice.payments.map(payment => ({
                        id: payment.id,
                        amount_paid: payment.amount_paid,
                        method: payment.method,
                        payment_date: payment.payment_date
                    }))
                };
            }).filter(invoice => invoice !== null),
            pagination
        };

        logData.message = 'Liste des factures récupérée avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { count: totalItems, page, limit };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Liste des factures', responseData);
    } catch (error) {
        logData.message = 'Erreur lors de la récupération des factures';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;