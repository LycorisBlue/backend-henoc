// routes/admin/client-analytics.js
const express = require('express');
const router = express.Router();
const { Client, Request, Invoice, Payment } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const { Op, fn, col, literal } = require('sequelize');

/**
* Analytics avancées des clients avec métriques business
*/
router.get('/', async (req, res) => {
    const {
        status, // 'registered', 'unregistered', 'all'
        page = 1,
        limit = 10,
        sort_by = 'created_at',
        sort_order = 'DESC'
    } = req.query;

    const logData = {
        message: '',
        source: 'admin/client-analytics',
        userId: req.admin?.id,
        action: 'GET_CLIENT_ANALYTICS',
        ipAddress: req.ip,
        requestData: { status, page, limit },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Calcul des dates
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // ========== MÉTRIQUES GLOBALES ==========

        // Total clients
        const totalClients = await Client.count();

        // Nouveaux clients ce mois
        const newClientsThisMonth = await Client.count({
            where: {
                created_at: {
                    [Op.gte]: startOfMonth
                }
            }
        });

        // Clients actifs (ayant fait au moins une commande facturée)
        const activeClients = await Client.count({
            include: [
                {
                    model: Request,
                    as: 'requests',
                    required: true,
                    include: [
                        {
                            model: Invoice,
                            as: 'invoice',
                            required: true
                        }
                    ]
                }
            ],
            distinct: true
        });

        // Commandes totales (requests avec factures)
        const totalOrders = await Request.count({
            include: [
                {
                    model: Invoice,
                    as: 'invoice',
                    required: true
                }
            ]
        });

        // ========== LISTE DÉTAILLÉE DES CLIENTS ==========

        // Construction des conditions de filtrage par statut
        let clientWhereConditions = {};
        if (status === 'registered') {
            clientWhereConditions[Op.or] = [
                { full_name: { [Op.not]: null, [Op.ne]: '' } },
                { email: { [Op.not]: null, [Op.ne]: '' } },
                { adresse: { [Op.not]: null, [Op.ne]: '' } }
            ];
        } else if (status === 'unregistered') {
            clientWhereConditions[Op.and] = [
                { [Op.or]: [{ full_name: null }, { full_name: '' }] },
                { [Op.or]: [{ email: null }, { email: '' }] },
                { [Op.or]: [{ adresse: null }, { adresse: '' }] }
            ];
        }

        // Pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Requête pour récupérer les clients avec leurs métriques
        const clientsWithMetrics = await Client.findAndCountAll({
            where: clientWhereConditions,
            include: [
                {
                    model: Request,
                    as: 'requests',
                    required: false,
                    include: [
                        {
                            model: Invoice,
                            as: 'invoice',
                            required: false,
                            include: [
                                {
                                    model: Payment,
                                    as: 'payments',
                                    required: false
                                }
                            ]
                        }
                    ]
                }
            ],
            limit: parseInt(limit),
            offset,
            order: [[sort_by, sort_order.toUpperCase()]],
            distinct: true
        });

        // Traitement des données pour chaque client
        const processedClients = clientsWithMetrics.rows.map(client => {
            const requests = client.requests || [];
            const invoicedRequests = requests.filter(req => req.invoice);

            // Calcul du total dépensé
            const totalSpent = invoicedRequests.reduce((sum, request) => {
                const payments = request.invoice.payments || [];
                const paidAmount = payments.reduce((pSum, payment) => pSum + parseFloat(payment.amount_paid), 0);
                return sum + paidAmount;
            }, 0);

            // Dernière commande
            const lastOrder = invoicedRequests.length > 0
                ? invoicedRequests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
                : null;

            // Déterminer le statut de la dernière commande
            let lastOrderStatus = null;
            if (lastOrder && lastOrder.invoice) {
                const totalPaid = (lastOrder.invoice.payments || []).reduce((sum, p) => sum + parseFloat(p.amount_paid), 0);
                const totalAmount = parseFloat(lastOrder.invoice.total_amount);

                if (totalPaid >= totalAmount) {
                    lastOrderStatus = 'paid';
                } else if (totalPaid > 0) {
                    lastOrderStatus = 'partial';
                } else {
                    lastOrderStatus = 'unpaid';
                }
            }

            // Déterminer le statut d'enregistrement du client
            const isRegistered = (client.full_name && client.full_name.trim() !== '') ||
                (client.email && client.email.trim() !== '') ||
                (client.adresse && client.adresse.trim() !== '');

            return {
                id: client.id,
                name: client.full_name || 'Client sans nom',
                contact: client.whatsapp_number,
                email: client.email,
                orders_count: invoicedRequests.length,
                total_spent: totalSpent,
                last_order_date: lastOrder ? lastOrder.created_at : null,
                last_order_status: lastOrderStatus,
                client_status: isRegistered ? 'registered' : 'unregistered',
                created_at: client.created_at
            };
        });

        // Configuration pagination
        const pagination = {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total_items: clientsWithMetrics.count,
            total_pages: Math.ceil(clientsWithMetrics.count / parseInt(limit)),
            has_next_page: parseInt(page) < Math.ceil(clientsWithMetrics.count / parseInt(limit)),
            has_prev_page: parseInt(page) > 1
        };

        // Réponse finale
        const responseData = {
            overview: {
                total_clients: totalClients,
                new_clients_this_month: newClientsThisMonth,
                active_clients: activeClients,
                total_orders: totalOrders
            },
            clients: processedClients,
            pagination,
            filters_applied: {
                status: status || 'all'
            }
        };

        logData.message = 'Analytics clients récupérées avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            total_clients: totalClients,
            active_clients: activeClients,
            status_filter: status || 'all'
        };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Analytics clients', responseData);

    } catch (error) {
        logData.message = 'Erreur lors de la récupération des analytics clients';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;