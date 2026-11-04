const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Authentication & Identity
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  username: {
    type: String,
    trim: true
  },
  usernameLower: {
    type: String,
    lowercase: true,
    trim: true
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
    default: null,
    validate: {
      validator: async (phoneNumber) => {
        if (phoneNumber === null || phoneNumber === undefined || phoneNumber === '') return true;
        const { cleanAndValidateMobileNumber } = await import('../../shared/mobileNumber.mjs');
        return cleanAndValidateMobileNumber(phoneNumber).isValid;
      },
      message: 'Enter a valid mobile number (11 digits, starts with 09)'
    }
  },
  name: {
    type: String,
    default: ''
  },

  // OTP Verification
  otp: {
    code: {
      type: String,
      default: null
    },
    expiresAt: {
      type: Date,
      default: null
    }
  },

  // Account Status
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  role: {
    type: String,
    enum: ['customer'],
    default: 'customer'
  },

  // Preferences
  preferences: {
    newsletter: {
      type: Boolean,
      default: false
    },
    notifications: {
      type: Boolean,
      default: true
    },
    preferredContactMethod: {
      type: String,
      enum: ['email', 'sms', 'phone'],
      default: 'email'
    }
  },

  // Profile
  profileImage: {
    type: String,
    default: null
  },

  // Customer Activity Tracking
  totalPurchases: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },

  // Purchase & Receipt Timestamps
  firstPurchaseDate: {
    type: Date,
    default: null
  },
  lastPurchaseDate: {
    type: Date,
    default: null
  },
  lastReceiptDate: {
    type: Date,
    default: null
  }
}, { timestamps: true });

userSchema.pre('validate', function normalizeUsernameFields() {
  if (typeof this.username !== 'string' || !this.username.trim()) {
    this.username = undefined;
    this.usernameLower = undefined;
    return;
  }
  this.username = this.username.trim();
  this.usernameLower = this.username.toLowerCase();
});

// Index for faster queries
userSchema.index({ lastPurchaseDate: 1 });
userSchema.index(
  { usernameLower: 1 },
  { name: 'username_lower_partial_unique', unique: true, partialFilterExpression: { usernameLower: { $type: 'string' } } }
);

module.exports = mongoose.model('User', userSchema);
