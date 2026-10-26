const express = require('express');
const router = express.Router();
const userController = require('../controllers/userControllers/user');
const createLoginRateLimit = require('../middleware/loginRateLimit');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/authorize');
const {
  validateRegister,
  validateLogin,
  validateUpdateProfile
} = require('../middleware/validate');

// OTP Registration Flow
router.post('/register-request', validateRegister, userController.registerRequest);
router.post('/verify-otp', userController.verifyOtp);
router.post('/resend-otp', userController.resendOtp);

// Login (only for verified accounts)
router.post('/login', createLoginRateLimit(), validateLogin, userController.login);

// Protected routes (user only)
router.get('/profile', authenticate, authorizeRoles('customer'), userController.getProfile);
router.put('/profile', authenticate, authorizeRoles('customer'), validateUpdateProfile, userController.updateProfile);
router.get('/purchase-history', authenticate, authorizeRoles('customer'), userController.getPurchaseHistory);
router.get('/receipts', authenticate, authorizeRoles('customer'), userController.getReceipts);

module.exports = router;