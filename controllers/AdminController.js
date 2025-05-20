// controllers/AdminController.js (mise à jour)
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth');

const service = 'admin';

// Import des routes
const requests = require('../routes/' + service + '/requests');
const requestDetails = require('../routes/' + service + '/request-details');
const requestAssign = require('../routes/' + service + '/request-assign');
const requestStatus = require('../routes/' + service + '/request-status');
const createInvoice = require('../routes/' + service + '/create-invoice');
const invoices = require('../routes/' + service + '/invoices');
const invoiceDetails = require('../routes/' + service + '/invoice-details');
const createPayment = require('../routes/' + service + '/create-payment');
const payments = require('../routes/' + service + '/payments');
const clientManagement = require('../routes/' + service + '/client-management'); // Nouvelle route

// Utilisation des routes avec middleware d'authentification
router.use('/requests', authenticate(), authorize(['admin', 'superadmin']), requests);
router.use('/requests', authenticate(), authorize(['admin', 'superadmin']), requestDetails);
router.use('/requests', authenticate(), authorize(['admin', 'superadmin']), requestAssign);
router.use('/requests', authenticate(), authorize(['admin', 'superadmin']), requestStatus);
router.use('/requests', authenticate(), authorize(['admin', 'superadmin']), createInvoice);
router.use('/invoices', authenticate(), authorize(['admin', 'superadmin']), invoices);
router.use('/invoices', authenticate(), authorize(['admin', 'superadmin']), invoiceDetails);
router.use('/invoices', authenticate(), authorize(['admin', 'superadmin']), createPayment);
router.use('/payments', authenticate(), authorize(['admin', 'superadmin']), payments);
router.use('/clients', authenticate(), authorize(['admin', 'superadmin']), clientManagement); // Nouvelle route

module.exports = router;