const express = require('express');
const router = express.Router();
const { authorizeRoles } = require('../middleware/authorize');
const notifications = require('../controllers/notificationController');

router.get('/', authorizeRoles('customer'), notifications.getCustomerNotifications);
router.delete('/', authorizeRoles('customer'), notifications.clearCustomerNotifications);
router.post('/:id/read', authorizeRoles('customer'), notifications.markCustomerNotificationRead);

module.exports = router;
