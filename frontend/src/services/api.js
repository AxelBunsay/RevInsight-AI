import { clearAuthSession, getAuthToken } from '../auth/authSession';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');
export async function request(path, options = {}) {
  const tokenKey = Object.prototype.hasOwnProperty.call(options, 'tokenKey')
    ? options.tokenKey
    : null;
  const token = tokenKey === 'customerToken'
    ? getAuthToken('customer')
    : tokenKey === 'mechanicToken'
      ? getAuthToken('mechanic')
      : tokenKey ? localStorage.getItem(tokenKey) : null;
  const requestOptions = { ...options };
  delete requestOptions.tokenKey;
  const suppressAuthRedirect = requestOptions.suppressAuthRedirect === true;
  delete requestOptions.suppressAuthRedirect;
  const headers = new Headers(options.headers);

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...requestOptions, headers });
  } catch (error) {
    throw new Error(`Unable to reach the backend at ${API_URL}. Start the backend server and check its database connection.`, { cause: error });
  }

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const isAuthException = /\/(?:users|mechanics)\/login(?:[/?]|$)/.test(path)
      || /\/customers\/me\/password(?:[/?]|$)/.test(path)
      || /\/users\/2fa\/(?:enable|disable)(?:[/?]|$)/.test(path)
      || (path === '/api/customers/me' && requestOptions.method === 'DELETE');
    const invalidToken = response.status === 401 && body?.message === 'Invalid token';
    if (invalidToken && token && tokenKey && !isAuthException) {
      if (tokenKey === 'customerToken' || tokenKey === 'mechanicToken') {
        clearAuthSession(tokenKey === 'customerToken' ? 'customer' : 'mechanic');
      } else {
        localStorage.removeItem(tokenKey);
      }
      if (tokenKey === 'adminToken') {
        window.dispatchEvent(new Event('admin-auth-expired'));
      } else if (!suppressAuthRedirect && (tokenKey === 'customerToken' || tokenKey === 'mechanicToken')) {
        const loginPath = tokenKey === 'customerToken' ? '/customer/login' : '/mechanic/login';
        const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.assign(`${loginPath}?returnTo=${encodeURIComponent(returnPath)}`);
      }
    }

    const message = typeof body === 'string' ? body : body?.message;
    const requestError = new Error(message || `Request failed with status ${response.status}`);
    requestError.status = response.status;
    requestError.fieldErrors = body?.fieldErrors || {};
    requestError.details = body;
    throw requestError;
  }

  return body;
}

