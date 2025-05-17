const { Admin, Token } = require('../models');
const TokenManager = require('../utils/TokenManager');
const Logger = require('../utils/Logger');
const ApiResponse = require('../utils/ApiResponse');

/**
 * Middleware d'authentification JWT pour les admins.
 */
const authenticate = () => {
    return async (req, res, next) => {
        const logData = {
            message: '',
            source: 'authenticate',
            userId: null,
            action: 'Token Verification',
            ipAddress: req.ip,
            requestData: null,
            responseData: null,
            status: 'PENDING',
            deviceInfo: req.headers['user-agent'] || 'Unknown Device'
        };

        const authHeader = req.header('Authorization');
        const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : null;

        if (!token) {
            logData.message = 'Token manquant';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'TOKEN_MISSING' };
            await Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, logData.message, logData.responseData);
        }

        try {
            const result = TokenManager.checkToken(token);

            if (!result.isValid) {
                logData.message = result.expired ? result.message : 'Token invalide';
                logData.status = 'FAILED';
                logData.userId = result.payload?.adminId;
                logData.responseData = {
                    errorType: result.expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
                    expired: result.expired,
                    role: result.payload?.role
                };
                await Logger.logEvent(logData);
                return ApiResponse.unauthorized(res, logData.message, logData.responseData);
            }

            const tokenRecord = await Token.findOne({
                where: {
                    token,
                    admin_id: result.payload.adminId,
                    revoked: false
                }
            });

            if (!tokenRecord || new Date(tokenRecord.expires_at) < new Date()) {
                if (tokenRecord) await TokenManager.revokeToken(token);

                logData.message = 'Token expiré ou révoqué';
                logData.status = 'FAILED';
                logData.userId = result.payload.adminId;
                logData.responseData = {
                    errorType: 'TOKEN_EXPIRED_OR_REVOKED',
                    expired: true
                };
                await Logger.logEvent(logData);
                return ApiResponse.unauthorized(res, logData.message, logData.responseData);
            }

            const admin = await Admin.findByPk(result.payload.adminId);

            if (!admin) {
                logData.message = 'Admin non trouvé';
                logData.status = 'FAILED';
                logData.userId = result.payload.adminId;
                logData.responseData = { errorType: 'ADMIN_NOT_FOUND' };
                await Logger.logEvent(logData);
                return ApiResponse.notFound(res, logData.message, logData.responseData);
            }

            req.admin = admin;
            req.role = admin.role;
            req.token = token;

            logData.message = 'Authentification réussie';
            logData.userId = admin.id;
            logData.status = 'SUCCESS';
            await Logger.logEvent(logData);

            next();
        } catch (error) {
            logData.message = 'Erreur serveur';
            logData.status = 'FAILED';
            logData.responseData = {
                error: error.message,
                errorType: 'SERVER_ERROR'
            };
            await Logger.logEvent(logData);
            return ApiResponse.serverError(res, logData.message, logData.responseData);
        }
    };
};

/**
 * Middleware d’autorisation basé sur les rôles.
 * @param {string[]} roles - Rôles autorisés, ex : ['admin'], ['superadmin'], etc.
 */
const authorize = (roles) => {
    return (req, res, next) => {
        const logData = {
            message: '',
            source: 'authorize',
            userId: req.admin?.id,
            action: 'Role Authorization',
            ipAddress: req.ip,
            requestData: null,
            responseData: null,
            status: 'PENDING',
            deviceInfo: req.headers['user-agent'] || 'Unknown Device'
        };

        if (!req.admin) {
            logData.message = 'Non authentifié';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'UNAUTHORIZED' };
            Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, logData.message, logData.responseData);
        }

        if (!roles.includes(req.admin.role)) {
            logData.message = 'Rôle insuffisant';
            logData.status = 'FAILED';
            logData.responseData = {
                errorType: 'INSUFFICIENT_PRIVILEGES',
                requiredRoles: roles,
                userRole: req.admin.role
            };
            Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, logData.message, logData.responseData);
        }

        logData.message = 'Autorisation réussie';
        logData.status = 'SUCCESS';
        Logger.logEvent(logData);
        next();
    };
};

module.exports = { authenticate, authorize };
