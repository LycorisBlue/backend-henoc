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
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ]
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
        let template = await fs.readFile(templatePath, 'utf-8');

        // Remplacer le placeholder du logo
        const logoBase64 = await this.getCompanyLogoBase64();
        template = template.replace(/{{LOGO_BASE64}}/g, logoBase64);

        return template;
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
                <td style="font-weight: 500;">${item.name}</td>
                <td class="text-center" style="color: #E67E22; font-weight: bold;">${item.quantity}</td>
                <td class="text-right">${this.formatCurrency(item.unit_price)}</td>
                <td class="text-right" style="font-weight: bold; color: #D35400;">${this.formatCurrency(item.subtotal)}</td>
            </tr>
        `).join('');
        pageHtml = pageHtml.replace('{{ITEMS_ROWS}}', itemsRows);

        // Section totaux (uniquement dernière page)
        const totalsSection = isLastPage ? this.buildTotalsSection(invoice, fees) : '';
        pageHtml = pageHtml.replace('{{TOTALS_SECTION}}', totalsSection);

        // Note de bas de page (uniquement dernière page)
        const footerNote = isLastPage ? this.buildFooterNote() : '';
        pageHtml = pageHtml.replace('{{FOOTER_NOTE}}', footerNote);

        return pageHtml;
    }

    /**
     * Construit les informations client
     */
    buildClientInfo(client) {
        return `
            <div class="client-info">
                <h3>Facturé à :</h3>
                <div class="client-details">
                    <div style="font-weight: bold; margin-bottom: 5px;">${client.full_name || 'Client'}</div>
                    <div>WhatsApp: ${client.whatsapp_number || 'N/A'}</div>
                    ${client.email ? `<div>Email: ${client.email}</div>` : ''}
                    ${client.adresse ? `<div>Adresse: ${client.adresse}</div>` : ''}
                </div>
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
                    <span>Sous-total articles:</span>
                    <span>${this.formatCurrency(subtotal)}</span>
                </div>
        `;

        fees.forEach(fee => {
            totalsHtml += `
                <div class="total-line">
                    <span>${fee.name}:</span>
                    <span>${this.formatCurrency(fee.amount)}</span>
                </div>
            `;
        });

        totalsHtml += `
                <div class="total-line final">
                    <span>TOTAL À PAYER:</span>
                    <span>${this.formatCurrency(total)}</span>
                </div>
            </div>
            <div style="clear: both;"></div>
        `;

        return totalsHtml;
    }

    /**
     * Construit la note de bas de page
     */
    buildFooterNote() {
        return `
            <div class="footer-note">
                <strong>Mon Fournisseur 2.0</strong> - Merci de votre confiance !<br>
                Cette facture est générée électroniquement et ne nécessite pas de signature.<br>
                Pour toute question concernant cette facture, contactez-nous au +225 XX XX XX XX
            </div>
        `;
    }

    /**
     * Template d'en-tête
     */
    getHeaderTemplate() {
        return `
            <div style="font-size: 8px; padding: 5px 10px; width: 100%; text-align: center; color: #E67E22; border-bottom: 1px solid #E67E22;">
                <strong>Mon Fournisseur 2.0</strong> - Excellence & Innovation - Votre partenaire logistique de confiance
            </div>
        `;
    }

    /**
     * Template de pied de page
     */
    getFooterTemplate() {
        return `
            <div style="font-size: 8px; padding: 5px 10px; width: 100%; text-align: center; color: #D35400; border-top: 1px solid #E67E22;">
                "Ensemble, faisons grandir votre business" - Mon Fournisseur 2.0 | www.monfournisseur2.com
            </div>
        `;
    }

    /**
     * Logo de l'entreprise en base64
     */
    async getCompanyLogoBase64() {
        try {
            const logoPath = path.join(__dirname, '../assets/logo.png');
            const logoBuffer = await fs.readFile(logoPath);
            return logoBuffer.toString('base64');
        } catch (error) {
            // Fallback : logo SVG simple si fichier manquant
            return this.getFallbackLogoBase64();
        }
    }

    /**
     * Logo de fallback en SVG
     */
    getFallbackLogoBase64() {
        const logoSvg = `
            <svg width="60" height="60" xmlns="http://www.w3.org/2000/svg">
                <circle cx="30" cy="30" r="28" fill="#E67E22" stroke="#D35400" stroke-width="2"/>
                <rect x="20" y="22" width="12" height="8" fill="#D35400" rx="1"/>
                <rect x="18" y="32" width="16" height="4" fill="#D35400" rx="1"/>
                <text x="30" y="45" font-family="Arial" font-size="8" fill="white" text-anchor="middle" font-weight="bold">MF2.0</text>
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