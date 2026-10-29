export function getPaymentDisplaySettings(reservationSettings, fetchedSettings) {
  const legacy = reservationSettings?.paymentInstructions || {};
  return {
    methodName: legacy.methodName || 'GCash',
    qrImageUrl: fetchedSettings?.gcashQrUrl || legacy.qrImageUrl || '',
    accountName: fetchedSettings?.gcashAccountName || legacy.accountName || '',
    accountNumber: fetchedSettings?.gcashAccountNumber || legacy.accountNumber || '',
    paymentInstructions: fetchedSettings?.paymentInstructions || ''
  };
}
