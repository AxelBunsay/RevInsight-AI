import { api } from '../services/api';
import { clearAuthSession } from '../auth/authSession';

export const loginMechanic = (credentials) => api.loginMechanic(credentials);
export const getMechanicProfile = () => api.getMechanicProfile();
export const getMechanicJobs = async () => {
  const [jobResponse, quoteResponse] = await Promise.all([
    api.getMechanicJobs(),
    api.getMechanicQuoteRequests()
  ]);
  const quoteRequests = (quoteResponse.requests || []).map((request) => {
    const customer = request.user || {};
    return {
      ...request,
      status: 'quote_requested',
      customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email || 'Customer'
    };
  });
  return { ...jobResponse, jobs: [...quoteRequests, ...(jobResponse.jobs || [])] };
};
export const saveMechanicProfile = (profile) => api.updateMechanicProfile(profile);
export const updateMechanicAvailability = (availabilityStatus, profile) => saveMechanicProfile({ ...profile, availabilityStatus });
const adaptNotification = (notification) => ({
  id: String(notification._id || notification.id),
  text: notification.message || notification.text || '',
  time: notification.createdAt || notification.time || '',
  read: Boolean(notification.read),
  link: notification.link || ''
});

export const getMechanicNotifications = async () => {
  const response = await api.getMechanicNotifications();
  return {
    notifications: (response.notifications || []).map(adaptNotification),
    unreadCount: Number(response.unreadCount) || 0
  };
};

export const markMechanicNotificationRead = async (notificationId) => {
  const response = await api.markMechanicNotificationRead(notificationId);
  return adaptNotification(response.notification);
};

export async function openMechanicNotification(notification, navigate) {
  const updated = notification.read
    ? notification
    : await markMechanicNotificationRead(notification.id);
  if (updated.link) navigate(updated.link);
  return updated;
}

export const markMechanicNotificationsRead = async (notifications) => {
  const unread = notifications.filter((notification) => !notification.read);
  await Promise.all(unread.map((notification) => api.markMechanicNotificationRead(notification.id)));
  return notifications.map((notification) => ({ ...notification, read: true }));
};

export const clearMechanicNotifications = async () => {
  await api.clearMechanicNotifications();
  return [];
};

export function isValidMechanicQuotePrice(value) {
  if (value === '' || value === null || value === undefined) return false;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 && price <= 999999.99;
}

const paidStatuses = ['Confirmed', 'Paid at shop'];

export function isWaitingForPaymentConfirmation(job) {
  const canAccept = (job.status === 'pending' && !job.mechanic && !job.mechanicId)
    || job.status === 'confirmed';
  return canAccept && !paidStatuses.includes(job.paymentStatus);
}

export function getJobActions(job) {
  if (job.quoteStatus === 'quote_requested' || job.status === 'quote_requested') return ['quote'];
  const actions = (job.status === 'pending' && !job.mechanic && !job.mechanicId)
    ? ['accept']
    : ({
    assigned: ['start', 'decline'],
    confirmed: ['accept', 'decline'],
    accepted: ['start'],
    'in-progress': ['complete']
    })[job.status] || [];
  return actions.filter((action) => action !== 'accept' || paidStatuses.includes(job.paymentStatus));
}

export async function performJobAction(job, action, details) {
  if (action === 'quote') return api.submitMechanicQuote(job._id, details);
  if (action === 'complete') return api.updateMechanicJobStatus(job._id, 'completed');
  if (action === 'accept') return api.acceptMechanicJob(job._id, job.startTime || '');
  const status = { decline: 'declined', start: 'in-progress' }[action];
  if (status) return api.updateMechanicJobStatus(job._id, status);
  throw new Error('Unknown job action.');
}

export function logoutMechanic() {
  clearAuthSession('mechanic');
  ['mechanicMode', 'mechanicDemoProfile', 'mechanicDemoJobs', 'mechanicDemoNotifications'].forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}
