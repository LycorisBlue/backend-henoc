// routes/admin/payments.js
const express = require('express');
const router = express.Router();
const { Payment, Invoice, Request, Client, Admin } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const { Op } = require('sequelize');

/**
 * Récupérer la liste des paiements avec filtres optionnels
 */
router.get('/', async (req, res) => {
    // Récupération des paramètres de filtrage et pagination
    const {
        method,
        client_id,
        whatsapp_number,
        admin_id,
        min_amount,
        max_amount,
        date_from,
        date_to,
        invoice_id,
        request_id,
        page = 1,
        limit = 10,
        sort_by = 'payment_date',
        sort_order = 'DESC'
    } = req.query;

    const logData = {
        message: '',
        source: 'admin/payments',
        userId: req.admin?.id,
        action: 'LIST_PAYMENTS',
        ipAddress: req.ip,
        requestData: {
            filters: {
                method,
                client_id,
                whatsapp_number,
                admin_id,
                min_amount,
                max_amount,
                date_from,
                date_to,
                invoice_id,
                request_id
            },
            pagination: { page, limit },
            sorting: { sort_by, sort_order }
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Construction des conditions de filtrage pour les paiements
        const whereConditions = {};

        if (method) {
            whereConditions.method = method;
        }

        if (admin_id) {
            whereConditions.confirmed_by = admin_id;
        }

        if (invoice_id) {
            whereConditions.invoice_id = invoice_id;
        }

        // Filtrage par montant
        if (min_amount) {
            whereConditions.amount_paid = {
                ...whereConditions.amount_paid,
                [Op.gte]: parseFloat(min_amount)
            };
        }

        if (max_amount) {
            whereConditions.amount_paid = {
                ...whereConditions.amount_paid,
                [Op.lte]: parseFloat(max_amount)
            };
        }

        // Filtrage par date de paiement
        if (date_from) {
            whereConditions.payment_date = {
                ...whereConditions.payment_date,
                [Op.gte]: new Date(date_from)
            };
        }

        if (date_to) {
            whereConditions.payment_date = {
                ...whereConditions.payment_date,
                [Op.lte]: new Date(date_to)
            };
        }

        // Configuration de la pagination
        const offset = (page - 1) * limit;
        const pageSize = parseInt(limit);

        // Configuration du tri
        const order = [[sort_by, sort_order]];

        // Options pour l'inclusion des relations
        const includeOptions = [
            {
                model: Invoice,
                as: 'invoice',
                attributes: ['id', 'total_amount', 'status'],
                include: [
                    {
                        model: Request,
                        as: 'request',
                        attributes: ['id', 'description', 'status'],
                        include: [
                            {
                                model: Client,
                                as: 'client',
                                attributes: ['id', 'whatsapp_number', 'full_name']
                            }
                        ]
                    }
                ]
            },
            {
                model: Admin,
                as: 'confirmer',
                attributes: ['id', 'name', 'email']
            }
        ];

        // Filtres additionnels pour les relations
        if (request_id) {
            includeOptions[0].include[0].where = {
                id: request_id
            };
        }

        if (client_id) {
            includeOptions[0].include[0].include[0].where = {
                id: client_id
            };
        }

        if (whatsapp_number) {
            includeOptions[0].include[0].include[0].where = {
                ...includeOptions[0].include[0].include[0].where,
                whatsapp_number: {
                    [Op.like]: `%${whatsapp_number}%`
                }
            };
        }

        // Requête avec pagination, filtres et inclusion des relations
        const { count, rows: payments } = await Payment.findAndCountAll({
            where: whereConditions,
            include: includeOptions,
            order,
            offset,
            limit: pageSize,
            distinct: true // Pour un comptage correct avec des relations incluses
        });

        // Calcul des métadonnées de pagination
        const totalPages = Math.ceil(count / pageSize);
        const pagination = {
            total_items: count,
            total_pages: totalPages,
            current_page: parseInt(page),
            items_per_page: pageSize,
            has_next_page: parseInt(page) < totalPages,
            has_previous_page: parseInt(page) > 1
        };

        // Préparation de la réponse
        const responseData = {
            payments: payments.map(payment => ({
                id: payment.id,
                invoice_id: payment.invoice_id,
                amount_paid: payment.amount_paid,
                method: payment.method,
                payment_date: payment.payment_date,
                reference: payment.reference,
                created_at: payment.created_at,
                invoice: {
                    id: payment.invoice.id,
                    total_amount: payment.invoice.total_amount,
                    status: payment.invoice.status
                },
                request: {
                    id: payment.invoice.request.id,
                    description: payment.invoice.request.description,
                    status: payment.invoice.request.status
                },
                client: {
                    id: payment.invoice.request.client.id,
                    whatsapp_number: payment.invoice.request.client.whatsapp_number,
                    full_name: payment.invoice.request.client.full_name
                },
                confirmed_by: payment.confirmer ? {
                    id: payment.confirmer.id,
                    name: payment.confirmer.name
                } : null
            })),
            pagination
        };

        // Ajouter des statistiques supplémentaires
        const totalAmount = payments.reduce((sum, payment) => sum + parseFloat(payment.amount_paid), 0);
        const methodStats = payments.reduce((stats, payment) => {
            const method = payment.method;
            if (!stats[method]) stats[method] = { count: 0, total: 0 };
            stats[method].count += 1;
            stats[method].total += parseFloat(payment.amount_paid);
            return stats;
        }, {});

        responseData.stats = {
            total_amount: totalAmount,
            methods: methodStats
        };

        logData.message = 'Liste des paiements récupérée avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { count, page, limit };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Liste des paiements', responseData);
    } catch (error) {
        logData.message = 'Erreur lors de la récupération des paiements';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;