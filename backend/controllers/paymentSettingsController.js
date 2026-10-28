const ReservationSettings = require('../models/reservationSettings');
const { validateProductImage } = require('../utils/productImage');
const { uploadPublicImage, removePublicImage } = require('../utils/paymentReceipt');

async function removeQrImage(publicId) {
  const result = await removePublicImage(publicId);
  if (!result || !['ok', 'not found'].includes(result.result)) {
    throw new Error(`Cloudinary did not confirm QR image removal (${result?.result || 'no result'}).`);
  }
}

const publicSettings = (settings) => {
  const saved = settings.gcashPaymentSettings || {};
  const legacy = settings.paymentInstructions || {};
  return {
    gcashQrUrl: saved.gcashQrUrl || legacy.qrImageUrl || '',
    gcashAccountName: saved.gcashAccountName || legacy.accountName || '',
    gcashAccountNumber: saved.gcashAccountNumber || legacy.accountNumber || '',
    paymentInstructions: saved.paymentInstructions || ''
  };
};

const rejectHtml = (value) => /<[^>]*>/.test(value);

function validatePaymentSettings(body, file) {
  if (file) validateProductImage(file);

  const accountName = typeof body.gcashAccountName === 'string' ? body.gcashAccountName.trim() : '';
  const rawAccountNumber = typeof body.gcashAccountNumber === 'string' ? body.gcashAccountNumber.trim() : '';
  const paymentInstructions = typeof body.paymentInstructions === 'string' ? body.paymentInstructions.trim() : '';
  if (accountName.length < 2 || accountName.length > 80) {
    throw Object.assign(new Error('Account name must be 2 to 80 characters.'), { status: 400 });
  }
  if (rejectHtml(accountName)) {
    throw Object.assign(new Error('Account name must not contain HTML tags.'), { status: 400 });
  }
  if (!/^\+?[\d ]+$/.test(rawAccountNumber)) {
    throw Object.assign(new Error('Account number must contain 10 to 13 digits, with optional spaces or a leading +.'), { status: 400 });
  }
  const gcashAccountNumber = rawAccountNumber.replace(/[ +]/g, '');
  if (!/^\d{10,13}$/.test(gcashAccountNumber)) {
    throw Object.assign(new Error('Account number must contain 10 to 13 digits.'), { status: 400 });
  }
  if (rejectHtml(paymentInstructions)) {
    throw Object.assign(new Error('Payment instructions must not contain HTML tags.'), { status: 400 });
  }
  if (paymentInstructions.length > 300) {
    throw Object.assign(new Error('Payment instructions must be 300 characters or fewer.'), { status: 400 });
  }
  return { accountName, gcashAccountNumber, paymentInstructions };
}

async function getPaymentSettings(req, res) {
  try {
    const settings = await ReservationSettings.getDefaults();
    return res.json({ success: true, settings: publicSettings(settings) });
  } catch (error) {
    console.error('[payment-settings] public settings load failed', error);
    return res.status(500).json({ success: false, message: 'Payment settings could not be loaded.' });
  }
}

async function getAdminPaymentSettings(req, res) {
  try {
    const settings = await ReservationSettings.getDefaults();
    return res.json({
      success: true,
      settings: {
        ...publicSettings(settings),
        gcashQrPublicId: settings.gcashPaymentSettings?.gcashQrPublicId || settings.paymentInstructions?.qrImagePublicId || ''
      }
    });
  } catch (error) {
    console.error('[payment-settings] admin settings load failed', error);
    return res.status(500).json({ success: false, message: 'Payment settings could not be loaded.' });
  }
}

async function updateAdminPaymentSettings(req, res) {
  let uploaded;
  let settingsSaved = false;
  try {
    const values = validatePaymentSettings(req.body || {}, req.file);
    if (req.file) uploaded = await uploadPublicImage(req.file, 'revinsight/payment-qr');

    const settings = await ReservationSettings.getDefaults();
    const gcashPaymentSettings = settings.gcashPaymentSettings || {};
    const previousGcashSettings = gcashPaymentSettings.toObject
      ? gcashPaymentSettings.toObject()
      : { ...gcashPaymentSettings };
    const legacyInstructions = settings.paymentInstructions?.toObject
      ? settings.paymentInstructions.toObject()
      : settings.paymentInstructions || {};
    const previousPublicId = gcashPaymentSettings.gcashQrPublicId || settings.paymentInstructions?.qrImagePublicId || '';
    const qrUrl = uploaded?.url || gcashPaymentSettings.gcashQrUrl || settings.paymentInstructions?.qrImageUrl || '';
    const qrPublicId = uploaded?.publicId || gcashPaymentSettings.gcashQrPublicId || settings.paymentInstructions?.qrImagePublicId || '';

    settings.gcashPaymentSettings = {
      gcashQrUrl: qrUrl,
      gcashQrPublicId: qrPublicId,
      gcashAccountName: values.accountName,
      gcashAccountNumber: values.gcashAccountNumber,
      paymentInstructions: values.paymentInstructions,
      updatedAt: new Date()
    };
    settings.paymentInstructions = {
      ...legacyInstructions,
      methodName: legacyInstructions.methodName || 'GCash',
      accountName: values.accountName,
      accountNumber: values.gcashAccountNumber,
      qrImageUrl: qrUrl,
      qrImagePublicId: qrPublicId
    };
    await settings.save();
    settingsSaved = true;

    if (uploaded && previousPublicId && previousPublicId !== uploaded.publicId) {
      try {
        await removeQrImage(previousPublicId);
      } catch (deleteError) {
        try {
          settings.gcashPaymentSettings = previousGcashSettings;
          settings.paymentInstructions = legacyInstructions;
          await settings.save();
          settingsSaved = false;
        } catch (rollbackError) {
          console.error('[payment-settings] failed to restore previous settings after QR cleanup error', rollbackError);
        }
        throw deleteError;
      }
    }

    return res.json({
      success: true,
      settings: {
        ...publicSettings(settings),
        gcashQrPublicId: settings.gcashPaymentSettings.gcashQrPublicId
      }
    });
  } catch (error) {
    if (uploaded?.publicId && !settingsSaved) {
      try {
        await removeQrImage(uploaded.publicId);
      } catch (cleanupError) {
        console.error('[payment-settings] uploaded QR cleanup failed', cleanupError);
      }
    }
    if (Number(error.status) >= 400 && Number(error.status) < 500) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('[payment-settings] update failed', error);
    return res.status(500).json({ success: false, message: 'Payment settings could not be saved.' });
  }
}

module.exports = {
  getPaymentSettings,
  getAdminPaymentSettings,
  updateAdminPaymentSettings
};
