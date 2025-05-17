const express = require('express');
const router = express.Router();

const service = 'auth';

// Import des routes existantes
const login = require('../routes/' + service + '/login');
const refresh = require('../routes/' + service + '/refresh');
const me = require('../routes/' + service + '/me');
const logout = require('../routes/' + service + '/logout');

// Utilisation des routes
router.use('/login', login);
router.use('/refresh', refresh);
router.use('/me', me);
router.use('/logout', logout);

module.exports = router;