// controllers/SuperadminController.js (mise à jour)
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth');

const service = 'superadmin';

// Import des routes
const admins = require('../routes/' + service + '/admins');
const feeTypes = require('../routes/' + service + '/fee-types'); // Nouvelle route

// Utilisation des routes avec middlewares d'authentification et d'autorisation
router.use('/admins', authenticate(), authorize(['superadmin']), admins);
router.use('/fee-types', authenticate(), authorize(['superadmin']), feeTypes); // Nouvelle route

module.exports = router;