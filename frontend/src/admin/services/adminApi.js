import dashboardMock from '../data/dashboardMock.json';
import { request } from '../../services/api';
import inventoryConfig from '../../../../shared/inventory.json';

const confirmedStatuses = new Set(['completed', 'paid']);
const { LOW_STOCK_THRESHOLD } = inventoryConfig;
// Set VITE_ADMIN_USE_MOCKS=true to use demo data in development.
const useDemoData = import.meta.env.DEV && import.meta.env.VITE_ADMIN_USE_MOCKS === 'true';

function unwrapRows(response) {
  return Array.isArray(response?.data) ? response.data : [];
}

async function getAllPages(fetchPage) {
  const firstPage = await fetchPage(1, 100);
  const rows = unwrapRows(firstPage);
  const totalPages = Number(firstPage?.pagination?.totalPages || 1);
  if (totalPages <= 1) return rows;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2, 100))
  );
  return rows.concat(...remainingPages.map(unwrapRows));
}

function isConfirmed(order) {
  return confirmedStatuses.has(String(order.status || '').toLowerCase());
}

function getOrderRevenue(order) {
  return Number(order.totalPrice ?? order.totalAmount ?? 0);
}

function getUnitsSold(order) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function valueInWindow(orders, valueOf, start, end) {
  return orders.reduce((sum, order) => {
    const createdAt = new Date(order.createdAt);
    return createdAt >= start && createdAt < end ? sum + valueOf(order) : sum;
  }, 0);
}

function getChange(orders, valueOf, durationDays = 30) {
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - durationDays);
  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - durationDays);
  return percentChange(
    valueInWindow(orders, valueOf, currentStart, now),
    valueInWindow(orders, valueOf, previousStart, currentStart)
  );
}

function makeSeries(orders, period) {
  const now = new Date();
  const buckets = [];

  if (period === 'daily') {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let offset = 6; offset >= 0; offset -= 1) {
      const start = new Date(today);
      start.setDate(today.getDate() - offset);
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      buckets.push({ start, end, label: start.toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' }) });
    }
  } else if (period === 'weekly') {
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));
    for (let offset = 7; offset >= 0; offset -= 1) {
      const start = new Date(thisMonday);
      start.setDate(thisMonday.getDate() - offset * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      buckets.push({ start, end, label: start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) });
    }
  } else {
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    for (let offset = 11; offset >= 0; offset -= 1) {
      const start = new Date(thisMonth.getFullYear(), thisMonth.getMonth() - offset, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      buckets.push({ start, end, label: start.toLocaleDateString('en-PH', { month: 'short', timeZone: 'Asia/Manila' }) });
    }
  }

  return buckets.map(({ start, end, label }) => ({
    label,
    value: orders.reduce((sum, order) => {
      const createdAt = new Date(order.createdAt);
      return isConfirmed(order) && createdAt >= start && createdAt < end ? sum + getOrderRevenue(order) : sum;
    }, 0)
  }));
}

async function getOrders() {
  return getAllPages((page, limit) => request(`/api/dashboard/transactions?view=orders&page=${page}&limit=${limit}`));
}

async function getInventoryItems() {
  return getAllPages((page, limit) => request(`/api/dashboard/inventory?page=${page}&limit=${limit}`));
}

function makeDashboardData(stats, orders, inventory) {
  const confirmedOrders = orders.filter(isConfirmed);
  const categoryTotals = new Map();
  confirmedOrders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const name = item.category || item.productName || 'Other';
      categoryTotals.set(name, (categoryTotals.get(name) || 0) + Number(item.price || 0) * Number(item.quantity || 0));
    });
  });

  const inventoryHealth = inventory.reduce((health, item) => {
    const available = Math.max(0, Number(item.quantity || 0) - Number(item.reservedQty || 0));
    if (available <= 0) health.out += 1;
    else if (available <= LOW_STOCK_THRESHOLD) {
      health.low += 1;
      health.lowItems.push({ id: item._id, name: item.name, quantity: available });
    } else health.inStock += 1;
    return health;
  }, { inStock: 0, low: 0, out: 0, lowItems: [] });

  const itemCount = Number(stats.totalInventoryItems ?? inventory.length);
  const sortedCategories = [...categoryTotals.entries()]
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((left, right) => right.revenue - left.revenue);

  return {
    stats: {
      itemsSold: {
        value: confirmedOrders.reduce((sum, order) => sum + getUnitsSold(order), 0),
        change: getChange(confirmedOrders, getUnitsSold),
        sparkline: []
      },
      totalTransactions: {
        value: Number(stats.totalTransactions ?? confirmedOrders.length),
        change: getChange(confirmedOrders, () => 1),
        sparkline: []
      },
      inventoryItems: { value: itemCount, change: 0, sparkline: [] },
      revenue: {
        value: Number(stats.totalRevenue ?? confirmedOrders.reduce((sum, order) => sum + getOrderRevenue(order), 0)),
        change: getChange(confirmedOrders, getOrderRevenue),
        sparkline: []
      },
      collected: Number(stats.collected || 0),
      outstanding: Number(stats.outstanding || 0)
    },
    badges: {
      pendingTransactions: orders.filter((order) => String(order.status).toLowerCase() === 'pending').length,
      lowStock: inventoryHealth.low
    },
    categories: sortedCategories,
    inventoryHealth
  };
}

