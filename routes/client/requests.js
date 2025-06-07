const express = require('express');
const router = express.Router();
const { Client, Request, ProductLink } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Route pour soumettre une nouvelle demande client
 */
router.post('/', async (req, res) => {
    const { whatsapp_number, product_links, description } = req.body;

    const logData = {
        message: '',
        source: 'client/requests',
        userId: null,
        action: 'CREATE_REQUEST',
        ipAddress: req.ip,
        requestData: {
            whatsapp_number,
            has_product_links: !!product_links,
            has_description: !!description
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Validation des données
        if (!whatsapp_number) {
            logData.message = 'Numéro WhatsApp manquant';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'MISSING_WHATSAPP_NUMBER' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Le numéro WhatsApp est obligatoire', logData.responseData);
        }

        // Vérifier que soit product_links soit description soit fourni
        if ((!product_links || !product_links.length) && !description) {
            logData.message = 'Aucun produit ou description fourni';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'MISSING_PRODUCT_INFORMATION' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(
                res,
                'Veuillez fournir au moins un lien de produit ou une description',
                logData.responseData
            );
        }

        // Vérifier que product_links est un tableau si fourni
        if (product_links && !Array.isArray(product_links)) {
            logData.message = 'Format des liens produits invalide';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_PRODUCT_LINKS_FORMAT' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(
                res,
                'Les liens de produits doivent être fournis sous forme de tableau',
                logData.responseData
            );
        }

        // Valider le format du numéro WhatsApp
        const whatsappRegex = /^\+\d{10,15}(\/\+\d{10,15})?$/;
        if (!whatsappRegex.test(whatsapp_number)) {
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

        // Trouver ou créer le client par son numéro WhatsApp
        let [client, clientCreated] = await Client.findOrCreate({
            where: { whatsapp_number },
            defaults: { whatsapp_number }
        });

        // Création de la demande
        const request = await Request.create({
            client_id: client.id,
            description: description || null,
            status: 'en_attente'
        });

        // Si des liens produits sont fournis, les créer
        let createdLinks = [];
        if (product_links && product_links.length > 0) {
            const linkPromises = product_links.map(url =>
                ProductLink.create({
                    request_id: request.id,
                    url
                })
            );
            createdLinks = await Promise.all(linkPromises);
        }

        // Préparer la réponse
        const responseData = {
            request_id: request.id,
            status: request.status,
            client: {
                id: client.id,
                whatsapp_number: client.whatsapp_number,
                is_new_client: clientCreated
            },
            description: request.description,
            product_links: createdLinks.map(link => ({
                id: link.id,
                url: link.url
            }))
        };

        logData.message = 'Demande créée avec succès';
        logData.status = 'SUCCESS';
        logData.userId = client.id;
        logData.responseData = { request_id: request.id };
        await Logger.logEvent(logData);

        return ApiResponse.created(
            res,
            'Votre demande a été soumise avec succès',
            responseData
        );

    } catch (error) {
        logData.message = 'Erreur lors de la création de la demande';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(
            res,
            'Une erreur est survenue lors du traitement de votre demande',
            { error: error.message }
        );
    }
});

module.exports = router;