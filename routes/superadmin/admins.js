// routes/superadmin/admins.js
const express = require('express');
const router = express.Router();
const { Admin } = require('../../models');
const bcrypt = require('bcrypt');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

/**
 * Récupérer la liste de tous les admins
 */
router.get('/', async (req, res) => {
    const logData = {
        message: '',
        source: 'superadmin/admins',
        userId: req.admin?.id,
        action: 'LIST_ALL_ADMINS',
        ipAddress: req.ip,
        requestData: null,
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        const admins = await Admin.findAll({
            attributes: ['id', 'name', 'email', 'role', 'created_at', 'updated_at']
        });

        logData.message = 'Liste des administrateurs récupérée avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { count: admins.length };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Liste des administrateurs', admins);
    } catch (error) {
        logData.message = 'Erreur lors de la récupération des administrateurs';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

/**
 * Créer un nouvel admin
 */
router.post('/', async (req, res) => {
    const { name, email, password, role } = req.body;

    const logData = {
        message: '',
        source: 'superadmin/admins',
        userId: req.admin?.id,
        action: 'CREATE_ADMIN',
        ipAddress: req.ip,
        requestData: { name, email, role },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Validation des données
        if (!name || !email || !password) {
            logData.message = 'Données manquantes';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'MISSING_REQUIRED_FIELDS' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Nom, email et mot de passe sont requis', logData.responseData);
        }

        // Validation de l'email
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            logData.message = 'Format d\'email invalide';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_EMAIL_FORMAT' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Format d\'email invalide', logData.responseData);
        }

        // Vérifier si l'email existe déjà
        const existingAdmin = await Admin.findOne({ where: { email } });
        if (existingAdmin) {
            logData.message = 'Email déjà utilisé';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'EMAIL_ALREADY_EXISTS' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Cet email est déjà utilisé', logData.responseData);
        }

        // Validation du rôle
        const validRoles = ['admin', 'superadmin'];
        if (role && !validRoles.includes(role)) {
            logData.message = 'Rôle invalide';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_ROLE', validRoles };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Rôle invalide. Valeurs acceptées: admin, superadmin', logData.responseData);
        }

        // Hashage du mot de passe
        const hashedPassword = await bcrypt.hash(password, 10);

        // Création de l'admin
        const admin = await Admin.create({
            name,
            email,
            password: hashedPassword,
            role: role || 'admin' // Par défaut 'admin' si non spécifié
        });

        // Préparer la réponse sans le mot de passe
        const adminData = {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
            created_at: admin.created_at
        };

        logData.message = 'Administrateur créé avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { admin_id: admin.id };
        await Logger.logEvent(logData);

        return ApiResponse.created(res, 'Administrateur créé avec succès', adminData);
    } catch (error) {
        logData.message = 'Erreur lors de la création de l\'administrateur';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

/**
 * Modifier un admin existant
 */
router.put('/:id', async (req, res) => {
    const adminId = req.params.id;
    const { name, email, password, role } = req.body;

    const logData = {
        message: '',
        source: 'superadmin/admins',
        userId: req.admin?.id,
        action: 'UPDATE_ADMIN',
        ipAddress: req.ip,
        requestData: { admin_id: adminId, name, email, role, password_changed: !!password },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Vérifier si l'admin existe
        const admin = await Admin.findByPk(adminId);
        if (!admin) {
            logData.message = 'Administrateur non trouvé';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'ADMIN_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Administrateur non trouvé', logData.responseData);
        }

        // Vérification de l'email s'il est modifié
        if (email && email !== admin.email) {
            // Validation du format
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                logData.message = 'Format d\'email invalide';
                logData.status = 'FAILED';
                logData.responseData = { errorType: 'INVALID_EMAIL_FORMAT' };
                await Logger.logEvent(logData);
                return ApiResponse.badRequest(res, 'Format d\'email invalide', logData.responseData);
            }

            // Vérifier si l'email existe déjà
            const existingAdmin = await Admin.findOne({ where: { email } });
            if (existingAdmin && existingAdmin.id !== adminId) {
                logData.message = 'Email déjà utilisé';
                logData.status = 'FAILED';
                logData.responseData = { errorType: 'EMAIL_ALREADY_EXISTS' };
                await Logger.logEvent(logData);
                return ApiResponse.badRequest(res, 'Cet email est déjà utilisé', logData.responseData);
            }
        }

        // Validation du rôle s'il est modifié
        if (role) {
            const validRoles = ['admin', 'superadmin'];
            if (!validRoles.includes(role)) {
                logData.message = 'Rôle invalide';
                logData.status = 'FAILED';
                logData.responseData = { errorType: 'INVALID_ROLE', validRoles };
                await Logger.logEvent(logData);
                return ApiResponse.badRequest(res, 'Rôle invalide. Valeurs acceptées: admin, superadmin', logData.responseData);
            }
        }

        // Préparer les données à mettre à jour
        const updateData = {};
        if (name) updateData.name = name;
        if (email) updateData.email = email;
        if (role) updateData.role = role;
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        // Mise à jour de l'admin
        await admin.update(updateData);

        // Préparer la réponse sans le mot de passe
        const adminData = {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: admin.role,
            updated_at: admin.updated_at
        };

        logData.message = 'Administrateur mis à jour avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { admin_id: admin.id };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Administrateur mis à jour avec succès', adminData);
    } catch (error) {
        logData.message = 'Erreur lors de la mise à jour de l\'administrateur';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

/**
 * Supprimer un admin
 */
router.delete('/:id', async (req, res) => {
    const adminId = req.params.id;
    const logData = {
        message: '',
        source: 'superadmin/admins',
        userId: req.admin?.id,
        action: 'DELETE_ADMIN',
        ipAddress: req.ip,
        requestData: { admin_id: adminId },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Vérifier si c'est le superadmin qui fait la requête
        if (req.admin.id === adminId) {
            logData.message = 'Un superadmin ne peut pas se supprimer lui-même';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'CANNOT_DELETE_SELF' };
            await Logger.logEvent(logData);
            return ApiResponse.badRequest(res, 'Vous ne pouvez pas supprimer votre propre compte', logData.responseData);
        }

        // Vérifier si l'admin existe
        const admin = await Admin.findByPk(adminId);
        if (!admin) {
            logData.message = 'Administrateur non trouvé';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'ADMIN_NOT_FOUND' };
            await Logger.logEvent(logData);
            return ApiResponse.notFound(res, 'Administrateur non trouvé', logData.responseData);
        }

        // Suppression de l'admin
        await admin.destroy();

        logData.message = 'Administrateur supprimé avec succès';
        logData.status = 'SUCCESS';
        logData.responseData = { admin_id: adminId };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Administrateur supprimé avec succès');
    } catch (error) {
        logData.message = 'Erreur lors de la suppression de l\'administrateur';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
});

module.exports = router;