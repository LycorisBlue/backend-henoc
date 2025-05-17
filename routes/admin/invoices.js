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
    // Récupération des paramètres de filtrage et pagination
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

        if (status) {
            whereConditions.status = status;
        }

        if (admin_id) {
            whereConditions.admin_id = admin_id;
        }

        // Filtrage par montant
        if (min_amount) {
            whereConditions.total_amount = {
                ...whereConditions.total_amount,
                [Op.gte]: parseFloat(min_amount)
            };
        }

        if (max_amount) {
            whereConditions.total_amount = {
                ...whereConditions.total_amount,
                [Op.lte]: parseFloat(max_amount)
            };
        }

        // Filtrage par date
        if (date_from) {
            whereConditions.created_at = {
                ...whereConditions.created_at,
                [Op.gte]: new Date(date_from)
            };
        }

        if (date_to) {
            whereConditions.created_at = {
                ...whereConditions.created_at,
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
            },
            {
                model: Admin,
                as: 'admin',
                attributes: ['id', 'name', 'email']
            },
            {
                model: Payment,
                as: 'payments',
                attributes: ['id', 'amount_paid', 'method', 'payment_date', 'confirmed_by']
            }
        ];

        // Filtres additionnels pour les relations
        if (client_id) {
            includeOptions[0].include[0].where = {
                id: client_id
            };
        }

        if (whatsapp_number) {
            includeOptions[0].include[0].where = {
                ...includeOptions[0].include[0].where,
                whatsapp_number: {
                    [Op.like]: `%${whatsapp_number}%`
                }
            };
        }

        // Filtrage par statut de paiement (entièrement payé, partiellement payé, non payé)
        if (payment_status) {
            // On va réaliser ce filtrage après la requête principale
        }

        // Requête avec pagination, filtres et inclusion des relations
        const { count, rows: invoices } = await Invoice.findAndCountAll({
            where: whereConditions,
            include: includeOptions,
            order,
            offset,
            limit: pageSize,
            distinct: true // Pour un comptage correct avec des relations incluses
        });

        // Calcul du montant payé pour chaque facture et filtrage par statut de paiement si nécessaire
        let filteredInvoices = invoices;

        if (payment_status) {
            filteredInvoices = invoices.filter(invoice => {
                const totalPaid = invoice.payments.reduce((sum, payment) => sum + parseFloat(payment.amount_paid), 0);
                const totalAmount = parseFloat(invoice.total_amount);

                switch (payment_status) {
                    case 'paid':
                        return totalPaid >= totalAmount;
                    case 'partial':
                        return totalPaid > 0 && totalPaid < totalAmount;
                    case 'unpaid':
                        return totalPaid === 0;
                    default:
                        return true;
                }
            });
        }

        // Calcul des métadonnées de pagination
        const totalItems = payment_status ? filteredInvoices.length : count;
        const totalPages = Math.ceil(totalItems / pageSize);
        const pagination = {
            total_items: totalItems,
            total_pages: totalPages,
            current_page: parseInt(page),
            items_per_page: pageSize,
            has_next_page: parseInt(page) < totalPages,
            has_previous_page: parseInt(page) > 1
        };

        // Préparation de la réponse
        const responseData = {
            invoices: filteredInvoices.map(invoice => {
                const totalPaid = invoice.payments.reduce((sum, payment) => sum + parseFloat(payment.amount_paid), 0);
                const totalAmount = parseFloat(invoice.total_amount);
                const remainingAmount = totalAmount - totalPaid;

                return {
                    id: invoice.id,
                    total_amount: invoice.total_amount,
                    status: invoice.status,
                    created_at: invoice.created_at,
                    payment_status: totalPaid >= totalAmount ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid',
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
            }),
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