// routes/admin/analytics.js
const express = require('express');
const router = express.Router();
const { Request, Invoice, Payment, Client, Admin, RequestStatusLog } = require('../../models');
const { Op, fn, col, literal } = require('sequelize');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

/**
 * Récupérer toutes les données analytics pour le dashboard admin
 */
router.get('/', async (req, res) => {
    const logData = {
        message: '',
        source: 'admin/analytics',
        userId: req.admin?.id,
        action: 'GET_ANALYTICS_DATA',
        ipAddress: req.ip,
        requestData: null,
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // 📅 Configuration des périodes
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const sixtyDaysAgo = new Date(now.getTime() - (60 * 24 * 60 * 60 * 1000));
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

        // 📊 1. MÉTRIQUES PRINCIPALES
        const [
            currentRequestsCount,
            previousRequestsCount,
            currentInvoicesCount,
            previousInvoicesCount,
            currentRevenue,
            previousRevenue,
            currentActiveClients,
            previousActiveClients
        ] = await Promise.all([
            // Demandes actuelles (30 derniers jours)
            Request.count({
                where: { created_at: { [Op.gte]: thirtyDaysAgo } }
            }),
            // Demandes précédentes (30 jours avant)
            Request.count({
                where: {
                    created_at: {
                        [Op.gte]: sixtyDaysAgo,
                        [Op.lt]: thirtyDaysAgo
                    }
                }
            }),
            // Factures actuelles
            Invoice.count({
                where: { created_at: { [Op.gte]: thirtyDaysAgo } }
            }),
            // Factures précédentes
            Invoice.count({
                where: {
                    created_at: {
                        [Op.gte]: sixtyDaysAgo,
                        [Op.lt]: thirtyDaysAgo
                    }
                }
            }),
            // Revenus actuels
            Payment.sum('amount_paid', {
                where: { created_at: { [Op.gte]: thirtyDaysAgo } }
            }),
            // Revenus précédents
            Payment.sum('amount_paid', {
                where: {
                    created_at: {
                        [Op.gte]: sixtyDaysAgo,
                        [Op.lt]: thirtyDaysAgo
                    }
                }
            }),
            // Clients actifs actuels (avec des demandes dans les 30 derniers jours)
            Client.count({
                include: [{
                    model: Request,
                    as: 'requests',
                    where: { created_at: { [Op.gte]: thirtyDaysAgo } },
                    required: true
                }]
            }),
            // Clients actifs précédents
            Client.count({
                include: [{
                    model: Request,
                    as: 'requests',
                    where: {
                        created_at: {
                            [Op.gte]: sixtyDaysAgo,
                            [Op.lt]: thirtyDaysAgo
                        }
                    },
                    required: true
                }]
            })
        ]);

        // Calcul des pourcentages de changement
        const calculatePercentageChange = (current, previous) => {
            if (previous === 0) return current > 0 ? 100 : 0;
            return Math.round(((current - previous) / previous) * 100);
        };

        const metrics = {
            total_requests: {
                current: currentRequestsCount,
                previous: previousRequestsCount,
                percentage_change: calculatePercentageChange(currentRequestsCount, previousRequestsCount),
                trend: currentRequestsCount >= previousRequestsCount ? 'up' : 'down'
            },
            total_invoices: {
                current: currentInvoicesCount,
                previous: previousInvoicesCount,
                percentage_change: calculatePercentageChange(currentInvoicesCount, previousInvoicesCount),
                trend: currentInvoicesCount >= previousInvoicesCount ? 'up' : 'down'
            },
            total_revenue: {
                current: Math.round((currentRevenue || 0) * 100), // conversion en centimes
                currency: 'EUR',
                previous: Math.round((previousRevenue || 0) * 100),
                percentage_change: calculatePercentageChange(currentRevenue || 0, previousRevenue || 0),
                trend: (currentRevenue || 0) >= (previousRevenue || 0) ? 'up' : 'down'
            },
            active_clients: {
                current: currentActiveClients,
                previous: previousActiveClients,
                percentage_change: calculatePercentageChange(currentActiveClients, previousActiveClients),
                trend: currentActiveClients >= previousActiveClients ? 'up' : 'down'
            }
        };

        // 📈 2. ÉVOLUTION HEBDOMADAIRE (7 derniers jours)
        const weeklyData = await Promise.all([
            // Demandes par jour
            Request.findAll({
                attributes: [
                    [fn('DATE', col('created_at')), 'date'],
                    [fn('COUNT', col('id')), 'count']
                ],
                where: { created_at: { [Op.gte]: sevenDaysAgo } },
                group: [fn('DATE', col('created_at'))],
                order: [[fn('DATE', col('created_at')), 'ASC']]
            }),
            // Factures par jour
            Invoice.findAll({
                attributes: [
                    [fn('DATE', col('created_at')), 'date'],
                    [fn('COUNT', col('id')), 'count']
                ],
                where: { created_at: { [Op.gte]: sevenDaysAgo } },
                group: [fn('DATE', col('created_at'))],
                order: [[fn('DATE', col('created_at')), 'ASC']]
            }),
            // Revenus par jour
            Payment.findAll({
                attributes: [
                    [fn('DATE', col('created_at')), 'date'],
                    [fn('SUM', col('amount_paid')), 'total']
                ],
                where: { created_at: { [Op.gte]: sevenDaysAgo } },
                group: [fn('DATE', col('created_at'))],
                order: [[fn('DATE', col('created_at')), 'ASC']]
            })
        ]);

        // Formatage des données hebdomadaires
        const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
            last7Days.push(date.toISOString().split('T')[0]);
        }

        const formatWeeklyData = (data, field = 'count') => {
            return last7Days.map(date => {
                const dayData = data.find(item => item.dataValues.date === date);
                return dayData ? parseInt(dayData.dataValues[field]) : 0;
            });
        };

        const weekly_evolution = {
            labels: dayLabels,
            datasets: {
                requests: formatWeeklyData(weeklyData[0]),
                invoices: formatWeeklyData(weeklyData[1]),
                revenue: formatWeeklyData(weeklyData[2], 'total').map(amount => Math.round(amount * 100)) // centimes
            }
        };

        // 🥧 3. RÉPARTITION DES DEMANDES PAR STATUT
        const requestsDistribution = await Request.findAll({
            attributes: [
                'status',
                [fn('COUNT', col('id')), 'count']
            ],
            where: { created_at: { [Op.gte]: thirtyDaysAgo } },
            group: ['status']
        });

        const totalRequests = requestsDistribution.reduce((sum, item) => sum + parseInt(item.dataValues.count), 0);
        const requests_distribution = {};

        // Mappage des statuts français vers anglais pour le frontend
        const statusMapping = {
            'en_attente': 'pending',
            'en_traitement': 'in_progress',
            'facturé': 'completed',
            'annulé': 'cancelled'
        };

        requestsDistribution.forEach(item => {
            const status = item.dataValues.status;
            const count = parseInt(item.dataValues.count);
            const mappedStatus = statusMapping[status] || status;

            requests_distribution[mappedStatus] = {
                count,
                percentage: totalRequests > 0 ? Math.round((count / totalRequests) * 100 * 10) / 10 : 0
            };
        });

        // 💳 4. RÉPARTITION DES MÉTHODES DE PAIEMENT
        const paymentMethods = await Payment.findAll({
            attributes: [
                'method',
                [fn('COUNT', col('id')), 'count'],
                [fn('SUM', col('amount_paid')), 'total_amount']
            ],
            where: { created_at: { [Op.gte]: thirtyDaysAgo } },
            group: ['method']
        });

        const totalPayments = paymentMethods.reduce((sum, item) => sum + parseInt(item.dataValues.count), 0);
        const payment_methods = {};

        // Mappage des méthodes locales vers des noms génériques
        const methodMapping = {
            'wave': 'card',
            'momo': 'card',
            'orange_money': 'card',
            'zeepay': 'bank_transfer',
            'cash': 'cash'
        };

        paymentMethods.forEach(item => {
            const method = item.dataValues.method;
            const count = parseInt(item.dataValues.count);
            const amount = Math.round(parseFloat(item.dataValues.total_amount || 0) * 100);
            const mappedMethod = methodMapping[method] || method;

            if (!payment_methods[mappedMethod]) {
                payment_methods[mappedMethod] = { count: 0, amount: 0, percentage: 0 };
            }

            payment_methods[mappedMethod].count += count;
            payment_methods[mappedMethod].amount += amount;
        });

        // Calcul des pourcentages pour les méthodes de paiement
        Object.keys(payment_methods).forEach(method => {
            payment_methods[method].percentage = totalPayments > 0
                ? Math.round((payment_methods[method].count / totalPayments) * 100 * 10) / 10
                : 0;
        });

        // 📱 5. ACTIVITÉ RÉCENTE
        const recentActivities = await Promise.all([
            // Nouvelles demandes
            Request.findAll({
                include: [{
                    model: Client,
                    as: 'client',
                    attributes: ['full_name', 'whatsapp_number']
                }],
                order: [['created_at', 'DESC']],
                limit: 5
            }),
            // Paiements récents
            Payment.findAll({
                include: [{
                    model: Invoice,
                    as: 'invoice',
                    attributes: ['id', 'total_amount']
                }],
                order: [['created_at', 'DESC']],
                limit: 5
            }),
            // Nouveaux clients
            Client.findAll({
                order: [['created_at', 'DESC']],
                limit: 3
            })
        ]);

        const recent_activity = [];

        // Formatter les activités récentes
        recentActivities[0].forEach(request => {
            recent_activity.push({
                id: `req_${request.id}`,
                type: 'request_created',
                title: 'Nouvelle demande créée',
                description: `Demande #${request.id.slice(-4)} • Client ${request.client?.full_name || request.client?.whatsapp_number || 'Inconnu'}`,
                timestamp: request.created_at,
                icon_type: 'plus',
                color: 'blue'
            });
        });

        recentActivities[1].forEach(payment => {
            recent_activity.push({
                id: `pay_${payment.id}`,
                type: 'payment_received',
                title: 'Paiement reçu',
                description: `€${(parseFloat(payment.amount_paid)).toFixed(2)} • Facture #${payment.invoice?.id.slice(-4)}`,
                timestamp: payment.created_at,
                icon_type: 'check',
                color: 'green'
            });
        });

        recentActivities[2].forEach(client => {
            recent_activity.push({
                id: `cli_${client.id}`,
                type: 'client_registered',
                title: 'Nouveau client inscrit',
                description: client.full_name || client.whatsapp_number,
                timestamp: client.created_at,
                icon_type: 'user',
                color: 'purple'
            });
        });

        // Trier par date décroissante et limiter à 10
        recent_activity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const limitedActivity = recent_activity.slice(0, 10);

        // 📊 6. STATISTIQUES ADDITIONNELLES
        const [avgInvoiceAmount, completionRateData, topClients] = await Promise.all([
            // Montant moyen des factures
            Invoice.findOne({
                attributes: [[fn('AVG', col('total_amount')), 'avg_amount']],
                where: { created_at: { [Op.gte]: thirtyDaysAgo } }
            }),
            // Taux de completion (demandes terminées vs total)
            Request.findAll({
                attributes: [
                    'status',
                    [fn('COUNT', col('id')), 'count']
                ],
                where: { created_at: { [Op.gte]: thirtyDaysAgo } },
                group: ['status']
            }),
            // Top 3 clients par montant - requête simplifiée
            Payment.findAll({
                attributes: [
                    [col('invoice.request.client.full_name'), 'client_name'],
                    [col('invoice.request.client.whatsapp_number'), 'client_whatsapp'],
                    [fn('SUM', col('amount_paid')), 'total_amount']
                ],
                include: [{
                    model: Invoice,
                    as: 'invoice',
                    attributes: [],
                    include: [{
                        model: Request,
                        as: 'request',
                        attributes: [],
                        include: [{
                            model: Client,
                            as: 'client',
                            attributes: []
                        }]
                    }]
                }],
                where: { created_at: { [Op.gte]: thirtyDaysAgo } },
                group: [
                    col('invoice.request.client.id'),
                    col('invoice.request.client.full_name'),
                    col('invoice.request.client.whatsapp_number')
                ],
                order: [[fn('SUM', col('amount_paid')), 'DESC']],
                limit: 3,
                raw: true
            })
        ]);

        const completedStatuses = ['livré', 'payé'];
        const completedCount = completionRateData
            .filter(item => completedStatuses.includes(item.dataValues.status))
            .reduce((sum, item) => sum + parseInt(item.dataValues.count), 0);
        const totalRequestsForCompletion = completionRateData
            .reduce((sum, item) => sum + parseInt(item.dataValues.count), 0);

        const additional_stats = {
            average_invoice_amount: Math.round((parseFloat(avgInvoiceAmount?.dataValues?.avg_amount || 0)) * 100),
            completion_rate: totalRequestsForCompletion > 0
                ? Math.round((completedCount / totalRequestsForCompletion) * 100 * 10) / 10
                : 0,
            response_time_hours: 24, // Valeur fixe, peut être calculée selon la logique métier
            top_clients: topClients.map(client => ({
                name: client.client_name || client.client_whatsapp,
                total_amount: Math.round((parseFloat(client.total_amount || 0)) * 100)
            }))
        };

        // 📊 Préparation de la réponse finale
        const responseData = {
            metrics,
            weekly_evolution,
            requests_distribution,
            payment_methods,
            recent_activity: limitedActivity,
            additional_stats,
            metadata: {
                generated_at: now.toISOString(),
                period: 'last_30_days',
                total_records_analyzed: currentRequestsCount + currentInvoicesCount + (await Payment.count({ where: { created_at: { [Op.gte]: thirtyDaysAgo } } }))
            }
        };

        logData.message = 'Données analytics récupérées avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            metrics_count: Object.keys(metrics).length,
            activities_count: limitedActivity.length,
            period: '30_days'
        };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Données analytics récupérées avec succès', responseData);

    } catch (error) {
        logData.message = 'Erreur lors de la récupération des données analytics';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;