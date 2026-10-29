export function calculateServicePayment(total, percent) {
  const totalAmount = Math.round((Number(total) + Number.EPSILON) * 100) / 100;
  const downPaymentPercent = Number(percent);
  const downPaymentAmount = Math.round((totalAmount * downPaymentPercent / 100 + Number.EPSILON) * 100) / 100;
  return {
    totalAmount,
    downPaymentPercent,
    downPaymentAmount,
    balanceDue: Math.round((totalAmount - downPaymentAmount + Number.EPSILON) * 100) / 100
  };
}

export function getServicePaymentSummary(booking = {}) {
  const totalAmount = Number(booking.totalAmount ?? booking.estimatedPrice ?? 0);
  const hasSnapshot = booking.downPaymentAmount !== undefined
    && booking.downPaymentAmount !== null
    && booking.balanceDue !== undefined
    && booking.balanceDue !== null;
  const paymentStatus = booking.paymentStatus || 'Payment Pending';
  const downPaymentAmount = hasSnapshot ? Number(booking.downPaymentAmount) : totalAmount;
  const balanceDue = hasSnapshot ? Number(booking.balanceDue) : 0;
  const downPaymentPercent = hasSnapshot ? Number(booking.downPaymentPercent ?? 100) : 100;
  const amountPaid = booking.amountPaid !== undefined && booking.amountPaid !== null
    ? Number(booking.amountPaid)
    : ['Confirmed', 'Paid at shop'].includes(paymentStatus)
      ? paymentStatus === 'Paid at shop' ? totalAmount : downPaymentAmount
      : 0;

  return {
    totalAmount,
    downPaymentPercent,
    downPaymentAmount,
    balanceDue,
    amountPaid
  };
}

export function getServiceBookingStatus(booking = {}) {
  if (booking.status === 'completed') return 'Completed';
  if (booking.status === 'cancelled') return 'Cancelled';
  if (booking.paymentStatus === 'Payment Submitted') return 'Payment Submitted';
  if (booking.paymentStatus === 'Payment Pending') return 'Payment Pending';
  if (['Confirmed', 'Paid at shop'].includes(booking.paymentStatus)) return 'Confirmed';
  return String(booking.status || 'pending').replace(/^./, (letter) => letter.toUpperCase());
}
