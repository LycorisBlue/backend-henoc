// routes/admin/request-status.js (avec vérification d'assignation)
const express = require('express');
const router = express.Router();
const { Request, RequestStatusLog, Client } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

/**
 * Mettre à jour le statut d'une demande
 */
router.put('/:id/status', async (req, res) => {
    const requestId = req.params.id;
    const adminId = req.admin.id;
    const adminRole = req.admin.role;
    const { status, comment } = req.body;

    const logData = {
        message: '',
        source: 'admin/request-status',
        userId: adminId,
        action: 'UPDATE_REQUEST_STATUS',
        ipAddress: req.ip,
        requestData: {
            request_id: requestId,
            new_status: status,
            has_comment: !!comment
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Vérifier la présence du statut
        if (!status) {
            logData.message = 'Statut non fourni';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'MISSING_STATUS' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Le statut est requis', logData.responseData);
        }

        // Vérifier si la demande existe avec le client associé
        const request = await Request.findByPk(requestId, {
            include: [{
                model: Client,
                as: 'client',
                attributes: ['id', 'whatsapp_number', 'full_name']
            }]
        });

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
            return ApiResponse.unauthorized(res, 'Vous n\'êtes pas autorisé à modifier le statut de cette demande car vous n\'y êtes pas assigné', logData.responseData);
        }

        // Vérifier si le statut est valide
        const validStatuses = ['en_attente', 'en_traitement', 'facturé', 'payé', 'commandé', 'expédié', 'livré', 'annulé'];
        if (!validStatuses.includes(status)) {
            logData.message = 'Statut invalide';
            logData.status = 'FAILED';
            logData.responseData = {
                errorType: 'INVALID_STATUS',
                validStatuses
            };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, `Statut invalide. Valeurs acceptées: ${validStatuses.join(', ')}`, logData.responseData);
        }

        // Vérifier si le statut est différent du statut actuel
        if (request.status === status) {
            logData.message = 'La demande est déjà dans ce statut';
            logData.status = 'SUCCESS'; // C'est un succès car l'état final est celui désiré
            logData.responseData = { request_id: requestId, status };
            await Logger.logEvent(logData);
            return ApiResponse.success(res, 'La demande est déjà dans ce statut', {
                request_id: request.id,
                status: request.status
            });
        }

        // Vérifications spécifiques selon le statut demandé
        if (status === 'facturé' && !request.invoice) {
            logData.message = 'Impossible de passer au statut facturé sans facture associée';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'NO_INVOICE' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Impossible de passer la demande au statut "facturé" car aucune facture n\'est associée', logData.responseData);
        }

        // Si passe à un statut actif, vérifier qu'un admin est assigné
        if (['en_traitement', 'facturé', 'payé', 'commandé', 'expédié'].includes(status) && !request.assigned_admin_id) {
            // Si ce n'est pas le cas, assigner automatiquement à l'admin actuel
            await request.update({ assigned_admin_id: adminId });

            // Ajouter une entrée dans le journal pour l'assignation automatique
            await RequestStatusLog.create({
                request_id: requestId,
                previous_status: request.status,
                new_status: request.status, // Le statut n'a pas encore changé
                comment: 'Assignation automatique lors du changement de statut',
                admin_id: adminId
            });
        }

        // Enregistrer l'ancien statut avant la mise à jour
        const previousStatus = request.status;

        // Mettre à jour le statut de la demande
        await request.update({ status });

        // Créer une entrée dans le journal des statuts
        await RequestStatusLog.create({
            request_id: requestId,
            previous_status: previousStatus,
            new_status: status,
            comment: comment || `Statut mis à jour de "${previousStatus}" à "${status}"`,
            admin_id: adminId
        });

        logData.message = 'Statut de la demande mis à jour avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            request_id: requestId,
            previous_status: previousStatus,
            new_status: status
        };
        await Logger.logEvent(logData);

        // Préparer la réponse avec le client pour une meilleure visibilité
        const responseData = {
            request_id: request.id,
            previous_status: previousStatus,
            new_status: status,
            client: {
                id: request.client.id,
                whatsapp_number: request.client.whatsapp_number,
                full_name: request.client.full_name
            },
            assigned_admin_id: request.assigned_admin_id
        };

        return ApiResponse.success(res, 'Statut de la demande mis à jour avec succès', responseData);
    } catch (error) {
        logData.message = 'Erreur lors de la mise à jour du statut de la demande';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;