// routes/admin/generate-invoice-pdf.js
const express = require('express');
const router = express.Router();
const { Invoice, InvoiceItem, InvoiceFee, Request, Client, Admin, FeeType } = require('../../models');
const PdfService = require('../../services/PdfService');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

/**
 * Générer le PDF d'une facture
 */
router.get('/:id/pdf', async (req, res) => {
    const invoiceId = req.params.id;
    const adminId = req.admin.id;

    const logData = {
        message: '',
        source: 'admin/generate-invoice-pdf',
        userId: adminId,
        action: 'GENERATE_INVOICE_PDF',
        ipAddress: req.ip,
        requestData: { invoice_id: invoiceId },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Récupérer la facture avec toutes ses relations
        const invoice = await Invoice.findByPk(invoiceId, {
            include: [
                {
                    model: Request,
                    as: 'request',
                    include: [
                        {
                            model: Client,
                            as: 'client',
                            attributes: ['id', 'whatsapp_number', 'full_name', 'email', 'adresse']
                        }
                    ]
                },
                {
                    model: Admin,
                    as: 'admin',
                    attributes: ['id', 'name', 'email']
                },
                {
                    model: InvoiceItem,
                    as: 'items'
                },
                {
                    model: InvoiceFee,
                    as: 'fees',
                    include: [
                        {
                            model: FeeType,
                            as: 'type',
                            attributes: ['name', 'description']
                        }
                    ]
                }
            ]
        });

        if (!invoice) {
            logData.message = 'Facture introuvable';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVOICE_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Facture introuvable');
        }

        // Vérifier les permissions (admin peut voir ses factures, superadmin toutes)
        if (req.admin.role !== 'superadmin' && invoice.admin_id !== adminId) {
            logData.message = 'Accès non autorisé à cette facture';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'ACCESS_DENIED' };
            await Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, 'Accès non autorisé');
        }

        // Structurer les données pour le PDF
        const invoiceData = {
            invoice: {
                id: invoice.id,
                total_amount: invoice.total_amount,
                status: invoice.status,
                created_at: invoice.createdAt
            },
            client: {
                full_name: invoice.request?.client?.full_name,
                whatsapp_number: invoice.request?.client?.whatsapp_number,
                email: invoice.request?.client?.email,
                adresse: invoice.request?.client?.adresse
            },
            items: invoice.items?.map(item => ({
                name: item.name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                subtotal: item.subtotal
            })) || [],
            fees: invoice.fees?.map(fee => ({
                name: fee.type?.name || 'Frais',
                amount: fee.amount
            })) || []
        };

        // Validation des données requises
        if (!invoiceData.items.length) {
            logData.message = 'Aucun article dans la facture';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'NO_ITEMS' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'La facture ne contient aucun article');
        }

        // Génération du PDF
        const pdfBuffer = await PdfService.generateInvoicePdf(invoiceData);

        // Validation du buffer
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('PDF buffer vide ou invalide');
        }

        // Configuration des en-têtes de réponse
        const filename = `facture_${invoice.id}_${new Date().toISOString().split('T')[0]}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        res.setHeader('Cache-Control', 'no-cache');

        logData.message = 'PDF généré avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = {
            filename,
            size: pdfBuffer.length,
            items_count: invoiceData.items.length
        };
        await Logger.logEvent(logData);

        return res.end(pdfBuffer, 'binary');

    } catch (error) {
        logData.message = 'Erreur lors de la génération du PDF';
        logData.status = 'FAILED';
        logData.responseData = {
            error: error.message,
            errorType: 'PDF_GENERATION_ERROR'
        };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur lors de la génération du PDF', {
            error: error.message
        });
    }
});

module.exports = router;