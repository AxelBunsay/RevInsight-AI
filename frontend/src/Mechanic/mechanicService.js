import { api } from '../services/api';

export const loginMechanic = (credentials) => api.loginMechanic(credentials);
export const getMechanicProfile = () => api.getMechanicProfile();
export const getMechanicJobs = () => api.getMechanicJobs();
export const saveMechanicProfile = (profile) => api.updateMechanicProfile(profile);
export const updateMechanicAvailability = (availabilityStatus, profile) => saveMechanicProfile({ ...profile, availabilityStatus });
export const getMechanicNotifications = () => Promise.resolve([]);
export const markMechanicNotificationsRead = () => Promise.resolve([]);

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
  ['mechanicToken', 'mechanicUser', 'mechanicMode', 'mechanicDemoProfile', 'mechanicDemoJobs', 'mechanicDemoNotifications'].forEach((key) => localStorage.removeItem(key));
}
