// routes/admin/clients-list.js
const express = require('express');
const router = express.Router();
const { Client, Request } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const { Op, fn, col } = require('sequelize');

/**
 * Récupérer la liste des clients avec catégorisation
 */
router.get('/', async (req, res) => {
    const {
        category, // 'registered', 'unregistered', 'all'
        search,
        page = 1,
        limit = 10,
        sort_by = 'created_at',
        sort_order = 'DESC'
    } = req.query;

    const logData = {
        message: '',
        source: 'admin/clients-list',
        userId: req.admin?.id,
        action: 'LIST_CLIENTS',
        ipAddress: req.ip,
        requestData: { category, search, page, limit },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Construction des conditions de filtrage
        const whereConditions = {};

        // Filtrage par catégorie
        if (category === 'registered') {
            whereConditions[Op.or] = [
                { full_name: { [Op.not]: null, [Op.ne]: '' } },
                { email: { [Op.not]: null, [Op.ne]: '' } },
                { adresse: { [Op.not]: null, [Op.ne]: '' } }
            ];
        } else if (category === 'unregistered') {
            whereConditions[Op.and] = [
                { [Op.or]: [{ full_name: null }, { full_name: '' }] },
                { [Op.or]: [{ email: null }, { email: '' }] },
                { [Op.or]: [{ adresse: null }, { adresse: '' }] }
            ];
        }

        // Recherche textuelle
        if (search) {
            whereConditions[Op.or] = [
                { whatsapp_number: { [Op.like]: `%${search}%` } },
                { full_name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } }
            ];
        }

        // Configuration pagination
        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Récupération des clients avec compteur de demandes
        const { count: totalItems, rows: clients } = await Client.findAndCountAll({
            where: whereConditions,
            include: [
                {
                    model: Request,
                    as: 'requests',
                    attributes: ['id', 'status', 'created_at'],
                    required: false
                }
            ],
            limit: parseInt(limit),
            offset,
            order: [[sort_by, sort_order.toUpperCase()]],
            distinct: true
        });

        // Statistiques globales
        const stats = await Client.findAll({
            attributes: [
                [fn('COUNT', col('id')), 'total'],
                [fn('SUM', fn('CASE',
                    fn('WHEN',
                        {
                            [Op.or]: [
                                { full_name: { [Op.not]: null, [Op.ne]: '' } },
                                { email: { [Op.not]: null, [Op.ne]: '' } },
                                { adresse: { [Op.not]: null, [Op.ne]: '' } }
                            ]
                        }, 1, 0
                    )
                )), 'registered'],
                [fn('SUM', fn('CASE',
                    fn('WHEN',
                        {
                            [Op.and]: [
                                { [Op.or]: [{ full_name: null }, { full_name: '' }] },
                                { [Op.or]: [{ email: null }, { email: '' }] },
                                { [Op.or]: [{ adresse: null }, { adresse: '' }] }
                            ]
                        }, 1, 0
                    )
                )), 'unregistered']
            ],
            raw: true
        });

        // Configuration pagination
        const pagination = {
            current_page: parseInt(page),
            per_page: parseInt(limit),
            total_items: totalItems,
            total_pages: Math.ceil(totalItems / parseInt(limit)),
            has_next_page: parseInt(page) < Math.ceil(totalItems / parseInt(limit)),
            has_prev_page: parseInt(page) > 1
        };

        // Formatage des données
        const responseData = {
            clients: clients.map(client => {
                const isRegistered = (client.full_name && client.full_name.trim() !== '') ||
                    (client.email && client.email.trim() !== '') ||
                    (client.adresse && client.adresse.trim() !== '');

                const requestsCount = client.requests ? client.requests.length : 0;
                const lastRequestDate = client.requests && client.requests.length > 0
                    ? Math.max(...client.requests.map(r => new Date(r.created_at).getTime()))
                    : null;

                return {
                    id: client.id,
                    whatsapp_number: client.whatsapp_number,
                    full_name: client.full_name,
                    email: client.email,
                    adresse: client.adresse,
                    created_at: client.created_at,
                    updated_at: client.updated_at,
                    category: isRegistered ? 'registered' : 'unregistered',
                    requests_count: requestsCount,
                    last_request_date: lastRequestDate ? new Date(lastRequestDate).toISOString() : null,
                    recent_requests: client.requests ? client.requests
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .slice(0, 3)
                        .map(request => ({
                            id: request.id,
                            status: request.status,
                            created_at: request.created_at
                        })) : []
                };
            }),
            pagination,
            statistics: {
                total: parseInt(stats[0].total),
                registered: parseInt(stats[0].registered),
                unregistered: parseInt(stats[0].unregistered),
                registration_rate: stats[0].total > 0
                    ? Math.round((stats[0].registered / stats[0].total) * 100)
                    : 0
            }
        };

        logData.message = 'Liste des clients récupérée avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            count: totalItems,
            category: category || 'all',
            registered: parseInt(stats[0].registered),
            unregistered: parseInt(stats[0].unregistered)
        };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Liste des clients', responseData);

    } catch (error) {
        logData.message = 'Erreur lors de la récupération des clients';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;