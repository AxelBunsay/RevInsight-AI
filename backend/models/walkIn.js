const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;

const schema = new mongoose.Schema({
  requestKey: { type: String, required: true },
  handledBy: { type: ObjectId, ref: 'Admin', required: true },
  customer: { type: String, default: 'Walk-in Guest' },
  items: [{ productId: ObjectId, variantId: ObjectId, productName: String, category: String, price: Number, quantity: Number }],
  jobId: { type: ObjectId, ref: 'ServiceRequest' },
  serviceName: String,
  serviceTotal: { type: Number, default: 0 },
  productTotal: { type: Number, required: true },
  total: { type: Number, required: true },
  method: { type: String, enum: ['Cash', 'GCash'], required: true },
  status: { type: String, enum: ['Unpaid', 'Payment submitted', 'Paid'], default: 'Unpaid' },
  reference: String, proofId: String, proofFormat: String,
  submissions: [{ reference: String, proofId: String, format: String, submittedAt: Date,
    status: { type: String, enum: ['Submitted','Confirmed','Rejected'] }, reviewedAt: Date,
    reviewedBy: { type: ObjectId, ref: 'Admin' }, reason: String }],
  paidAt: Date, confirmedBy: { type: ObjectId, ref: 'Admin' }
}, { timestamps: true });
schema.index({ handledBy: 1, requestKey: 1 }, { unique: true });
module.exports = mongoose.model('WalkIn', schema);
