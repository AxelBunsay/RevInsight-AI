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
  if (booking.walkInId) {
    const amountPaid = Number(booking.amountPaid || 0);
    return { totalAmount, amountPaid, balanceDue: Math.max(0, totalAmount - amountPaid) };
  }
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
  if (booking.status === 'in-progress') return 'In progress';
  if (booking.queueKey && !['completed','cancelled','declined'].includes(booking.status) && booking.quoteCheckout !== 'awaiting' && booking.paymentStatus === 'Payment Pending' && booking.paymentMethod === 'Cash') return 'Pending cash payment';
  if ((booking.walkInId || booking.queueKey) && !booking.quoteStatus && ['pending','accepted','assigned','confirmed'].includes(booking.status)) return 'Waiting';
  if (booking.quoteStatus === 'accepted') {
    if (['cancelled','completed','declined'].includes(booking.status)) return booking.status[0].toUpperCase()+booking.status.slice(1);
    if (booking.status === 'in-progress') return 'In progress';
    if (booking.quoteCheckout === 'awaiting') return 'Awaiting checkout';
    if (booking.status === 'confirmed') return 'Confirmed';
  }
  const quoteStatuses = {
    quote_requested: 'Awaiting quote',
    quoted: 'Quote ready',
    accepted: 'Accepted',
    rejected: 'Rejected',
    declined: 'Declined by mechanic',
    cancelled: 'Cancelled'
  };
  if (quoteStatuses[booking.quoteStatus]) return quoteStatuses[booking.quoteStatus];
  if (booking.status === 'completed') return 'Completed';
  if (booking.status === 'cancelled') return 'Cancelled';
  if (booking.paymentStatus === 'Payment Submitted') return 'Payment Submitted';
  if (booking.paymentStatus === 'Payment Pending') return 'Payment Pending';
  if (['Confirmed', 'Paid at shop'].includes(booking.paymentStatus)) return 'Confirmed';
  return String(booking.status || 'pending').replace(/^./, (letter) => letter.toUpperCase());
}
