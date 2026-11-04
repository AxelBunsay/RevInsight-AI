const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    minlength: 2,
    maxlength: 80,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 300
  },
  price: {
    type: Number,
    required: [true, 'Service price is required'],
    min: 0.01,
    max: 999999.99
  },
  laborOnlyPrice: {
    type: Number,
    min: 0,
    max: 999999.99,
    default: null
  },
  laborPriceMin: {
    type: Number,
    min: 0,
    max: 999999.99,
    default: null
  },
  laborPriceMax: {
    type: Number,
    min: 0,
    max: 999999.99,
    default: null,
    validate: {
      validator(value) {
        return value == null || this.laborPriceMin == null || value >= this.laborPriceMin;
      },
      message: 'Maximum labor price must be greater than or equal to minimum labor price.'
    }
  },
  category: {
    type: String,
    default: 'General',
    trim: true
  },
  durationMinutes: {
    type: Number,
    min: 1,
    default: 60
  },
  mechanicFee: {
    type: Number,
    min: 0,
    max: 999999.99,
    default: 0,
    validate: {
      validator(value) {
        return value <= this.price;
      },
      message: 'Mechanic fee cannot be greater than the service price.'
    }
  },
  pricePerUnit: {
    type: Boolean,
    default: false
  },
  unitLabel: {
    type: String,
    trim: true,
    maxlength: 40,
    default: ''
  },
  maxUnits: {
    type: Number,
    min: 1,
    max: 10,
    default: 2,
    validate: {
      validator: Number.isInteger,
      message: 'Maximum units must be a whole number from 1 to 10.'
    }
  },
  scaleDuration: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);