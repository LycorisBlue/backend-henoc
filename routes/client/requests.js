const express = require('express');
const router = express.Router();
const { Client, Request, ProductLink, ProductImage } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const FileManager = require('../../utils/FileManager');
const upload = require('../../middlewares/upload');
const { v4: uuidv4 } = require('uuid');

/**
 * Route pour soumettre une nouvelle demande client
 * Supporte multipart/form-data pour les images
 */
router.post('/', upload.fields([{ name: 'images', maxCount: 5 }]), async (req, res) => {
    const { whatsapp_number, request_type, product_links, description } = req.body;
    const uploadedFiles = req.files?.images || [];

    const logData = {
        message: '',
        source: 'client/requests',
        userId: null,
        action: 'CREATE_REQUEST',
        ipAddress: req.ip,
        requestData: {
            whatsapp_number,
            request_type,
            has_product_links: !!product_links,
            has_images: uploadedFiles.length > 0,
            has_description: !!description
        },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Validation des données
        if (!whatsapp_number) {
            FileManager.cleanupUploadedFiles(uploadedFiles);
            logData.message = 'Numéro WhatsApp manquant';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'MISSING_WHATSAPP_NUMBER' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Le numéro WhatsApp est obligatoire', logData.responseData);
        }

        // Vérifier que request_type est fourni et valide
        if (!request_type || !['link', 'image'].includes(request_type)) {
            FileManager.cleanupUploadedFiles(uploadedFiles);
            logData.message = 'Type de demande invalide';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_REQUEST_TYPE' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(
                res,
                'Le type de demande doit être "link" ou "image"',
                logData.responseData
            );
        }

        // Validation selon le type de demande
        if (request_type === 'link') {
            // Pour les liens : vérifier qu'au moins un lien est fourni
            if (!product_links || (Array.isArray(product_links) && product_links.length === 0)) {
                FileManager.cleanupUploadedFiles(uploadedFiles);
                logData.message = 'Aucun lien produit fourni';
                logData.status = 'FAILED';
                logData.responseData = { errorType: 'MISSING_PRODUCT_LINKS' };
                await Logger.logEvent(logData);
                return ApiResponse.badRequest(
                    res,
                    'Au moins un lien de produit est requis pour une demande de type "link"',
                    logData.responseData
                );
            }

            // Vérifier que product_links est un tableau
            if (!Array.isArray(product_links)) {
                FileManager.cleanupUploadedFiles(uploadedFiles);
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
        } else if (request_type === 'image') {
            // Pour les images : vérifier qu'au moins une image est uploadée
            if (uploadedFiles.length === 0) {
                logData.message = 'Aucune image fournie';
                logData.status = 'FAILED';
                logData.responseData = { errorType: 'MISSING_IMAGES' };
                await Logger.logEvent(logData);
                return ApiResponse.badRequest(
                    res,
                    'Au moins une image est requise pour une demande de type "image" (max 5)',
                    logData.responseData
                );
            }

            // Vérifier le nombre maximum d'images
            if (uploadedFiles.length > 5) {
                FileManager.cleanupUploadedFiles(uploadedFiles);
                logData.message = 'Trop d\'images';
                logData.status = 'FAILED';
                logData.responseData = { errorType: 'TOO_MANY_IMAGES' };
                await Logger.logEvent(logData);
                return ApiResponse.badRequest(
                    res,
                    'Maximum 5 images autorisées',
                    logData.responseData
                );
            }
        }

        // Valider le format du numéro WhatsApp
        const whatsappRegex = /^\+\d{10,15}(\/\+\d{10,15})?$/;
        if (!whatsappRegex.test(whatsapp_number)) {
            FileManager.cleanupUploadedFiles(uploadedFiles);
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

        // Création de la demande avec request_type
        const request = await Request.create({
            client_id: client.id,
            description: description || null,
            request_type: request_type,
            status: 'en_attente'
        });

        let createdLinks = [];
        let createdImages = [];

        // Créer les liens produits si type = 'link'
        if (request_type === 'link' && product_links && product_links.length > 0) {
            const linkPromises = product_links.map(url =>
                ProductLink.create({
                    request_id: request.id,
                    url
                })
            );
            createdLinks = await Promise.all(linkPromises);
        }

        // Créer les images si type = 'image'
        if (request_type === 'image' && uploadedFiles.length > 0) {
            // Récupérer les descriptions des images depuis le body (optionnel)
            const imagesDescriptions = req.body.images_descriptions || [];

            const imagePromises = uploadedFiles.map((file, index) => {
                const relativePath = `uploads/requests/${file.filename}`;
                return ProductImage.create({
                    request_id: request.id,
                    file_path: relativePath,
                    file_name: file.originalname,
                    file_size: file.size,
                    mime_type: file.mimetype,
                    description: imagesDescriptions[index] || null
                });
            });
            createdImages = await Promise.all(imagePromises);
        }

        // Préparer la réponse
        const responseData = {
            request_id: request.id,
            request_type: request.request_type,
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
            })),
            product_images: createdImages.map(image => ({
                id: image.id,
                file_name: image.file_name,
                file_size: image.file_size,
                mime_type: image.mime_type,
                url: FileManager.getPublicUrl(image.file_path),
                description: image.description
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
        // Nettoyer les fichiers uploadés en cas d'erreur
        FileManager.cleanupUploadedFiles(uploadedFiles);

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