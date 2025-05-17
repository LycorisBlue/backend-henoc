// controllers/SuperadminController.js
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth');

const service = 'superadmin';

// Import des routes
const admins = require('../routes/' + service + '/admins');

// Utilisation des routes avec middlewares d'authentification et d'autorisation
router.use('/admins', authenticate(), authorize(['superadmin']), admins);

module.exports = router;