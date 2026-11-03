const Notification = require('../models/notification');

const getAdminNotificationFilter = (adminId) => ({
  audience: 'admin',
  clearedBy: { $ne: adminId }
});

const getAdminNotifications = async (req, res) => {
  try {
    const filter = getAdminNotificationFilter(req.admin.id);
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean(),
      Notification.countDocuments({ ...filter, read: false })
    ]);
    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('[getAdminNotifications] error', error);
    res.status(500).json({ message: 'Notifications could not be loaded.' });
  }
};

const markAdminNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ...getAdminNotificationFilter(req.admin.id) },
      { $set: { read: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ notification });
  } catch (error) {
    console.error('[markAdminNotificationRead] error', error);
    res.status(500).json({ message: 'Notification could not be updated.' });
  }
};

const markAllAdminNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { ...getAdminNotificationFilter(req.admin.id), read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[markAllAdminNotificationsRead] error', error);
    res.status(500).json({ message: 'Notifications could not be updated.' });
  }
};

const clearAdminNotifications = async (req, res) => {
  try {
    await Notification.updateMany(
      getAdminNotificationFilter(req.admin.id),
      { $addToSet: { clearedBy: req.admin.id } }
    );
    const unreadCount = await Notification.countDocuments({
      ...getAdminNotificationFilter(req.admin.id),
      read: false
    });
    res.json({ success: true, unreadCount });
  } catch (error) {
    console.error('[clearAdminNotifications] error', error);
    res.status(500).json({ message: 'Notifications could not be cleared.' });
  }
};

const getCustomerNotifications = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const filter = { audience: 'customer', customerId, clearedAt: null };
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean(),
      Notification.countDocuments({ ...filter, read: false })
    ]);
    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('[getCustomerNotifications] error', error);
    res.status(500).json({ message: 'Notifications could not be loaded.' });
  }
};

const markCustomerNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, audience: 'customer', customerId: req.user.userId, clearedAt: null },
      { $set: { read: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ notification });
  } catch (error) {
    console.error('[markCustomerNotificationRead] error', error);
    res.status(500).json({ message: 'Notification could not be updated.' });
  }
};

const clearCustomerNotifications = async (req, res) => {
  try {
    const filter = {
      audience: 'customer',
      customerId: req.user.userId,
      clearedAt: null
    };
    await Notification.updateMany(filter, { $set: { clearedAt: new Date() } });
    const unreadCount = await Notification.countDocuments({
      audience: 'customer',
      customerId: req.user.userId,
      clearedAt: null,
      read: false
    });
    res.json({ success: true, unreadCount });
  } catch (error) {
    console.error('[clearCustomerNotifications] error', error);
    res.status(500).json({ message: 'Notifications could not be cleared.' });
  }
};

const getMechanicNotifications = async (req, res) => {
  try {
    const filter = { audience: 'mechanic', mechanicId: req.user.userId, clearedAt: null };
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean(),
      Notification.countDocuments({ ...filter, read: false })
    ]);
    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('[getMechanicNotifications] error', error);
    res.status(500).json({ message: 'Notifications could not be loaded.' });
  }
};

const markMechanicNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, audience: 'mechanic', mechanicId: req.user.userId, clearedAt: null },
      { $set: { read: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    res.json({ notification });
  } catch (error) {
    console.error('[markMechanicNotificationRead] error', error);
    res.status(500).json({ message: 'Notification could not be updated.' });
  }
};

const clearMechanicNotifications = async (req, res) => {
  try {
    const filter = { audience: 'mechanic', mechanicId: req.user.userId, clearedAt: null };
    await Notification.updateMany(filter, { $set: { clearedAt: new Date() } });
    res.json({ success: true, unreadCount: 0 });
  } catch (error) {
    console.error('[clearMechanicNotifications] error', error);
    res.status(500).json({ message: 'Notifications could not be cleared.' });
  }
};

module.exports = {
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  clearAdminNotifications,
  getCustomerNotifications,
  markCustomerNotificationRead,
  clearCustomerNotifications,
  getMechanicNotifications,
  markMechanicNotificationRead,
  clearMechanicNotifications
};
