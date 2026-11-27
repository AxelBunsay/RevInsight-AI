const express = require('express');
const router = express.Router();
const serviceRequestController = require('../controllers/serviceRequestController');
const { authorizeRoles } = require('../middleware/authorize');
const paymentUpload = require('../middleware/paymentUpload');

// User gets their own service requests
router.get('/my', authorizeRoles('customer'), serviceRequestController.getUserServiceRequests);
router.post('/:id/quote/checkout', authorizeRoles('customer'), serviceRequestController.checkoutQuote);
router.post('/:id/quote/accept', authorizeRoles('customer'), serviceRequestController.respondToServiceQuote);
router.post('/:id/quote/reject', authorizeRoles('customer'), serviceRequestController.respondToServiceQuote);
router.post('/:id/quote/cancel', authorizeRoles('customer'), serviceRequestController.respondToServiceQuote);
router.post('/:id/payment', authorizeRoles('customer'), (req, res, next) => {
  paymentUpload.single('proof')(req, res, (error) => {
    if (error) return res.status(400).json({
      message: error.code === 'LIMIT_FILE_SIZE' ? 'Receipt image must be 2 MB or smaller.' : error.message || 'Payment proof could not be uploaded.'
    });
    next();
  });
}, serviceRequestController.submitServicePayment);
router.post('/:id/queue/cancel', authorizeRoles('customer'), async (req, res) => {
  const ServiceRequest = require('../models/serviceRequest');
  const request = await ServiceRequest.findOne({ _id: req.params.id, user: req.user.userId,
    queueKey: { $exists: true }, paymentStatus: 'Payment Pending', status: { $in: ['pending','assigned','confirmed'] } });
  if (!request) return res.status(409).json({ message: 'This request cannot be cancelled.' });
  const updated = await ServiceRequest.findOneAndUpdate({ _id: request._id, status: request.status, paymentStatus: 'Payment Pending' },
    { $set: { status: 'cancelled', cancelReason: 'Customer cancelled queue request.', updatedAt: new Date() },
      $push: { statusHistory: { status: 'cancelled', timestamp: new Date(), note: 'Customer cancelled queue request.' } } }, { new: true });
  if (!updated) return res.status(409).json({ message: 'Booking has changed. Refresh and try again.' });
  res.json({ serviceRequest: updated });
});
// Mechanic gets their assigned jobs
router.get('/mechanic/quotes', authorizeRoles('mechanic'), serviceRequestController.getMechanicQuoteRequests);
router.post('/:id/quote', authorizeRoles('mechanic'), serviceRequestController.submitMechanicQuote);
router.post('/:id/quote/decline', authorizeRoles('mechanic'), serviceRequestController.declineMechanicQuoteRequest);
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