export const adminApi = {
  loginAdmin: (credentials) => request('/api/admin/login', { method: 'POST', body: JSON.stringify(credentials), tokenKey: null }),
  getDashboardStats: () => request('/api/dashboard/dashboard'),
  getSalesReport: (query = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/dashboard/reports/sales${suffix}`);
  },
  getDailySales: () => request('/api/dashboard/dashboard/daily'),
  getQuarterlySales: () => request('/api/dashboard/dashboard/quarterly'),
  getRevenueConcentration: () => request('/api/dashboard/analytics/revenue-concentration'),
  getRevenueRisk: () => request('/api/dashboard/analytics/revenue-risk'),
  askRevenueAI: (question) => request('/api/admin/revenue/ask-ai', {
    method: 'POST',
    body: JSON.stringify({ question })
  }),
  getRevenueAnalysisData: async () => {
    const [quarterly, risk, concentration] = await Promise.all([
      adminApi.getQuarterlySales(),
      adminApi.getRevenueRisk(),
      adminApi.getRevenueConcentration()
    ]);
    return { quarterly, risk, concentration };
  },
  getDashboardData: async () => {
    if (useDemoData) return dashboardMock;
    const [statsResponse, orders, inventory] = await Promise.all([adminApi.getDashboardStats(), getOrders(), getInventoryItems()]);
    return makeDashboardData(statsResponse.data || {}, orders, inventory);
  },
  getSalesSeries: async (period) => {
    if (useDemoData) return dashboardMock.salesSeries[period] || [];
    return makeSeries(await getOrders(), period);
  },
  getInventory: (page = 1, limit = 15) => request(`/api/dashboard/inventory?page=${page}&limit=${limit}`),
  createInventory: (item) => request('/api/dashboard/inventory', { method: 'POST', body: item }),
  updateInventory: (id, item) => request(`/api/dashboard/inventory/${id}`, { method: 'PUT', body: item }),
  deleteInventory: (id) => request(`/api/dashboard/inventory/${id}`, { method: 'DELETE' }),
  getBusinessRecords: (query = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/dashboard/business-records${suffix}`);
  },
  getTransactions: (query = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/dashboard/transactions${suffix}`);
  },
  getTransaction: (id) => request(`/api/dashboard/transactions/${id}`),
  updateTransaction: (id, transaction) => request(`/api/dashboard/transactions/${id}`, { method: 'PUT', body: JSON.stringify(transaction) }),
  getMechanics: () => request('/api/mechanics/all'),
  createMechanic: (mechanic) => request('/api/mechanics/create', { method: 'POST', body: JSON.stringify(mechanic) }),
  updateMechanic: (id, mechanic) => request(`/api/mechanics/${id}`, { method: 'PUT', body: JSON.stringify(mechanic) }),
  deleteMechanic: (id) => request(`/api/mechanics/${id}`, { method: 'DELETE' }),
  getMechanicsSummary: () => request('/api/admin/mechanics/summary'),
  getNotifications: () => request('/api/admin/notifications'),
  markNotificationRead: (id) => request(`/api/admin/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/api/admin/notifications/read-all', { method: 'POST' }),
  getAdminServiceRequests: (query = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/service-requests${suffix}`);
  },
  getServices: () => request('/api/admin/services', { cache: 'no-store' }),
  getReservationSettings: () => request('/api/admin/reservations/settings'),
  updateReservationSettings: (settings) => request('/api/admin/reservations/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  uploadGcashQr: (file) => {
    const body = new FormData();
    body.append('qr', file);
    return request('/api/admin/reservations/settings/gcash-qr', { method: 'POST', body });
  },
  getBookingSchedule: () => request('/api/admin/reservations/booking-schedule'),
  updateBookingSchedule: (schedule) => request('/api/admin/reservations/booking-schedule', { method: 'PUT', body: JSON.stringify(schedule) }),
  getReservations: (query = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
    });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return request(`/api/admin/reservations${suffix}`);
  },
  getReservationReceipts: (id) => request(`/api/admin/reservations/${encodeURIComponent(id)}/receipts`),
  getServiceRequestReceipts: (id) => request(`/api/service-requests/${encodeURIComponent(id)}/payment-receipts`),
  confirmReservation: (id) => request(`/api/admin/reservations/${id}/confirm`, { method: 'POST' }),
  rejectReservation: (id, reason) => request(`/api/admin/reservations/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  confirmServicePayment: (id) => request(`/api/admin/service-requests/${id}/confirm-payment`, { method: 'POST' }),
  rejectServicePayment: (id, reason) => request(`/api/admin/service-requests/${id}/reject-payment`, { method: 'POST', body: JSON.stringify({ reason }) }),
  markServicePaidAtShop: (id) => request(`/api/admin/service-requests/${id}/paid-at-shop`, { method: 'POST' }),
  completeReservation: (id) => request(`/api/admin/reservations/${id}/complete`, { method: 'POST' }),
  cancelReservation: (id, reason, refundDecision) => request(`/api/admin/reservations/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason, refundDecision }) }),
  decideExpiredReservationRefund: (id, refundDecision) => request(`/api/admin/reservations/${id}/refund-decision`, { method: 'POST', body: JSON.stringify({ refundDecision }) }),
  createService: (service) => request('/api/admin/services', { method: 'POST', body: JSON.stringify(service) }),
  updateService: (id, service) => request(`/api/admin/services/${id}`, { method: 'PUT', body: JSON.stringify(service) }),
  deleteService: (id) => request(`/api/admin/services/${id}`, { method: 'DELETE' }),
  confirmServiceRequest: (requestId, mechanicId) => request('/api/service-requests/assign', { method: 'PUT', body: JSON.stringify({ requestId, mechanicId }) }),
  updateAdminServiceRequestStatus: (requestId, status, details = {}) => request('/api/service-requests/status/admin', { method: 'PUT', body: JSON.stringify({ requestId, status, ...details }) })
};

export { makeDashboardData };
