const express = require('express');
const router = express.Router();
const { Admin, Token } = require('../../models');
const TokenManager = require('../../utils/TokenManager');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

router.post('/', async (req, res) => {
    const logData = {
        message: '',
        source: 'refresh',
        userId: null,
        action: 'TOKEN_REFRESH',
        ipAddress: req.ip,
        requestData: { refreshToken: '***' },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            logData.message = 'Token de rafraîchissement manquant';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'TOKEN_MISSING' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Token de rafraîchissement requis', logData.responseData);
        }

        // Vérifier la validité du token
        const tokenCheck = TokenManager.checkToken(refreshToken);
        if (!tokenCheck.isValid) {
            logData.message = 'Token de rafraîchissement invalide';
            logData.status = 'FAILED';
            logData.responseData = {
                errorType: tokenCheck.expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
                message: tokenCheck.message
            };
            await Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, 'Token de rafraîchissement invalide', logData.responseData);
        }

        // Récupérer le token dans la base de données
        const tokenRecord = await Token.findOne({
            where: {
                token: refreshToken,
                type: 'refresh',
                revoked: false
            }
        });

        if (!tokenRecord) {
            logData.message = 'Token de rafraîchissement révoqué ou inexistant';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'TOKEN_REVOKED' };
            await Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, 'Token de rafraîchissement révoqué', logData.responseData);
        }

        // Vérifier si le token est expiré
        if (new Date(tokenRecord.expires_at) < new Date()) {
            logData.message = 'Token de rafraîchissement expiré';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'TOKEN_EXPIRED' };
            await Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, 'Token de rafraîchissement expiré', logData.responseData);
        }

        // Récupérer l'administrateur
        const admin = await Admin.findByPk(tokenCheck.payload.adminId);
        if (!admin) {
            logData.message = 'Administrateur non trouvé';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'ADMIN_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Administrateur non trouvé', logData.responseData);
        }

        logData.userId = admin.id;

        // Révoquer les anciens tokens d'accès
        await Token.update(
            { revoked: true },
            {
                where: {
                    admin_id: admin.id,
                    type: 'access',
                    revoked: false
                }
            }
        );

        // Générer un nouveau token d'accès
        const accessToken = await TokenManager.generateAccessToken(admin);

        logData.message = 'Token rafraîchi avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { role: admin.role };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Token rafraîchi avec succès', {
            accessToken,
            role: admin.role
        });

    } catch (error) {
        logData.message = 'Erreur serveur lors du rafraîchissement du token';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;