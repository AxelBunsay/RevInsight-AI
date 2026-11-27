const mongoose = require('mongoose');

const paymentReferenceSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true },
  recordId: { type: mongoose.Schema.Types.ObjectId, required: true },
  recordType: { type: String, enum: ['item', 'service', 'walk-in'], required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PaymentReference', paymentReferenceSchema);
