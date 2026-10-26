const express = require('express');
const router = express.Router();
const { login, getAdmin } = require('../../controllers/adminControllers/adminController');
const mechanicController = require('../../controllers/mechanic');
const { protect } = require('../../middleware/adminAuth');
const reservations = require('../../controllers/reservationController');
const notifications = require('../../controllers/notificationController');
const serviceRequests = require('../../controllers/serviceRequestController');
const paymentUpload = require('../../middleware/paymentUpload');
const createLoginRateLimit = require('../../middleware/loginRateLimit');


// Public login route; administrator accounts are provisioned out of band.
router.post('/login', createLoginRateLimit(), login);

// Protected routes
router.get('/admin', protect, getAdmin);
router.get('/notifications', protect, notifications.getAdminNotifications);
router.post('/notifications/read-all', protect, notifications.markAllAdminNotificationsRead);
router.post('/notifications/:id/read', protect, notifications.markAdminNotificationRead);
router.get('/mechanics/summary', protect, mechanicController.getMechanicsSummary);
router.get('/reservations/settings', protect, reservations.getPublicSettings);
router.put('/reservations/settings', protect, reservations.updateSettings);
router.get('/reservations/booking-schedule', protect, reservations.getBookingSchedule);
router.put('/reservations/booking-schedule', protect, reservations.updateBookingSchedule);
router.post('/reservations/settings/gcash-qr', protect, (req, res, next) => {
  paymentUpload.single('qr')(req, res, (error) => {
    if (error) return res.status(400).json({
      success: false,
      message: error.code === 'LIMIT_FILE_SIZE' ? 'QR image must be 2 MB or smaller.' : error.message || 'QR image could not be uploaded.'
    });
    next();
  });
}, reservations.uploadGcashQr);
router.get('/reservations', protect, reservations.getAdminReservations);
router.get('/reservations/:id/receipts', protect, reservations.getAdminReservationReceipts);
router.post('/reservations/:id/confirm', protect, reservations.confirmReservation);
router.post('/reservations/:id/reject', protect, reservations.rejectReservation);
router.post('/reservations/:id/complete', protect, reservations.completeReservation);
router.post('/reservations/:id/cancel', protect, reservations.cancelAdminReservation);
router.post('/reservations/:id/refund-decision', protect, reservations.decideExpiredRefund);
router.post('/service-requests/:id/confirm-payment', protect, serviceRequests.reviewServicePayment);
router.post('/service-requests/:id/reject-payment', protect, serviceRequests.reviewServicePayment);
router.post('/service-requests/:id/paid-at-shop', protect, serviceRequests.markServicePaidAtShop);

// Admin: delete mechanic via admin API
router.delete('/mechanics/:id', protect, mechanicController.deleteMechanic);

module.exports = router;