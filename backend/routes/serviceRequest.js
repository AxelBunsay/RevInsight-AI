const express = require('express');
const router = express.Router();
const serviceRequestController = require('../controllers/serviceRequestController');
const { authorizeRoles } = require('../middleware/authorize');
const paymentUpload = require('../middleware/paymentUpload');

// User gets their own service requests
router.get('/my', authorizeRoles('customer'), serviceRequestController.getUserServiceRequests);
router.post('/:id/payment', authorizeRoles('customer'), (req, res, next) => {
  paymentUpload.single('proof')(req, res, (error) => {
    if (error) return res.status(400).json({
      message: error.code === 'LIMIT_FILE_SIZE' ? 'Receipt image must be 2 MB or smaller.' : error.message || 'Payment proof could not be uploaded.'
    });
    next();
  });
}, serviceRequestController.submitServicePayment);
// Mechanic gets their assigned jobs
router.get('/mechanic', authorizeRoles('mechanic'), serviceRequestController.getMechanicJobs);
// Mechanic accepts a job and sets start time
router.put('/accept', authorizeRoles('mechanic'), serviceRequestController.mechanicAcceptJob);
// Mechanic updates job status
router.put('/status', authorizeRoles('mechanic'), serviceRequestController.updateJobStatus);
// Admin assigns mechanic to job
router.put('/assign', authorizeRoles('admin'), serviceRequestController.assignMechanic);
router.put('/status/admin', authorizeRoles('admin'), serviceRequestController.updateBookingStatus);
router.get('/:id/payment-receipts', authorizeRoles('admin'), serviceRequestController.getAdminServiceRequestReceipts);
// Admin gets all service requests
router.get('/', authorizeRoles('admin'), serviceRequestController.getAllServiceRequests);

module.exports = router;
