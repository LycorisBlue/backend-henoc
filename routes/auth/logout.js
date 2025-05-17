const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middlewares/auth');
const ApiResponse = require('../../utils/ApiResponse');
const TokenManager = require('../../utils/TokenManager');
const Logger = require('../../utils/Logger');

router.post('/', authenticate(), async (req, res) => {
    const logData = {
        message: '',
        source: 'logout',
        userId: req.admin?.id,
        action: 'LOGOUT',
        ipAddress: req.ip,
        requestData: null,
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Utiliser le token qui a déjà été extrait et vérifié par le middleware d'authentification
        const token = req.token;

        if (!token) {
            logData.message = 'Token manquant';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'TOKEN_MISSING' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Token non fourni', logData.responseData);
        }

        // Révoquer le token actuel
        const tokenRevoked = await TokenManager.revokeToken(token);

        if (!tokenRevoked) {
            logData.message = 'Erreur lors de la révocation du token';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'TOKEN_REVOCATION_ERROR' };
            await Logger.logEvent(logData);
            return ApiResponse.serverError(res, 'Erreur lors de la déconnexion', logData.responseData);
        }

        // Révoquer tous les tokens de l'administrateur
        await TokenManager.revokeAllTokens(req.admin.id);

        logData.message = 'Déconnexion réussie';
        logData.status = 'SUCCESS';
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Déconnexion réussie');

    } catch (error) {
        logData.message = 'Erreur lors de la déconnexion';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;