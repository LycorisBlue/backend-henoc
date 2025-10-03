// routes/client/request-details.js
const express = require('express');
const router = express.Router();
const { Client, Request, ProductLink, ProductImage, Admin, RequestStatusLog } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const FileManager = require('../../utils/FileManager');

/**
 * Route pour consulter les détails d'une demande spécifique
 */
router.get('/:id', async (req, res) => {
    const requestId = req.params.id;
    const whatsappNumber = req.query.whatsapp_number; // Optionnel pour vérification

    const logData = {
        message: '',
        source: 'client/request-details',
        userId: null,
        action: 'GET_REQUEST_DETAILS',
        ipAddress: req.ip,
        requestData: {
            request_id: requestId,
            whatsapp_number: whatsappNumber || 'non fourni'
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Récupérer la demande avec toutes les relations nécessaires
        const request = await Request.findByPk(requestId, {
            include: [
                {
                    model: Client,
                    as: 'client',
                    attributes: ['id', 'whatsapp_number', 'full_name']
                },
                {
                    model: ProductLink,
                    as: 'product_links',
                    attributes: ['id', 'url', 'note', 'created_at']
                },
                {
                    model: ProductImage,
                    as: 'product_images',
                    attributes: ['id', 'file_path', 'file_name', 'file_size', 'mime_type', 'description', 'created_at']
                },
                {
                    model: Admin,
                    as: 'assigned_admin',
                    attributes: ['id', 'name']
                }
            ]
        });

        // Vérifier si la demande existe
        if (!request) {
            logData.message = 'Demande non trouvée';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'REQUEST_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Demande non trouvée', logData.responseData);
        }

        // Vérification optionnelle du numéro WhatsApp
        if (whatsappNumber && request.client.whatsapp_number !== whatsappNumber) {
            logData.message = 'Numéro WhatsApp ne correspond pas à cette demande';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'WHATSAPP_NUMBER_MISMATCH' };
            await Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, 'Vous n\'êtes pas autorisé à consulter cette demande', logData.responseData);
        }

        // Récupérer l'historique des statuts
        const statusHistory = await RequestStatusLog.findAll({
            where: { request_id: requestId },
            attributes: ['previous_status', 'new_status', 'comment', 'created_at'],
            order: [['created_at', 'ASC']]
        });
        console.log('Status History:', request);

        // Construire la réponse
        const responseData = {
            id: request.id,
            whatsapp_number: request.client.whatsapp_number,
            client_name: request.client.full_name || null,
            request_type: request.request_type,
            product_links: request.product_links.map(link => ({
                id: link.id,
                url: link.url,
                note: link.note,
                created_at: link.created_at
            })),
            product_images: request.product_images.map(image => ({
                id: image.id,
                file_name: image.file_name,
                file_size: image.file_size,
                mime_type: image.mime_type,
                url: FileManager.getPublicUrl(image.file_path),
                description: image.description,
                created_at: image.created_at
            })),
            description: request.description,
            status: request.status,
            created_at: request.createdAt,
            assigned_admin: request.assigned_admin ? {
                id: request.assigned_admin.id,
                name: request.assigned_admin.name
            } : null,
            status_history: statusHistory.map(log => ({
                from: log.previous_status || 'initial',
                to: log.new_status,
                comment: log.comment,
                date: log.createdAt
            }))
        };

        logData.message = 'Détails de la demande récupérés avec succès';
        logData.status = 'SUCCESS';
        logData.userId = request.client.id;
        logData.responseData = { request_id: request.id };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Détails de la demande', responseData);

    } catch (error) {
        logData.message = 'Erreur lors de la récupération des détails de la demande';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(
            res,
            'Une erreur est survenue lors de la récupération des détails de la demande',
            { error: error.message }
        );
    }
});

module.exports = router;