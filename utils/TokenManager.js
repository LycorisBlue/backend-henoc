const jwt = require('jsonwebtoken');
const { Token } = require('../models');
const JWT_SECRET = process.env.JWT_SECRET_DEV || 'supersecret_default_dev';

class TokenManager {
    static async generateAccessToken(admin) {
        const payload = {
            adminId: admin.id,
            role: admin.role
        };

        // Délais selon rôle
        let expiresIn = admin.role === 'superadmin' ? '1h' : '1d';
        const expiresMs = this._getExpirationMilliseconds(expiresIn);

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn });

        await Token.create({
            admin_id: admin.id,
            token,
            type: 'access',
            revoked: false,
            expires_at: new Date(Date.now() + expiresMs)
        });

        return token;
    }

    static async generateRefreshToken(admin) {
        if (admin.role === 'superadmin') return null;

        const payload = {
            adminId: admin.id,
            role: admin.role,
            type: 'refresh'
        };

        const expiresIn = '30d';
        const expiresMs = this._getExpirationMilliseconds(expiresIn);
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn });

        await Token.create({
            admin_id: admin.id,
            token,
            type: 'refresh',
            revoked: false,
            expires_at: new Date(Date.now() + expiresMs)
        });

        return token;
    }

    static verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            console.error('Token invalide :', error.message);
            return null;
        }
    }

    static checkToken(token) {
        try {
            const payload = jwt.verify(token, JWT_SECRET);
            return { isValid: true, payload };
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                const decoded = jwt.decode(token);
                return {
                    isValid: false,
                    expired: true,
                    payload: decoded,
                    message: 'Le token a expiré.'
                };
            }
            return {
                isValid: false,
                message: 'Token invalide : ' + error.message
            };
        }
    }

    static async revokeToken(token) {
        try {
            const tokenRecord = await Token.findOne({ where: { token } });
            if (!tokenRecord) return false;

            tokenRecord.revoked = true;
            await tokenRecord.save();
            return true;
        } catch (err) {
            console.error('Révocation échouée :', err.message);
            return false;
        }
    }

    static async revokeAllTokens(adminId) {
        try {
            await Token.update(
                { revoked: true },
                { where: { admin_id: adminId, revoked: false } }
            );
            return true;
        } catch (err) {
            console.error('Erreur révocation globale :', err.message);
            return false;
        }
    }

    static async isTokenRevoked(token) {
        try {
            const record = await Token.findOne({ where: { token } });
            return !record || record.revoked;
        } catch (err) {
            console.error('Erreur vérification révocation :', err.message);
            return true;
        }
    }

    static _getExpirationMilliseconds(expiresIn) {
        const match = expiresIn.match(/^(\d+)([smhdy])$/);
        if (!match) return 0;

        const value = parseInt(match[1], 10);
        const unit = match[2];

        const multipliers = {
            s: 1000,
            m: 60 * 1000,
            h: 60 * 60 * 1000,
            d: 24 * 60 * 60 * 1000,
            y: 365 * 24 * 60 * 60 * 1000
        };

        return value * (multipliers[unit] || 0);
    }
}

module.exports = TokenManager;
