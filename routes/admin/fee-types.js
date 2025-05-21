// routes/admin/fee-types.js
const express = require('express');
const router = express.Router();
const { FeeType } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

/**
 * Récupérer tous les types de frais (accessible aux admins et superadmins)
 */
router.get('/', async (req, res) => {
    const adminId = req.admin.id;

    const logData = {
        message: '',
        source: 'admin/fee-types',
        userId: adminId,
        action: 'LIST_FEE_TYPES',
        ipAddress: req.ip,
        requestData: null,
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Récupérer tous les types de frais
        const feeTypes = await FeeType.findAll({
            attributes: ['id', 'name', 'description', 'created_at'],
            order: [['name', 'ASC']]
        });

        logData.message = 'Liste des types de frais récupérée avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { count: feeTypes.length };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Liste des types de frais', feeTypes);
    } catch (error) {
        logData.message = 'Erreur lors de la récupération des types de frais';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;