const mongoose = require('mongoose');

const pendingUserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    firstName: {
      type: String,
      required: true
    },
    lastName: {
      type: String,
      required: true
    },
    phoneNumber: {
      type: String,
      required: true,
      validate: {
        validator: async (phoneNumber) => {
          const { cleanAndValidateMobileNumber } = await import('../../shared/mobileNumber.mjs');
          return cleanAndValidateMobileNumber(phoneNumber).isValid;
        },
        message: 'Enter a valid mobile number (11 digits, starts with 09)'
      }
    },
    otp: {
      code: {
        type: String,
        required: true
      },
      expiresAt: {
        type: Date,
        required: true,
        expires: 0
      },
      attempts: { type: Number, default: 0, min: 0 },
      lastSentAt: { type: Date, default: Date.now }
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PendingUser', pendingUserSchema);