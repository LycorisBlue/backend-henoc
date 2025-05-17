const { Log } = require('../models');

class Logger {
    /**
     * Enregistre un événement dans la base de données Logs.
     * @param {Object} data - Données du log à enregistrer
     */
    static async logEvent(data) {
        try {
            await Log.create({
                message: data.message || 'Événement sans message',
                source: data.source || 'non défini',
                admin_id: data.userId || null,
                action: data.action || 'non défini',
                ip_address: data.ipAddress || null,
                request_data: data.requestData || null,
                response_data: data.responseData || null,
                status: data.status || 'PENDING',
                environment: process.env.NODE_ENV || 'development',
                device_info: typeof data.deviceInfo === 'string' ? { raw: data.deviceInfo } : data.deviceInfo || {}
            });
        } catch (error) {
            console.error('Échec de l’enregistrement du log:', error.message);
            // Optionnel : écrire dans un fichier log local ici
        }
    }

    /**
     * Logger simplifié (log technique uniquement console)
     * @param {string} message - Message à afficher
     * @param {'info'|'warn'|'error'} level - Niveau de log
     */
    static simple(message, level = 'info') {
        const prefix = `[Logger ${new Date().toISOString()}]`;

        switch (level) {
            case 'warn':
                console.warn(`${prefix} ⚠️  ${message}`);
                break;
            case 'error':
                console.error(`${prefix} ❌ ${message}`);
                break;
            default:
                console.log(`${prefix} ✅ ${message}`);
                break;
        }
    }
}

module.exports = Logger;
