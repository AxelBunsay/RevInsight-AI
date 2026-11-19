const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  monthKey: { type: String, required: true, unique: true, match: /^[1-9]\d{3}-(0[1-9]|1[0-2])$/ },
  status: { type: String, enum: ['reviewed', 'confirmed_zero_sales'], required: true },
  confirmedZeroSales: { type: Boolean, required: true },
  reviewedFingerprint: { type: String, required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  reviewedAt: { type: Date, required: true },
  reviewVersion: { type: Number, required: true, min: 1 },
  sourceRecords: [{ _id: false, recordId: mongoose.Schema.Types.ObjectId, recordType: String }]
}, { versionKey: false });
module.exports = mongoose.model('RevenueMonthReview', schema);
