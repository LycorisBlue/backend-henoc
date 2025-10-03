const fs = require('fs');
const path = require('path');
const { ProductImage } = require('../models');

class FileManager {
    /**
     * Supprimer un fichier physique
     * @param {string} filePath - Chemin relatif du fichier (ex: 'uploads/requests/image.jpg')
     * @returns {boolean} - True si supprimé, false sinon
     */
    static deleteFile(filePath) {
        try {
            const fullPath = path.join(__dirname, '..', 'public', filePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Erreur lors de la suppression du fichier:', error);
            return false;
        }
    }

    /**
     * Supprimer toutes les images d'une demande
     * @param {string} requestId - ID de la demande
     * @returns {Promise<number>} - Nombre de fichiers supprimés
     */
    static async deleteRequestFiles(requestId) {
        try {
            const images = await ProductImage.findAll({
                where: { request_id: requestId }
            });

            let deletedCount = 0;
            for (const image of images) {
                if (this.deleteFile(image.file_path)) {
                    deletedCount++;
                }
                await image.destroy();
            }

            return deletedCount;
        } catch (error) {
            console.error('Erreur lors de la suppression des fichiers de la demande:', error);
            return 0;
        }
    }

    /**
     * Valider un fichier image
     * @param {Object} file - Objet fichier de multer
     * @returns {Object} - { valid: boolean, error: string|null }
     */
    static validateImageFile(file) {
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        const maxSize = 20 * 1024 * 1024; // 20 Mo

        if (!file) {
            return { valid: false, error: 'Aucun fichier fourni' };
        }

        // Vérifier le type MIME
        if (!allowedMimeTypes.includes(file.mimetype)) {
            return { valid: false, error: `Type MIME non autorisé: ${file.mimetype}` };
        }

        // Vérifier l'extension
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return { valid: false, error: `Extension non autorisée: ${ext}` };
        }

        // Vérifier la taille
        if (file.size > maxSize) {
            return { valid: false, error: `Fichier trop volumineux: ${(file.size / 1024 / 1024).toFixed(2)} Mo (max: 20 Mo)` };
        }

        return { valid: true, error: null };
    }

    /**
     * Générer l'URL publique d'un fichier
     * @param {string} filePath - Chemin relatif du fichier
     * @returns {string} - URL publique
     */
    static getPublicUrl(filePath) {
        // Retourner le chemin relatif pour l'API
        // Le frontend ajoutera le domaine
        return `/${filePath}`;
    }

    /**
     * Nettoyer les fichiers uploadés en cas d'erreur
     * @param {Array} files - Tableau de fichiers multer
     */
    static cleanupUploadedFiles(files) {
        if (!files || !Array.isArray(files)) return;

        files.forEach(file => {
            try {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            } catch (error) {
                console.error('Erreur lors du nettoyage du fichier:', error);
            }
        });
    }

    /**
     * Obtenir des informations sur un fichier
     * @param {string} filePath - Chemin complet du fichier
     * @returns {Object|null} - Informations sur le fichier ou null
     */
    static getFileInfo(filePath) {
        try {
            if (!fs.existsSync(filePath)) return null;

            const stats = fs.statSync(filePath);
            return {
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                extension: path.extname(filePath)
            };
        } catch (error) {
            console.error('Erreur lors de la récupération des informations du fichier:', error);
            return null;
        }
    }
}

module.exports = FileManager;
