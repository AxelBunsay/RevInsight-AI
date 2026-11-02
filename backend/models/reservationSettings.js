const mongoose = require('mongoose');

const gcashPaymentSettingsSchema = new mongoose.Schema({
  gcashQrUrl: { type: String, default: '' },
  gcashQrPublicId: { type: String, default: '' },
  gcashAccountName: { type: String, default: '' },
  gcashAccountNumber: { type: String, default: '' },
  paymentInstructions: { type: String, default: '', maxlength: 300 },
  updatedAt: { type: Date, default: null }
}, { _id: false });

const reservationSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'reservation' },
  downPaymentPercent: { type: Number, default: 30, min: 1, max: 100 },
  serviceDownPaymentPercent: { type: Number, min: 0, max: 100 },
  pendingPaymentHours: { type: Number, default: 24, min: 1, max: 720 },
  holdDays: { type: Number, default: 3, min: 1, max: 30 },
  paymentInstructions: {
    methodName: { type: String, default: '' },
    accountName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    qrImageUrl: { type: String, default: '' },
    qrImagePublicId: { type: String, default: '' }
  },
  gcashPaymentSettings: { type: gcashPaymentSettingsSchema, default: () => ({}) },
  pickupAddress: { type: String, default: '', maxlength: 150 },
  pickupHours: { type: String, default: '', maxlength: 80 },
  contactNumber: {
    type: String,
    default: '09000000000',
    validate: {
      validator: async (contactNumber) => {
        const { cleanAndValidateMobileNumber } = await import('../../shared/mobileNumber.mjs');
        return cleanAndValidateMobileNumber(contactNumber).isValid;
      },
      message: 'Enter a valid mobile number (11 digits, starts with 09)'
    }
  },
  openDays: { type: [String], default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
  openTime: { type: String, default: '09:00' },
  closeTime: { type: String, default: '18:00' },
  slotCapacity: { type: Number, default: 1, min: 1, max: 100 },
  maxDaysAhead: { type: Number, default: 30, min: 1, max: 365 }
});

reservationSettingsSchema.statics.getDefaults = function getDefaults() {
  return this.findOneAndUpdate(
    { key: 'reservation' },
    {
      $setOnInsert: {
        key: 'reservation',
        downPaymentPercent: 30,
        serviceDownPaymentPercent: 30,
        pendingPaymentHours: 24,
        holdDays: 3,
        openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        openTime: '09:00',
        closeTime: '18:00',
        slotCapacity: 1,
        maxDaysAhead: 30
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).then((settings) => {
    if (settings.serviceDownPaymentPercent === undefined || settings.serviceDownPaymentPercent === null) {
      settings.serviceDownPaymentPercent = settings.downPaymentPercent ?? 30;
    }
    return settings;
  });
};

module.exports = mongoose.model('ReservationSettings', reservationSettingsSchema);
