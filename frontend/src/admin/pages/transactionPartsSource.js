export const SERVICE_TRANSACTION_EXPORT_HEADERS = Object.freeze([
  'Record ID',
  'Date',
  'Customer',
  'Service',
  'Parts source',
  'Mechanic',
  'Total',
  'Down payment paid',
  'Balance to collect',
  'Status'
]);

export function getPartsSourceQuery(filter) {
  return filter === 'shop' || filter === 'customer' ? filter : '';
}

export function getPartsSourceExportValue(transaction) {
  if (transaction?.recordType !== 'service' && !transaction?.isServiceRequest) return '';
  return transaction.partsSource === 'customer' ? 'customer' : 'shop';
}