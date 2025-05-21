// routes/superadmin/fee-types.js
const express = require('express');
const router = express.Router();
const { FeeType, InvoiceFee } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

/**
 * Créer un nouveau type de frais (réservé aux superadmins)
 */
router.post('/', async (req, res) => {
    const { name, description } = req.body;
    const adminId = req.admin.id;

    const logData = {
        message: '',
        source: 'superadmin/fee-types',
        userId: adminId,
        action: 'CREATE_FEE_TYPE',
        ipAddress: req.ip,
        requestData: { name, description },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Validation des données
        if (!name) {
            logData.message = 'Nom du type de frais manquant';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'MISSING_NAME' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Le nom du type de frais est obligatoire', logData.responseData);
        }

        // Vérifier si un type de frais avec ce nom existe déjà
        const existingFeeType = await FeeType.findOne({ where: { name } });
        if (existingFeeType) {
            logData.message = 'Type de frais déjà existant';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'FEE_TYPE_ALREADY_EXISTS' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Un type de frais avec ce nom existe déjà', logData.responseData);
        }

        // Création du type de frais
        const feeType = await FeeType.create({
            name,
            description: description || null,
            created_by: adminId
        });

        // Préparation de la réponse
        const responseData = {
            id: feeType.id,
            name: feeType.name,
            description: feeType.description,
            created_by: adminId,
            created_at: feeType.created_at
        };

        logData.message = 'Type de frais créé avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { fee_type_id: feeType.id };
        await Logger.logEvent(logData);

        return ApiResponse.created(res, 'Type de frais créé avec succès', responseData);
    } catch (error) {
        logData.message = 'Erreur lors de la création du type de frais';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

/**
 * Modifier un type de frais existant (réservé aux superadmins)
 */
router.put('/:id', async (req, res) => {
    const feeTypeId = req.params.id;
    const { name, description } = req.body;
    const adminId = req.admin.id;

    const logData = {
        message: '',
        source: 'superadmin/fee-types',
        userId: adminId,
        action: 'UPDATE_FEE_TYPE',
        ipAddress: req.ip,
        requestData: { fee_type_id: feeTypeId, name, description },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Vérifier si le type de frais existe
        const feeType = await FeeType.findByPk(feeTypeId);
        if (!feeType) {
            logData.message = 'Type de frais non trouvé';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'FEE_TYPE_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Type de frais non trouvé', logData.responseData);
        }

        // Vérifier si un autre type de frais avec le même nom existe déjà
        if (name && name !== feeType.name) {
            const existingFeeType = await FeeType.findOne({ where: { name } });
            if (existingFeeType && existingFeeType.id !== feeTypeId) {
                logData.message = 'Type de frais déjà existant avec ce nom';
                logData.status = 'FAILED';
                logData.responseData = { errorType: 'FEE_TYPE_NAME_ALREADY_EXISTS' };
                await Logger.logEvent(logData);
                return ApiResponse.badRequest(res, 'Un autre type de frais avec ce nom existe déjà', logData.responseData);
            }
        }

        // Préparer les données à mettre à jour
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;

        // Ne mettre à jour que si des données sont fournies
        if (Object.keys(updateData).length === 0) {
            logData.message = 'Aucune donnée fournie pour la mise à jour';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'NO_DATA_PROVIDED' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Aucune donnée fournie pour la mise à jour', logData.responseData);
        }

        // Mise à jour du type de frais
        await feeType.update(updateData);

        // Préparation de la réponse
        const responseData = {
            id: feeType.id,
            name: feeType.name,
            description: feeType.description,
            created_by: feeType.created_by,
            updated_at: feeType.updated_at
        };

        logData.message = 'Type de frais mis à jour avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { fee_type_id: feeType.id };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Type de frais mis à jour avec succès', responseData);
    } catch (error) {
        logData.message = 'Erreur lors de la mise à jour du type de frais';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

/**
 * Supprimer un type de frais (réservé aux superadmins)
 */
router.delete('/:id', async (req, res) => {
    const feeTypeId = req.params.id;
    const adminId = req.admin.id;

    const logData = {
        message: '',
        source: 'superadmin/fee-types',
        userId: adminId,
        action: 'DELETE_FEE_TYPE',
        ipAddress: req.ip,
        requestData: { fee_type_id: feeTypeId },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Vérifier si le type de frais existe
        const feeType = await FeeType.findByPk(feeTypeId);
        if (!feeType) {
            logData.message = 'Type de frais non trouvé';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'FEE_TYPE_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Type de frais non trouvé', logData.responseData);
        }

        // Vérifier si le type de frais est utilisé dans des factures
        const invoiceFeeCount = await InvoiceFee.count({ where: { fee_type_id: feeTypeId } });

        if (invoiceFeeCount > 0) {
            logData.message = 'Type de frais utilisé dans des factures';
            logData.status = 'FAILED';
            logData.responseData = {
                errorType: 'FEE_TYPE_IN_USE',
                usage_count: invoiceFeeCount
            };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(
                res,
                `Ce type de frais est utilisé dans ${invoiceFeeCount} facture(s) et ne peut pas être supprimé`,
                logData.responseData
            );
        }

        // Suppression du type de frais
        await feeType.destroy();

        logData.message = 'Type de frais supprimé avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { fee_type_id: feeTypeId };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Type de frais supprimé avec succès', {
            id: feeTypeId,
            name: feeType.name
        });
    } catch (error) {
        logData.message = 'Erreur lors de la suppression du type de frais';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;