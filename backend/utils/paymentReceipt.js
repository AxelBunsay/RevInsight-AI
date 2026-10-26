const cloudinary = require('../config/cloudinary');
const PaymentReference = require('../models/paymentReference');
const Reservation = require('../models/orderingModels/reservation');
const ServiceRequest = require('../models/serviceRequest');

const MAX_RECEIPT_SIZE = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function validateReceipt(file) {
  if (!file) {
    throw Object.assign(new Error('Attach a JPG or PNG receipt image.'), { status: 400 });
  }
  if (file.size > MAX_RECEIPT_SIZE || file.buffer.length > MAX_RECEIPT_SIZE) {
    throw Object.assign(new Error('Receipt image must be 2 MB or smaller.'), { status: 400 });
  }

  const isPng = file.mimetype === 'image/png'
    && file.buffer.length >= PNG_SIGNATURE.length
    && file.buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  const isJpeg = file.mimetype === 'image/jpeg'
    && file.buffer.length >= 3
    && file.buffer[0] === 0xff
    && file.buffer[1] === 0xd8
    && file.buffer[2] === 0xff;
  if (!isPng && !isJpeg) {
    throw Object.assign(new Error('Receipt must be a real PNG or JPG image.'), { status: 400 });
  }
}

function uploadReceipt(file) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'revinsight/payment-receipts',
        resource_type: 'image',
        type: 'authenticated'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ publicId: result.public_id, format: result.format });
      }
    );
    stream.end(file.buffer);
  });
}

function uploadPublicImage(file, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ publicId: result.public_id, url: result.secure_url });
      }
    );
    stream.end(file.buffer);
  });
}

function getTemporaryReceiptUrl(publicId, format = 'jpg') {
  if (!publicId) return '';
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: 'image',
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 5 * 60
  });
}

async function claimPaymentReference({ reference, recordType, recordId, session }) {
  const existing = await PaymentReference.findOne({ reference }).session(session);
  if (existing) {
    if (existing.recordId.toString() !== recordId.toString() || existing.recordType !== recordType) {
      throw Object.assign(new Error('This reference number was already used.'), { status: 409 });
    }
    return existing;
  }
  const [reservationUse, serviceUse] = await Promise.all([
    Reservation.findOne({
      _id: { $ne: recordId },
      $or: [{ paymentReference: reference }, { 'paymentSubmissions.reference': reference }]
    }).select('_id').session(session),
    ServiceRequest.findOne({
      _id: { $ne: recordId },
      $or: [{ paymentReference: reference }, { 'paymentSubmissions.reference': reference }]
    }).select('_id').session(session)
  ]);
  if (reservationUse || serviceUse) {
    throw Object.assign(new Error('This reference number was already used.'), { status: 409 });
  }
  await PaymentReference.create([{ reference, recordType, recordId }], { session });
}

function validateReference(reference) {
  if (typeof reference !== 'string' || !/^\d{10,20}$/.test(reference.trim())) {
    throw Object.assign(new Error('Enter a GCash reference number with 10 to 20 digits.'), { status: 400 });
  }
  return reference.trim();
}

async function removeReceipt(publicId) {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'authenticated' });
}

async function removePublicImage(publicId) {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}

module.exports = {
  validateReceipt,
  validateReference,
  claimPaymentReference,
  uploadReceipt,
  uploadPublicImage,
  getTemporaryReceiptUrl,
  removeReceipt,
  removePublicImage
};
