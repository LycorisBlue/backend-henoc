// services/PdfService.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;

class PdfService {
    constructor() {
        this.browser = null;
        this.templatesPath = path.join(__dirname, '../templates');
    }

    /**
     * Initialise le navigateur Puppeteer
     */
    async initBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        }
        return this.browser;
    }

    /**
     * Ferme le navigateur
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    /**
     * Charge un template HTML
     */
    async loadTemplate(templateName) {
        const templatePath = path.join(this.templatesPath, templateName);
        return await fs.readFile(templatePath, 'utf-8');
    }

    /**
     * Génère un PDF de facture
     */
    async generateInvoicePdf(invoiceData) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            await page.setViewport({ width: 595, height: 842 });

            const htmlContent = await this.generateInvoiceHtml(invoiceData);

            await page.setContent(htmlContent, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            const pdfOptions = {
                format: 'A5',
                printBackground: true,
                margin: {
                    top: '15mm',
                    right: '10mm',
                    bottom: '20mm',
                    left: '10mm'
                },
                displayHeaderFooter: true,
                headerTemplate: this.getHeaderTemplate(),
                footerTemplate: this.getFooterTemplate()
            };

            const pdfBuffer = await page.pdf(pdfOptions);
            return pdfBuffer;

        } finally {
            await page.close();
        }
    }

    /**
     * Génère le HTML complet de la facture
     */
    async generateInvoiceHtml(data) {
        const { items, client, invoice, fees = [] } = data;
        const itemsPerPage = 7;
        const totalPages = Math.ceil(items.length / itemsPerPage);

        const baseTemplate = await this.loadTemplate('invoice.html');
        const pageTemplate = await this.loadTemplate('invoice-page.html');

        let pagesContent = '';

        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            const startIndex = pageIndex * itemsPerPage;
            const endIndex = Math.min(startIndex + itemsPerPage, items.length);
            const pageItems = items.slice(startIndex, endIndex);
            const isLastPage = pageIndex === totalPages - 1;
            const isFirstPage = pageIndex === 0;

            pagesContent += this.buildPageContent(
                pageTemplate,
                pageItems,
                client,
                invoice,
                fees,
                pageIndex + 1,
                totalPages,
                isLastPage,
                isFirstPage
            );
        }

        return baseTemplate.replace('{{PAGES_CONTENT}}', pagesContent);
    }

    /**
     * Construit le contenu d'une page
     */
    buildPageContent(template, items, client, invoice, fees, pageNumber, totalPages, isLastPage, isFirstPage) {
        let pageHtml = template;

        // Informations facture
        pageHtml = pageHtml.replace('{{INVOICE_ID}}', invoice.id);
        pageHtml = pageHtml.replace('{{INVOICE_DATE}}', this.formatDate(invoice.created_at));
        pageHtml = pageHtml.replace('{{INVOICE_STATUS}}', this.getStatusLabel(invoice.status));
        pageHtml = pageHtml.replace('{{PAGE_NUMBER}}', pageNumber);
        pageHtml = pageHtml.replace('{{TOTAL_PAGES}}', totalPages);

        // Informations client (uniquement première page)
        const clientInfo = isFirstPage ? this.buildClientInfo(client) : '';
        pageHtml = pageHtml.replace('{{CLIENT_INFO}}', clientInfo);

        // Lignes d'articles
        const itemsRows = items.map(item => `
            <tr>
                <td>${item.name}</td>
                <td class="text-center">${item.quantity}</td>
                <td class="text-right">${this.formatCurrency(item.unit_price)}</td>
                <td class="text-right">${this.formatCurrency(item.subtotal)}</td>
            </tr>
        `).join('');
        pageHtml = pageHtml.replace('{{ITEMS_ROWS}}', itemsRows);

        // Section totaux (uniquement dernière page)
        const totalsSection = isLastPage ? this.buildTotalsSection(invoice, fees) : '';
        pageHtml = pageHtml.replace('{{TOTALS_SECTION}}', totalsSection);

        return pageHtml;
    }

    /**
     * Construit les informations client
     */
    buildClientInfo(client) {
        return `
            <div class="client-info">
                <h3>Facturé à :</h3>
                <div><strong>${client.full_name || 'Client'}</strong></div>
                <div>WhatsApp: ${client.whatsapp_number || 'N/A'}</div>
                ${client.email ? `<div>Email: ${client.email}</div>` : ''}
                ${client.adresse ? `<div>Adresse: ${client.adresse}</div>` : ''}
            </div>
        `;
    }

    /**
     * Construit la section des totaux
     */
    buildTotalsSection(invoice, fees) {
        const subtotal = parseFloat(invoice.total_amount);
        const totalFees = fees.reduce((sum, fee) => sum + parseFloat(fee.amount), 0);
        const total = subtotal + totalFees;

        let totalsHtml = `
            <div class="totals-section">
                <div class="total-line">
                    <span>Sous-total:</span>
                    <span>${this.formatCurrency(subtotal)}</span>
                </div>
        `;

        fees.forEach(fee => {
            totalsHtml += `
                <div class="total-line">
                    <span>${fee.name || 'Frais'}:</span>
                    <span>${this.formatCurrency(fee.amount)}</span>
                </div>
            `;
        });

        totalsHtml += `
                <div class="total-line final">
                    <span>TOTAL:</span>
                    <span>${this.formatCurrency(total)}</span>
                </div>
            </div>
            <div style="clear: both;"></div>
        `;

        return totalsHtml;
    }

    /**
     * Template d'en-tête
     */
    getHeaderTemplate() {
        return `
            <div style="font-size: 8px; padding: 5px 10px; width: 100%; text-align: center; color: #666;">
                <img src="data:image/svg+xml;base64,${this.getLogoBase64()}" style="height: 20px; margin-right: 10px;">
                Excellence & Innovation - Votre partenaire de confiance
            </div>
        `;
    }

    /**
     * Template de pied de page
     */
    getFooterTemplate() {
        return `
            <div style="font-size: 8px; padding: 5px 10px; width: 100%; text-align: center; color: #666; border-top: 1px solid #ddd;">
                "L'excellence n'est pas un acte, mais une habitude" - Votre Entreprise
            </div>
        `;
    }

    /**
     * Logo en base64
     */
    getLogoBase64() {
        const logoSvg = `
            <svg width="40" height="20" xmlns="http://www.w3.org/2000/svg">
                <rect width="40" height="20" fill="#2c5aa0"/>
                <text x="20" y="15" font-family="Arial" font-size="8" fill="white" text-anchor="middle">LOGO</text>
            </svg>
        `;
        return Buffer.from(logoSvg).toString('base64');
    }

    /**
     * Formate les montants
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
        }).format(parseFloat(amount) || 0);
    }

    /**
     * Formate les dates
     */
    formatDate(date) {
        return new Date(date).toLocaleDateString('fr-FR');
    }

    /**
     * Libellé du statut
     */
    getStatusLabel(status) {
        const labels = {
            'pending': 'En attente',
            'paid': 'Payée',
            'overdue': 'Échue'
        };
        return labels[status] || status;
    }
}

module.exports = new PdfService();