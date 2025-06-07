// routes/admin/client-management.js
const express = require('express');
const router = express.Router();
const { Client } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

/**
 * Vérifier si un numéro WhatsApp est déjà enregistré
 */
router.get('/check-whatsapp/:number', async (req, res) => {
    const whatsappNumber = req.params.number;
    const adminId = req.admin.id;

    const logData = {
        message: '',
        source: 'admin/client-management',
        userId: adminId,
        action: 'CHECK_WHATSAPP_INFO',
        ipAddress: req.ip,
        requestData: { whatsapp_number: whatsappNumber },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Validation du format du numéro
        if (!/^\+\d{10,15}(\/\+\d{10,15})?$/.test(whatsappNumber)) {
            logData.message = 'Format du numéro WhatsApp invalide';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_WHATSAPP_NUMBER_FORMAT' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(
                res,
                'Format du numéro WhatsApp invalide. Utilisez le format international (ex: +2250102030405 ou +2250102030405/+2250102030406)',
                logData.responseData
            );
        }

        // Rechercher le client par son numéro WhatsApp
        const client = await Client.findOne({
            where: { whatsapp_number: whatsappNumber }
        });

        // Vérifier si les informations du client sont complètes
        const hasCompleteInfo = client && (
            (client.full_name && client.full_name.trim() !== '') ||
            (client.email && client.email.trim() !== '') ||
            (client.adresse && client.adresse.trim() !== '')
        );

        // Préparer la réponse - exists indique si le client a des informations complètes
        const responseData = {
            whatsapp_number: whatsappNumber,
            exists: hasCompleteInfo, // Modification ici: exists reflète si des informations complètes existent
            client: client ? {
                id: client.id,
                full_name: client.full_name || null,
                email: client.email || null,
                adresse: client.adresse || null,
                created_at: client.created_at
            } : null
        };

        logData.message = 'Vérification des informations du numéro WhatsApp effectuée';
        logData.status = 'SUCCESS';
        logData.responseData = {
            exists: hasCompleteInfo, // Cohérent avec la réponse
            client_in_database: !!client
        };
        await Logger.logEvent(logData);

        let message;
        if (!client) {
            message = 'Le numéro WhatsApp n\'est pas enregistré';
        } else if (hasCompleteInfo) {
            message = 'Le numéro WhatsApp a des informations complètes enregistrées';
        } else {
            message = 'Le numéro WhatsApp est enregistré mais les informations sont incomplètes';
        }

        return ApiResponse.success(res, message, responseData);

    } catch (error) {
        logData.message = 'Erreur lors de la vérification des informations du numéro WhatsApp';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(
            res,
            'Une erreur est survenue lors de la vérification des informations du numéro WhatsApp',
            { error: error.message }
        );
    }
});

/**
 * Enregistrer ou mettre à jour les informations d'un client par son numéro WhatsApp
 */
router.post('/register-client', async (req, res) => {
    const { whatsapp_number, full_name, email, adresse } = req.body;
    const adminId = req.admin.id;

    const logData = {
        message: '',
        source: 'admin/client-management',
        userId: adminId,
        action: 'REGISTER_UPDATE_CLIENT',
        ipAddress: req.ip,
        requestData: {
            whatsapp_number,
            has_full_name: !!full_name,
            has_email: !!email,
            has_adresse: !!adresse
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Validation des données obligatoires
        if (!whatsapp_number) {
            logData.message = 'Numéro WhatsApp manquant';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'MISSING_WHATSAPP_NUMBER' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(
                res,
                'Le numéro WhatsApp est obligatoire',
                logData.responseData
            );
        }

        // Validation du format du numéro WhatsApp
        if (!/^\+\d{10,15}$/.test(whatsapp_number)) {
            logData.message = 'Format du numéro WhatsApp invalide';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_WHATSAPP_NUMBER_FORMAT' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(
                res,
                'Format du numéro WhatsApp invalide. Utilisez le format international (ex: +2250102030405)',
                logData.responseData
            );
        }

        // Validation de l'email si fourni
        if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            logData.message = 'Format d\'email invalide';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_EMAIL_FORMAT' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(
                res,
                'Format d\'email invalide',
                logData.responseData
            );
        }

        // Rechercher si le client existe déjà
        let client = await Client.findOne({
            where: { whatsapp_number }
        });

        let isNewClient = false;

        // Si le client n'existe pas, le créer
        if (!client) {
            client = await Client.create({
                whatsapp_number,
                full_name: full_name || null,
                email: email || null,
                adresse: adresse || null
            });
            isNewClient = true;
        } else {
            // Si le client existe, mettre à jour ses informations
            const updateData = {};
            if (full_name !== undefined) updateData.full_name = full_name;
            if (email !== undefined) updateData.email = email;
            if (adresse !== undefined) updateData.adresse = adresse;

            // Ne mettre à jour que si des données sont fournies
            if (Object.keys(updateData).length > 0) {
                await client.update(updateData);
            }
        }

        // Préparer la réponse
        const responseData = {
            client: {
                id: client.id,
                whatsapp_number: client.whatsapp_number,
                full_name: client.full_name,
                email: client.email,
                adresse: client.adresse,
                created_at: client.created_at,
                updated_at: client.updated_at
            },
            is_new_client: isNewClient
        };

        logData.message = isNewClient
            ? 'Nouveau client enregistré avec succès'
            : 'Informations du client mises à jour avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            client_id: client.id,
            is_new_client: isNewClient
        };
        await Logger.logEvent(logData);

        return ApiResponse.success(
            res,
            logData.message,
            responseData
        );

    } catch (error) {
        logData.message = 'Erreur lors de l\'enregistrement/mise à jour du client';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(
            res,
            'Une erreur est survenue lors de l\'enregistrement/mise à jour du client',
            { error: error.message }
        );
    }
});

module.exports = router;