const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// Créer le dossier uploads s'il n'existe pas
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'requests');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuration du stockage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Générer un nom de fichier unique : {uuid}-{timestamp}.{extension}
        const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// Validation des fichiers
const fileFilter = (req, file, cb) => {
    // Types MIME acceptés
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

    // Extensions acceptées
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimeTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Type de fichier non autorisé. Formats acceptés : ${allowedExtensions.join(', ')}`), false);
    }
};

// Configuration de multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20 Mo au total
        files: 5 // Maximum 5 fichiers
    }
});

module.exports = upload;
