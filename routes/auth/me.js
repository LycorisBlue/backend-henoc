const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middlewares/auth');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

router.get('/', authenticate(), async (req, res) => {
    const logData = {
        message: '',
        source: 'me',
        userId: req.admin?.id,
        action: 'GET_ADMIN_INFO',
        ipAddress: req.ip,
        requestData: null,
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // L'administrateur est déjà disponible dans req.admin grâce au middleware authenticate

        // Extraction des informations pertinentes de l'administrateur
        const adminData = {
            id: req.admin.id,
            name: req.admin.name,
            email: req.admin.email,
            role: req.admin.role
        };

        // Informations sur le token en fonction du rôle
        let tokenInfo = {};
        if (req.admin.role === 'superadmin') {
            tokenInfo = {
                expiration: '1h',
                canRefresh: false
            };
        } else {
            tokenInfo = {
                expiration: '1d',
                canRefresh: true
            };
        }

        const responseData = {
            admin: adminData,
            token: tokenInfo
        };

        logData.message = 'Informations administrateur récupérées avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = responseData;
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Informations administrateur récupérées', responseData);

    } catch (error) {
        logData.message = 'Erreur lors de la récupération des informations administrateur';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;