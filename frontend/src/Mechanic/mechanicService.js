import { api, request } from '../services/api';
import { clearAuthSession } from '../auth/authSession';

export const loginMechanic = (credentials) => api.loginMechanic(credentials);
export const getMechanicProfile = () => api.getMechanicProfile();
export const getMechanicJobs = () => api.getMechanicJobs();
export const getMechanicQuoteRequests = () => request('/api/service-requests/mechanic/quotes', { tokenKey: 'mechanicToken' });
export const submitMechanicQuote = (requestId, quote) => request(`/api/service-requests/${requestId}/quote`, {
  method: 'POST',
  body: JSON.stringify(quote),
  tokenKey: 'mechanicToken'
});
export const declineMechanicQuoteRequest = (requestId, reason) => request(`/api/service-requests/${requestId}/quote/decline`, {
  method: 'POST',
  body: JSON.stringify({ reason }),
  tokenKey: 'mechanicToken'
});
export const saveMechanicProfile = (profile) => api.updateMechanicProfile(profile);
export const updateMechanicAvailability = (availabilityStatus, profile) => saveMechanicProfile({ ...profile, availabilityStatus });
export const getMechanicNotifications = async () => {
  const response = await request('/api/mechanics/notifications', { tokenKey: 'mechanicToken' });
  return (response.notifications || []).map((notification) => ({
    ...notification,
    id: notification._id,
    text: notification.message,
    time: notification.createdAt
  }));
};
export const markMechanicNotificationsRead = async () => {
  const notifications = await getMechanicNotifications();
  await Promise.all(notifications.filter((notification) => !notification.read).map((notification) =>
    request(`/api/mechanics/notifications/${notification.id}/read`, { method: 'POST', tokenKey: 'mechanicToken' })
  ));
  return getMechanicNotifications();
};
export const clearMechanicNotifications = async () => {
  await request('/api/mechanics/notifications', { method: 'DELETE', tokenKey: 'mechanicToken' });
  return [];
};

export function getJobActions(job) {
  if (job.status === 'pending' && !job.mechanic) return ['accept'];
  return ({
    assigned: ['start', 'decline'],
    confirmed: ['accept', 'decline'],
    accepted: ['start'],
    'in-progress': ['complete']
  })[job.status] || [];
}

export async function performJobAction(job, action) {
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
