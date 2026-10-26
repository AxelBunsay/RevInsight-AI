const mongoose = require('mongoose');

const reservationItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  unitPrice: { type: Number, required: true, min: 0 },
  qty: { type: Number, required: true, min: 1 },
  lineTotal: { type: Number, required: true, min: 0 }
}, { _id: false });

const paymentSubmissionSchema = new mongoose.Schema({
  reference: { type: String, required: true },
  paymentProofPublicId: { type: String, required: true },
  format: { type: String, default: 'jpg' },
  submittedAt: { type: Date, required: true },
  status: { type: String, enum: ['Payment Submitted', 'Confirmed', 'Rejected'], default: 'Payment Submitted' },
  rejectionReason: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, { _id: true });

const reservationSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, sparse: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  customerName: { type: String, required: true },
  customerPhone: { type: String, default: '' },
  items: { type: [reservationItemSchema], required: true },
  status: {
    type: String,
    enum: ['Pending Down Payment', 'Payment Submitted', 'Reserved', 'Completed', 'Cancelled', 'Expired'],
    default: 'Pending Down Payment',
    index: true
  },
  total: { type: Number, required: true, min: 0 },
  downPaymentPercent: { type: Number, required: true, min: 0, max: 100 },
  downPaymentAmount: { type: Number, required: true, min: 0 },
  amountPaid: { type: Number, default: 0, min: 0 },
  balanceDue: { type: Number, required: true, min: 0 },
  paymentMethod: { type: String, default: '' },
  paymentReference: { type: String, default: '' },
  paymentProofUrl: { type: String, default: '' },
  paymentProofPublicId: { type: String, default: '' },
  paymentProofFormat: { type: String, default: 'jpg' },
  paymentSubmissions: { type: [paymentSubmissionSchema], default: [] },
  rejectionReason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  paymentDueAt: { type: Date, default: null },
  submittedAt: { type: Date, default: null },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  paymentRejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  paymentRejectedAt: { type: Date, default: null },
  reservedUntil: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: '' },
  refundDecision: { type: String, enum: ['refunded', 'forfeited', null], default: null },
  refundDecisionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  refundDecisionAt: { type: Date, default: null },
  expiredAt: { type: Date, default: null }
}, { timestamps: false });

module.exports = mongoose.model('Reservation', reservationSchema, 'orders');
