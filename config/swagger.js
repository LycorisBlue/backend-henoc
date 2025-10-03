// config/swagger.js
require('dotenv').config();
const swaggerJsdoc = require('swagger-jsdoc');

const getServers = () => {
    const environment = process.env.NODE_ENV || 'development';
    const servers = [];

    switch (environment) {
        case 'production':
            servers.push({
                url: process.env.PROD_API_URL || 'https://api.monfournisseur.com',
                description: 'Serveur de production'
            });
            break;
        case 'test':
            servers.push({
                url: process.env.TEST_API_URL || 'https://test.monfournisseur.com',
                description: 'Serveur de test'
            });
            break;
        default:
            servers.push({
                url: process.env.DEV_API_URL || 'http://localhost:3015',
                description: 'Serveur de développement'
            });
    }

    return servers;
};

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Mon Fournisseur 2.0 - API Documentation',
            version: '1.0.0',
            description: "Documentation de l'API pour la plateforme Mon Fournisseur 2.0",
            contact: {
                name: 'Mon Fournisseur 2.0',
                email: 'support@monfournisseur.com'
            }
        },
        servers: getServers(),
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        },
        security: [{
            bearerAuth: []
        }]
    },
    apis: [
        './swagger/auth/*.yaml',
        './swagger/admin/*.yaml',
        './swagger/client/*.yaml',
        './swagger/superadmin/*.yaml',
        './swagger/common/*.yaml'
    ]
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;