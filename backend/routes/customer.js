const express = require('express');
const router = express.Router();
const userController = require('../controllers/userControllers/user');
const { authenticate } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/authorize');
const { validateCustomerProfile } = require('../middleware/validate');
const profileImageController = require('../controllers/customerProfileImageController');
const upload = require('../middleware/upload');

router.use(authenticate, authorizeRoles('customer'));
router.put('/me', validateCustomerProfile, userController.updateMyProfile);
router.post('/me/password', userController.changePassword);
router.delete('/me', userController.deleteAccount);
router.post('/me/profile-image', (req, res, next) => {
  upload.single('image')(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Profile image must be 5 MB or smaller.'
        : 'Only JPG or PNG profile images up to 5 MB are allowed.';
      return res.status(400).json({ success: false, message });
    }
    return next();
  });
}, profileImageController.uploadProfileImage);
router.delete('/me/profile-image', profileImageController.deleteProfileImage);

module.exports = router;
