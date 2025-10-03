// routes/admin/request-details.js (mise à jour avec clé de permission)
const express = require('express');
const router = express.Router();
const { Request, Client, ProductLink, ProductImage, Admin, RequestStatusLog, Invoice, Payment } = require('../../models');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');
const FileManager = require('../../utils/FileManager');

/**
 * Récupérer les détails d'une demande spécifique
 */
router.get('/:id', async (req, res) => {
    const requestId = req.params.id;
    const adminId = req.admin.id;
    const adminRole = req.admin.role;

    const logData = {
        message: '',
        source: 'admin/request-details',
        userId: adminId,
        action: 'GET_REQUEST_DETAILS',
        ipAddress: req.ip,
        requestData: { request_id: requestId },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Récupérer la demande avec toutes ses relations
        const request = await Request.findByPk(requestId, {
            include: [
                {
                    model: Client,
                    as: 'client',
                    attributes: ['id', 'whatsapp_number', 'full_name', 'email', 'adresse']
                },
                {
                    model: ProductLink,
                    as: 'product_links',
                    attributes: ['id', 'url', 'note', 'created_at']
                },
                {
                    model: ProductImage,
                    as: 'product_images',
                    attributes: ['id', 'file_path', 'file_name', 'file_size', 'mime_type', 'description', 'created_at']
                },
                {
                    model: Admin,
                    as: 'assigned_admin',
                    attributes: ['id', 'name', 'email']
                },
                {
                    model: Invoice,
                    as: 'invoice',
                    attributes: ['id', 'total_amount', 'status', 'created_at']
                }
            ]
        });

        // Vérifier si la demande existe
        if (!request) {
            logData.message = 'Demande non trouvée';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'REQUEST_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Demande non trouvée', logData.responseData);
        }

        // Déterminer si l'admin peut modifier cette demande
        // Un admin peut modifier s'il est superadmin ou s'il est assigné à la demande
        const canModify = adminRole === 'superadmin' || request.assigned_admin_id === adminId;

        // Récupérer l'historique des statuts
        const statusHistory = await RequestStatusLog.findAll({
            where: { request_id: requestId },
            include: [
                {
                    model: Admin,
                    as: 'admin',
                    attributes: ['id', 'name']
                }
            ],
            order: [['created_at', 'DESC']]
        });

        // Si une facture existe, récupérer les paiements associés
        let payments = [];
        if (request.invoice) {
            payments = await Payment.findAll({
                where: { invoice_id: request.invoice.id },
                include: [
                    {
                        model: Admin,
                        as: 'confirmer',
                        attributes: ['id', 'name']
                    }
                ],
                order: [['created_at', 'DESC']]
            });
        }

        // Construire la réponse complète
        const responseData = {
            id: request.id,
            description: request.description,
            request_type: request.request_type,
            status: request.status,
            created_at: request.createdAt,
            updated_at: request.updatedAt,
            // Ajouter la clé de permission
            permissions: {
                can_modify: canModify
            },
            client: {
                id: request.client.id,
                whatsapp_number: request.client.whatsapp_number,
                full_name: request.client.full_name,
                email: request.client.email,
                adresse: request.client.adresse
            },
            product_links: request.product_links.map(link => ({
                id: link.id,
                url: link.url,
                note: link.note,
                created_at: link.createdAt
            })),
            product_images: request.product_images.map(image => ({
                id: image.id,
                file_name: image.file_name,
                file_size: image.file_size,
                mime_type: image.mime_type,
                url: FileManager.getPublicUrl(image.file_path),
                description: image.description,
                created_at: image.createdAt
            })),
            assigned_admin: request.assigned_admin ? {
                id: request.assigned_admin.id,
                name: request.assigned_admin.name,
                email: request.assigned_admin.email,
                is_current_admin: request.assigned_admin.id === adminId
            } : null,
            invoice: request.invoice ? {
                id: request.invoice.id,
                total_amount: request.invoice.total_amount,
                status: request.invoice.status,
                created_at: request.invoice.createdAt,
                payments: payments.map(payment => ({
                    id: payment.id,
                    amount_paid: payment.amount_paid,
                    method: payment.method,
                    payment_date: payment.payment_date,
                    confirmed_by: payment.confirmer ? {
                        id: payment.confirmer.id,
                        name: payment.confirmer.name
                    } : null
                }))
            } : null,
            status_history: statusHistory.map(log => ({
                id: log.id,
                previous_status: log.previous_status,
                new_status: log.new_status,
                comment: log.comment,
                created_at: log.createdAt,
                admin: log.admin ? {
                    id: log.admin.id,
                    name: log.admin.name
                } : null
            }))
        };

        logData.message = 'Détails de la demande récupérés avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            request_id: requestId,
            can_modify: canModify
        };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Détails de la demande', responseData);
    } catch (error) {
        logData.message = 'Erreur lors de la récupération des détails de la demande';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;