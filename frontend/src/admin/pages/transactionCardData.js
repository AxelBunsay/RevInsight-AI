export function formatTransactionMoney(value) {
  return `₱${Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function getShortTransactionId(transaction) {
  const recordId = String(transaction.code || transaction.id || transaction._id || '');
  return recordId.length > 12 ? recordId.slice(-8) : recordId;
}