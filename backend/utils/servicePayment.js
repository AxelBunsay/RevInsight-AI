const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const calculateServicePayment = (total, percent) => {
  const totalAmount = roundMoney(total);
  const downPaymentPercent = Number(percent);
  const downPaymentAmount = roundMoney(totalAmount * downPaymentPercent / 100);
  return {
    totalAmount,
    downPaymentPercent,
    downPaymentAmount,
    balanceDue: roundMoney(totalAmount - downPaymentAmount)
  };
};

const getServicePaymentSummary = (request = {}) => {
  const totalAmount = roundMoney(request.totalAmount ?? request.estimatedPrice ?? 0);
  const hasSnapshot = request.downPaymentAmount !== undefined
    && request.downPaymentAmount !== null
    && request.balanceDue !== undefined
    && request.balanceDue !== null;
  const paymentStatus = request.paymentStatus || 'Payment Pending';
  const downPaymentAmount = hasSnapshot
    ? roundMoney(request.downPaymentAmount)
    : totalAmount;
  const balanceDue = hasSnapshot
    ? roundMoney(request.balanceDue)
    : 0;
  const downPaymentPercent = hasSnapshot
    ? Number(request.downPaymentPercent ?? 100)
    : 100;
  const amountPaid = request.amountPaid !== undefined && request.amountPaid !== null
    ? roundMoney(request.amountPaid)
    : ['Confirmed', 'Paid at shop'].includes(paymentStatus)
      ? (paymentStatus === 'Paid at shop' ? totalAmount : downPaymentAmount)
      : 0;

  return {
    totalAmount,
    downPaymentPercent,
    downPaymentAmount,
    balanceDue,
    amountPaid
  };
};

module.exports = { calculateServicePayment, getServicePaymentSummary, roundMoney };
