const mongoose = require('mongoose');

const businessRecordSchema = new mongoose.Schema({
  recordType: {
    type: String,
    enum: ['product', 'service'],
    required: true
  },
  sourceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  customer: {
    type: String,
    required: true
  },
  customerPhone: {
    type: String,
    default: ''
  },
  itemName: {
    type: String,
    required: true
  },
  category: {
    type: String,
    default: 'General'
  },
  categoryKey: {
    type: String,
    trim: true
  },
  mechanicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mechanic',
    default: null
  },
  mechanicName: {
    type: String,
    default: ''
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  laborFee: {
    type: Number,
    min: 0,
    default: 0
  },
  status: {
    type: String,
    default: 'completed'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  }
});

businessRecordSchema.index(
  { recordType: 1, sourceId: 1, categoryKey: 1 },
  {
    unique: true,
    partialFilterExpression: { categoryKey: { $type: 'string' } }
  }
);

module.exports = mongoose.model('BusinessRecord', businessRecordSchema);
