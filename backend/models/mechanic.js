const mongoose = require('mongoose');

const usernamePattern = /^[a-z0-9][a-z0-9._-]{3,19}$/;

const mechanicSchema = new mongoose.Schema({
  // Authentication & Identity
  username: {
    type: String,
    required: [true, 'Username is required'],
    lowercase: true,
    trim: true,
    minlength: 4,
    maxlength: 20,
    match: [usernamePattern, 'Username must be 4-20 characters and use letters, numbers, dots, underscores or hyphens.']
  },
  email: {
    type: String,
    required: false,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    default: undefined
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false // Don't return password by default
  },

  // Personal Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: async (phoneNumber) => {
        const { cleanAndValidateMobileNumber } = await import('../../shared/mobileNumber.mjs');
        return cleanAndValidateMobileNumber(phoneNumber).isValid;
      },
      message: 'Enter a valid mobile number (11 digits, starts with 09)'
    }
  },

  // Account Status
  isActive: {
    type: Boolean,
    default: true
  },
  role: {
    type: String,
    enum: ['mechanic'],
    default: 'mechanic'
  },

  // Mechanic-specific Information
  specialization: {
    type: String,
    required: [true, 'Specialization is required'],
    enum: ['general', 'engine', 'transmission', 'electrical', 'suspension', 'brakes']
  },
  yearsOfExperience: {
    type: Number,
    required: [true, 'Years of experience is required'],
    min: 0
  },
  certifications: [String],

  // Profile Information
  photoUrl: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    default: '',
    maxlength: 500
  },
  availabilityStatus: {
    type: String,
    enum: ['available', 'busy', 'on-leave'],
    default: 'available'
  },

  // Work Statistics
  totalRepairs: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  successRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  // Admin Assignment
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  }
}, { timestamps: true });

mechanicSchema.index(
  { username: 1 },
  { name: 'username_partial_unique', unique: true, partialFilterExpression: { username: { $type: 'string' } }, collation: { locale: 'en', strength: 2 } }
);
mechanicSchema.index(
  { email: 1 },
  { name: 'email_partial_unique', unique: true, partialFilterExpression: { email: { $type: 'string' } }, collation: { locale: 'en', strength: 2 } }
);
mechanicSchema.index({ specialization: 1 });

mechanicSchema.pre('validate', function normalizeIdentity(next) {
  if (typeof this.username === 'string') this.username = this.username.trim().toLowerCase();
  if (typeof this.email === 'string') {
    this.email = this.email.trim().toLowerCase() || undefined;
  }
  next();
});

const Mechanic = mongoose.model('Mechanic', mechanicSchema);

module.exports = Mechanic;
