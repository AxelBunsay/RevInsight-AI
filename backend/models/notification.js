const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  audience: { type: String, enum: ['admin', 'customer', 'mechanic'], required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  mechanicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mechanic', default: null, index: true },
  type: { type: String, required: true },
  message: { type: String, required: true },
  link: { type: String, default: '' },
  recordId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  recordType: { type: String, enum: ['item', 'service'], required: true },
  read: { type: Boolean, default: false, index: true },
  clearedAt: { type: Date, default: null, index: true },
  clearedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }],
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('Notification', notificationSchema);
