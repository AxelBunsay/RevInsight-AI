export const purchaseTabs = ['all', 'items', 'services'];

export function getPurchaseTab(search) {
  const tab = new URLSearchParams(search).get('tab');
  return purchaseTabs.includes(tab) ? tab : 'all';
}

export function getLegacyProfilePurchaseRedirect(search) {
  const tab = new URLSearchParams(search).get('tab');
  if (tab === 'reservations') return '/my-purchases?tab=items';
  if (tab === 'bookings') return '/my-purchases?tab=services';
  return null;
}

export function getLegacyCustomerPurchaseLink(link) {
  if (!link) return null;
  try {
    const url = new URL(link, 'https://customer.local');
    if (url.pathname !== '/customer/profile') return null;
    return getLegacyProfilePurchaseRedirect(url.search);
  } catch {
    return null;
  }
}

export function recordsForPurchaseTab(records, tab) {
  if (tab === 'items') return records.filter((record) => record.type === 'item');
  if (tab === 'services') return records.filter((record) => record.type === 'service');
  return records;
}

function isCompleted(status) {
  return String(status || '').toLowerCase() === 'completed';
}

function isCancelledOrExpired(status) {
  return ['cancelled', 'declined', 'expired'].includes(String(status || '').toLowerCase());
}

export function filterPurchaseRecords(records, statusFilter, query) {
  const referenceQuery = String(query || '').trim().toLowerCase();
  return records.filter((record) => {
    if (referenceQuery && !String(record.reference || '').toLowerCase().includes(referenceQuery)) return false;
    if (statusFilter === 'completed') return isCompleted(record.status);
    if (statusFilter === 'cancelled') return isCancelledOrExpired(record.status);
    if (statusFilter === 'active') return !isCompleted(record.status) && !isCancelledOrExpired(record.status);
    return true;
  });
}