export const api = {
  loginCustomer: (credentials) => request('/api/users/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
    tokenKey: null
  }),
  verifyCustomerLoginOtp: (credentials) => request('/api/users/login/verify-otp', {
    method: 'POST',
    body: JSON.stringify(credentials),
    tokenKey: null
  }),
  resendCustomerLoginOtp: (identifier) => request('/api/users/login/resend-otp', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
    tokenKey: null
  }),
  setCustomerTwoFactor: (enabled, currentPassword) => request(`/api/users/2fa/${enabled ? 'enable' : 'disable'}`, {
    method: 'POST',
    body: JSON.stringify({ currentPassword }),
    tokenKey: 'customerToken'
  }),
  loginMechanic: (credentials) => request('/api/mechanics/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
    tokenKey: null
  }),
  getCustomerProfile: (options = {}) => request('/api/users/profile', {
    ...options,
    tokenKey: 'customerToken',
    cache: 'no-store'
  }),
  getMechanicProfile: (options = {}) => request('/api/mechanics/profile', {
    ...options,
    tokenKey: 'mechanicToken',
    cache: 'no-store'
  }),
  updateCustomerProfile: (profile) => request('/api/customers/me', {
    method: 'PUT',
    body: JSON.stringify(profile),
    tokenKey: 'customerToken'
  }),
  uploadCustomerProfileImage: (file) => {
    const body = new FormData();
    body.append('image', file);
    return request('/api/customers/me/profile-image', {
      method: 'POST',
      body,
      tokenKey: 'customerToken'
    });
  },
  removeCustomerProfileImage: () => request('/api/customers/me/profile-image', {
    method: 'DELETE',
    tokenKey: 'customerToken'
  }),
  changeCustomerPassword: (passwords) => request('/api/customers/me/password', {
    method: 'POST',
    body: JSON.stringify(passwords),
    tokenKey: 'customerToken'
  }),
  deleteCustomerAccount: () => request('/api/customers/me', {
    method: 'DELETE',
    tokenKey: 'customerToken'
  }),
  registerCustomer: (userData) => request('/api/users/register-request', {
    method: 'POST',
    body: JSON.stringify(userData)
  }),
  verifyOtp: (email, otp) => request('/api/users/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp })
  }),
  resendOtp: (email) => request('/api/users/resend-otp', {
    method: 'POST',
    body: JSON.stringify({ email })
  }),
  getProducts: (page = 1, limit = 50) => request(`/api/products?page=${page}&limit=${limit}`, { tokenKey: 'customerToken' }),
  getProduct: (productId) => request(`/api/products/${productId}`),
  getServices: () => request('/api/services', { tokenKey: 'customerToken', cache: 'no-store' }),
  getService: (serviceId) => request(`/api/services/${encodeURIComponent(serviceId)}`, { tokenKey: 'customerToken', cache: 'no-store' }),
  getCart: () => request('/api/cart', { tokenKey: 'customerToken' }),
  addToCart: (productId, quantity = 1) => request('/api/cart/add', { method: 'POST', body: JSON.stringify({ productId, quantity }), tokenKey: 'customerToken' }),
  updateCart: (productId, quantity) => request(`/api/cart/update/${productId}`, { method: 'PUT', body: JSON.stringify({ quantity }), tokenKey: 'customerToken' }),
  removeFromCart: (productId) => request(`/api/cart/remove/${productId}`, { method: 'DELETE', tokenKey: 'customerToken' }),
  clearCart: () => request('/api/cart/clear', { method: 'DELETE', tokenKey: 'customerToken' }),
  checkout: (items) => request('/api/orders/checkout', { method: 'POST', body: JSON.stringify({ items }), tokenKey: 'customerToken' }),
  getCustomerOrders: () => request('/api/orders', { tokenKey: 'customerToken' }),
  getReservationSettings: () => request('/api/reservations/settings', { tokenKey: 'customerToken' }),
  getPaymentSettings: () => request('/api/payment-settings', { tokenKey: null, cache: 'no-store' }),
  getShopSettings: () => request('/api/reservations/shop-settings', { tokenKey: 'customerToken' }),
  createReservation: (items) => request('/api/reservations', { method: 'POST', body: JSON.stringify({ items }), tokenKey: 'customerToken' }),
  getCustomerReservations: () => request('/api/reservations', { tokenKey: 'customerToken' }),
  getCustomerReservation: (reservationId) => request(`/api/reservations/${reservationId}`, { tokenKey: 'customerToken' }),
  submitReservationPayment: (reservationId, payment) => {
    const body = new FormData();
    body.append('reference', payment.reference);
    body.append('proof', payment.proof);
    return request(`/api/reservations/${reservationId}/payment`, { method: 'POST', body, tokenKey: 'customerToken' });
  },
  getCustomerNotifications: () => request('/api/notifications', { tokenKey: 'customerToken' }),
  clearCustomerNotifications: () => request('/api/notifications', { method: 'DELETE', tokenKey: 'customerToken' }),
  markCustomerNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: 'POST', tokenKey: 'customerToken' }),
  cancelCustomerReservation: (reservationId, reason) => request(`/api/reservations/${reservationId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }), tokenKey: 'customerToken' }),
  reorder: (orderId) => request(`/api/orders/${orderId}/reorder`, { method: 'POST', tokenKey: 'customerToken' }),
  getCustomerServiceRequests: () => request('/api/service-requests/my', { tokenKey: 'customerToken' }),
  submitServiceRequestPayment: (requestId, payment) => {
    const body = new FormData();
    body.append('reference', payment.reference);
    body.append('proof', payment.proof);
    return request(`/api/service-requests/${requestId}/payment`, { method: 'POST', body, tokenKey: 'customerToken' });
  },
  getServiceSlots: (serviceId, date, units = 1) => request(`/api/services/${encodeURIComponent(serviceId)}/slots?date=${encodeURIComponent(date)}&units=${encodeURIComponent(units)}`, { tokenKey: 'customerToken', cache: 'no-store' }),
  createServiceBookings: (bookings) => request('/api/services/bookings', { method: 'POST', body: JSON.stringify({ bookings }), tokenKey: 'customerToken' }),
  getAvailableMechanics: () => request('/api/mechanics/available', { tokenKey: 'customerToken' }),
  getMechanicStats: (mechanicId) => request(`/api/mechanic/${encodeURIComponent(mechanicId)}/stats`, { tokenKey: 'mechanicToken' }),
  updateMechanicProfile: (profile) => request('/api/mechanics/profile', { method: 'PUT', body: JSON.stringify(profile), tokenKey: 'mechanicToken' }),
  getMechanicJobs: () => request('/api/service-requests/mechanic', { tokenKey: 'mechanicToken' }),
  acceptMechanicJob: (requestId, startTime) => request('/api/service-requests/accept', { method: 'PUT', body: JSON.stringify({ requestId, startTime }), tokenKey: 'mechanicToken' }),
  updateMechanicJobStatus: (requestId, status) => request('/api/service-requests/status', { method: 'PUT', body: JSON.stringify({ requestId, status }), tokenKey: 'mechanicToken' })
};
