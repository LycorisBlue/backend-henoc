const { Admin } = require('../../models');
const bcrypt = require('bcrypt');
const TokenManager = require('../../utils/TokenManager');
const ApiResponse = require('../../utils/ApiResponse');
const Logger = require('../../utils/Logger');

module.exports = async (req, res) => {
    const { email, password } = req.body;

    const logData = {
        message: '',
        source: 'login',
        userId: null,
        action: 'LOGIN_ATTEMPT',
        ipAddress: req.ip,
        requestData: { email },
        responseData: null,
        status: 'PENDING',
        deviceInfo: req.headers['user-agent'] || 'Unknown Device'
    };

    try {
        // Vérifier l'existence de l'admin
        const admin = await Admin.findOne({ where: { email } });

        if (!admin) {
            logData.message = 'Adresse email non reconnue';
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_EMAIL' };
            await Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, 'Identifiants invalides', logData.responseData);
        }

        // Vérifier le mot de passe
        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            logData.message = 'Mot de passe invalide';
            logData.userId = admin.id;
            logData.status = 'FAILED';
            logData.responseData = { errorType: 'INVALID_PASSWORD' };
            await Logger.logEvent(logData);
            return ApiResponse.unauthorized(res, 'Identifiants invalides', logData.responseData);
        }

        // Génération des tokens
        const accessToken = await TokenManager.generateAccessToken(admin);
        const refreshToken = await TokenManager.generateRefreshToken(admin);

        logData.message = 'Connexion réussie';
        logData.status = 'SUCCESS';
        logData.userId = admin.id;
        logData.responseData = { role: admin.role };
        await Logger.logEvent(logData);

        return ApiResponse.success(res, 'Connexion réussie', {
            accessToken,
            refreshToken,
            role: admin.role
        });

    } catch (error) {
        logData.message = 'Erreur serveur lors de la connexion';
        logData.status = 'FAILED';
        logData.responseData = { error: error.message, errorType: 'SERVER_ERROR' };
        await Logger.logEvent(logData);

        return ApiResponse.serverError(res, 'Erreur interne', { error: error.message });
    }
};
