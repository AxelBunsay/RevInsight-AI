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
  const searchTerms = String(query || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  return records.filter((record) => {
    if (searchTerms.length) {
      const value = record.value || {};
      const items = (value.items || []).flatMap((item) => [
        item.name,
        item.productName,
        item.variantLabel
      ]);
      const searchText = [
        record.reference,
        String(record.reference || '').replace(/[^a-z0-9]/gi, ''),
        record.status,
        value.status,
        value.paymentStatus,
        value.serviceType,
        value.serviceName,
        value.name,
        value.unitLabel,
        value.vehicle,
        value.vehicleModel,
        value.vehicleName,
        value.motorcycle,
        ...items
      ].filter(Boolean).join(' ').toLowerCase();
      if (!searchTerms.every((term) => searchText.includes(term))) return false;
    }
    if (statusFilter === 'completed') return isCompleted(record.status);
    if (statusFilter === 'cancelled') return isCancelledOrExpired(record.status);
    if (statusFilter === 'active') return !isCompleted(record.status) && !isCancelledOrExpired(record.status);
    return true;
  });
}
