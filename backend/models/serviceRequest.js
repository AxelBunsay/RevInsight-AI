const mongoose = require('mongoose');

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

const serviceRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    default: null
  },
  mechanic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mechanic',
    default: null // Assigned later
  },
  mechanicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mechanic',
    default: null
  },
  serviceType: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  estimatedPrice: {
    type: Number,
    min: 0,
    default: 0
  },
  code: { type: String, default: '' },
  paymentStatus: {
    type: String,
    enum: ['Payment Pending', 'Payment Submitted', 'Confirmed', 'Paid at shop'],
    default: 'Payment Pending',
    index: true
  },
  paymentDueAt: { type: Date, default: null, index: true },
  paymentMethod: { type: String, default: '' },
  paymentReference: { type: String, default: '' },
  paymentProofPublicId: { type: String, default: '' },
  paymentProofFormat: { type: String, default: 'jpg' },
  paymentSubmissions: { type: [paymentSubmissionSchema], default: [] },
  paymentSubmittedAt: { type: Date, default: null },
  paymentConfirmedAt: { type: Date, default: null },
  paymentConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  paymentRejectedAt: { type: Date, default: null },
  paymentRejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  paymentRejectionReason: { type: String, default: '' },
  refundDecision: { type: String, enum: ['refunded', 'forfeited', null], default: null },
  refundDecisionBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  refundDecisionAt: { type: Date, default: null },
  laborFee: {
    type: Number,
    min: 0,
    default: 0
  },
  completedAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'assigned', 'confirmed', 'accepted', 'in-progress', 'completed', 'declined', 'cancelled'],
    default: 'pending'
  },
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    note: {
      type: String,
      default: ''
    }
  }],
  startTime: {
    type: String, // e.g., '08:00', '14:30'
    default: null,
    validate: {
      validator: function(v) {
        return !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
      },
      message: 'Start time must use 24-hour HH:mm format.'
    }
  },
  endTime: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        return !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
      },
      message: 'End time must use 24-hour HH:mm format.'
    }
  },
  notes: {
    type: String,
    default: ''
  },
  cancelReason: { type: String, default: '' },
  vehicle: {
    type: String,
    default: ''
  },
  scheduledDate: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

serviceRequestSchema.pre('save', function(next) {
  if (!this.code) this.code = `SRV-${String(this._id).slice(-6).toUpperCase()}`;
  if (this.isModified('status')) {
    const lastStatus = this.statusHistory[this.statusHistory.length - 1];
    if (!lastStatus || lastStatus.status !== this.status) {
      this.statusHistory.push({
        status: this.status,
        timestamp: new Date(),
        note: `Status updated to ${this.status}`
      });
    }
  }

  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
