// routes/admin/request-assign.js
const express = require('express');
const router = express.Router();
const { Request, RequestStatusLog } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

/**
 * Assigner une demande à un administrateur (généralement l'administrateur connecté)
 */
router.put('/:id/assign', async (req, res) => {
    const requestId = req.params.id;
    const adminId = req.admin.id;
    const { admin_id } = req.body; // Optionnel: permettre d'assigner à un autre admin
    const targetAdminId = admin_id || adminId; // Par défaut, assigner à l'admin qui fait la requête

    const logData = {
        message: '',
        source: 'admin/request-assign',
        userId: adminId,
        action: 'ASSIGN_REQUEST',
        ipAddress: req.ip,
        requestData: {
            request_id: requestId,
            assigning_admin_id: adminId,
            target_admin_id: targetAdminId
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Vérifier si la demande existe
        const request = await Request.findByPk(requestId);
        if (!request) {
            logData.message = 'Demande non trouvée';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'REQUEST_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Demande non trouvée', logData.responseData);
        }

        // Si c'est un admin standard qui tente d'assigner la demande à un autre admin
        if (adminId !== targetAdminId && req.admin.role !== 'superadmin') {
            logData.message = 'Permission insuffisante pour assigner la demande à un autre administrateur';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INSUFFICIENT_PERMISSIONS' };
            await Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, 'Seul un superadmin peut assigner une demande à un autre administrateur', logData.responseData);
        }

        // Si la demande est déjà assignée à l'administrateur cible
        if (request.assigned_admin_id === targetAdminId) {
            logData.message = 'Demande déjà assignée à cet administrateur';
            logData.status = 'SUCCESS'; // C'est un succès car l'état final est celui désiré
            logData.responseData = { request_id: requestId, admin_id: targetAdminId };
            await Logger.logEvent(logData);
            return ApiResponse.success(res, 'Demande déjà assignée à cet administrateur', {
                request_id: request.id,
                assigned_admin_id: targetAdminId
            });
        }

        // Stocker l'ancien administrateur assigné pour le journal
        const previousAdminId = request.assigned_admin_id;

        // Assigner la demande à l'administrateur cible
        await request.update({ assigned_admin_id: targetAdminId });

        // Créer une entrée dans le journal des statuts si l'assignation change
        if (previousAdminId !== targetAdminId) {
            await RequestStatusLog.create({
                request_id: requestId,
                previous_status: request.status, // Le statut reste le même, seul l'admin change
                new_status: request.status,
                comment: previousAdminId
                    ? `Réassignation: de l'administrateur ${previousAdminId} à l'administrateur ${targetAdminId}`
                    : `Assignation à l'administrateur ${targetAdminId}`,
                admin_id: adminId // L'admin qui a fait l'action
            });
        }

        // Mettre à jour le statut si nécessaire (si la demande est en attente, la passer en traitement)
        let statusUpdated = false;
        if (request.status === 'en_attente') {
            await request.update({ status: 'en_traitement' });
            statusUpdated = true;

            // Ajouter une entrée dans le journal pour le changement de statut
            await RequestStatusLog.create({
                request_id: requestId,
                previous_status: 'en_attente',
                new_status: 'en_traitement',
                comment: 'Statut mis à jour automatiquement lors de l\'assignation',
                admin_id: adminId
            });
        }

        logData.message = 'Demande assignée avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            request_id: requestId,
            admin_id: targetAdminId,
            status_updated: statusUpdated
        };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Demande assignée avec succès', {
            request_id: request.id,
            assigned_admin_id: targetAdminId,
            previous_admin_id: previousAdminId,
            status: request.status,
            status_updated: statusUpdated
        });
    } catch (error) {
        logData.message = 'Erreur lors de l\'assignation de la demande';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;