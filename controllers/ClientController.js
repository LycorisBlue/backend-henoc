// controllers/ClientController.js
const express = require('express');
const router = express.Router();

const service = 'client';

// Import des routes
const requests = require('../routes/' + service + '/requests');
const requestDetails = require('../routes/' + service + '/request-details');

// Utilisation des routes
router.use('/requests', requests);
router.use('/requests', requestDetails);

module.exports = router;