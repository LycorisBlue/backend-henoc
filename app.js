require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const rateLimit = require('express-rate-limit');
const expressSanitizer = require('express-sanitizer');
const swaggerUi = require('swagger-ui-express');

// Swagger config
const swaggerSpec = require('./config/swagger');

// Middlewares d'authentification
const { authenticate, authorize } = require('./middlewares/auth');

// Import des routes ou controllers
const AuthController = require('./controllers/AuthController');
const AdminController = require('./controllers/AdminController');
const ClientController = require('./controllers/ClientController');
const SuperadminController = require('./controllers/SuperadminController');

// const RequestController = require('./controllers/RequestController');
// const InvoiceController = require('./controllers/InvoiceController');
// const PaymentController = require('./controllers/PaymentController');

const app = express();

app.set('trust proxy', 1);

// 🚫 Rate limiting sur les endpoints sensibles
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: 'Trop de tentatives de connexion. Réessayez plus tard.' }
});

// 🌐 CORS - Configuration mise à jour
app.use(cors({
    origin: '*', // Spécifiez l'origine exacte du frontend au lieu de '*'
    credentials: true,               // Autoriser les credentials (cookies, en-têtes d'auth)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 🔐 Sécurité
app.use(helmet());
app.use(hpp());
app.use(compression());
app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
    }
}));

// 🧱 Middlewares essentiels
app.use(logger('dev'));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(cookieParser());
app.use(expressSanitizer());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Headers supplémentaires
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// 📄 Documentation API Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 🔐 Routes
app.use('/auth', loginLimiter, AuthController);
app.use('/admin', authenticate(), AdminController);
app.use('/client', ClientController);
app.use('/superadmin', SuperadminController);
// app.use('/request', authenticate(), RequestController);
// app.use('/invoice', authenticate(), InvoiceController);
// app.use('/payment', authenticate(), PaymentController);

module.exports = app;
