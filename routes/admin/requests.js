// routes/admin/requests.js
const express = require('express');
const router = express.Router();
const { Request, Client, ProductLink } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const { Op } = require('sequelize');

/**
 * Récupérer la liste des demandes avec filtres optionnels
 */
router.get('/', async (req, res) => {
    // Récupération des paramètres de filtrage et pagination
    const {
        status,
        client_id,
        whatsapp_number,
        assigned_admin_id,
        unassigned,
        page = 1,
        limit = 10,
        sort_by = 'created_at',
        sort_order = 'DESC'
    } = req.query;

    const logData = {
        message: '',
        source: 'admin/requests',
        userId: req.admin?.id,
        action: 'LIST_REQUESTS',
        ipAddress: req.ip,
        requestData: {
            filters: { status, client_id, whatsapp_number, assigned_admin_id, unassigned },
            pagination: { page, limit },
            sorting: { sort_by, sort_order }
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Construction des conditions de filtrage
        const whereConditions = {};

        if (status) {
            whereConditions.status = status;
        }

        if (client_id) {
            whereConditions.client_id = client_id;
        }

        // Gérer le filtre par administrateur assigné ou non assigné
        if (unassigned === 'true') {
            whereConditions.assigned_admin_id = null;
        } else if (assigned_admin_id) {
            whereConditions.assigned_admin_id = assigned_admin_id;
        }

        // Configuration de la pagination
        const offset = (page - 1) * limit;
        const pageSize = parseInt(limit);

        // Configuration du tri
        const order = [[sort_by, sort_order]];

        // Options pour l'inclusion des relations
        const includeOptions = [
            {
                model: Client,
                as: 'client',
                attributes: ['id', 'whatsapp_number', 'full_name']
            }
        ];

        // Ajout du filtre sur le numéro WhatsApp si fourni
        if (whatsapp_number) {
            includeOptions[0].where = {
                whatsapp_number: {
                    [Op.like]: `%${whatsapp_number}%`
                }
            };
        }

        // Requête avec pagination, filtres et inclusion des relations
        const { count, rows: requests } = await Request.findAndCountAll({
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
            requests: requests.map(request => ({
                id: request.id,
                status: request.status,
                client: {
                    id: request.client.id,
                    whatsapp_number: request.client.whatsapp_number,
                    full_name: request.client.full_name
                },
                assigned_admin_id: request.assigned_admin_id,
                created_at: request.createdAt,
                updated_at: request.updatedAt
            })),
            pagination
        };

        logData.message = 'Liste des demandes récupérée avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { count, page, limit };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Liste des demandes', responseData);
    } catch (error) {
        logData.message = 'Erreur lors de la récupération des demandes';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;