export const itemFilterOptions = [
  { value: 'All', label: 'All' },
  { value: 'Walk-in/Completed sales', label: 'Walk-in/Completed sales' },
  { value: 'Reservations (all)', label: 'Reservations (all)' },
  { value: 'Payment Submitted', label: 'Payment Submitted' },
  { value: 'Reserved', label: 'Reserved' },
  { value: 'Pending Down Payment', label: 'Pending Down Payment' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Cancelled/Expired', label: 'Cancelled/Expired' }
];

export function getItemsRequest({ page, limit = 10, statusFilter, search }) {
  const itemView = statusFilter === 'Walk-in/Completed sales'
    ? 'sales'
    : ['Reservations (all)', 'Payment Submitted', 'Reserved', 'Pending Down Payment', 'Completed', 'Cancelled/Expired'].includes(statusFilter)
      ? 'reservations'
      : 'all';
  const status = statusFilter === 'Walk-in/Completed sales'
    ? 'Completed'
    : statusFilter === 'Reservations (all)' || statusFilter === 'All'
      ? ''
      : statusFilter;
  return {
    page,
    limit,
    type: 'item',
    itemView,
    status,
    search: search.trim()
  };
}

export function getItemsPageData(response, formatRecord) {
  const rows = (response.data || []).map(formatRecord);
  const totalRecords = Number(response.pagination?.totalRecords ?? rows.length);
  return {
    rows,
    totalRecords,
    totalAmount: Number(response.totalAmount || 0),
    totalPages: Math.max(1, Number(response.pagination?.totalPages || Math.ceil(totalRecords / 10)))
  };
}
