const express = require('express');
const router = express.Router();
const userController = require('../controllers/userControllers/user');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/authorize');
const { validateCustomerProfile } = require('../middleware/validate');

router.use(authenticate, authorizeRoles('customer'));
router.put('/me', validateCustomerProfile, userController.updateMyProfile);
router.post('/me/password', userController.changePassword);
router.delete('/me', userController.deleteAccount);

module.exports = router;
