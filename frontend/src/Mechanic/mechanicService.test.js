import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getMechanicJobs: vi.fn(),
  getMechanicQuoteRequests: vi.fn(),
  getMechanicNotifications: vi.fn(),
  markMechanicNotificationRead: vi.fn(),
  clearMechanicNotifications: vi.fn(),
  submitMechanicQuote: vi.fn()
}));

vi.mock('../services/api', () => ({ api: apiMocks }));

import {
  clearMechanicNotifications,
  getJobActions,
  getMechanicJobs,
  getMechanicNotifications,
  isValidMechanicQuotePrice,
  markMechanicNotificationsRead,
  openMechanicNotification,
  performJobAction
} from './mechanicService';

beforeEach(() => vi.clearAllMocks());

describe('mechanic portal service', () => {
  it('combines quote requests with normal jobs for the Jobs page and Dashboard', async () => {
    apiMocks.getMechanicJobs.mockResolvedValue({ jobs: [{ _id: 'normal', status: 'assigned' }] });
    apiMocks.getMechanicQuoteRequests.mockResolvedValue({ requests: [{
      _id: 'quote',
      quoteStatus: 'quote_requested',
      user: { firstName: 'Don', lastName: 'Baylosis' }
    }] });

    const response = await getMechanicJobs();

    expect(response.jobs).toEqual([
      expect.objectContaining({ _id: 'quote', status: 'quote_requested', customerName: 'Don Baylosis' }),
      { _id: 'normal', status: 'assigned' }
    ]);
  });

  it('adapts mechanic notifications and marks an item read when opened', async () => {
    const createdAt = '2026-11-11T12:00:00.000Z';
    apiMocks.getMechanicNotifications.mockResolvedValue({ unreadCount: 1, notifications: [{
      _id: 'notification-id',
      message: 'New service booking',
      createdAt,
      read: false,
      link: '/mechanic/jobs'
    }] });
    apiMocks.markMechanicNotificationRead.mockResolvedValue({ notification: {
      _id: 'notification-id',
      message: 'New service booking',
      createdAt,
      read: true,
      link: '/mechanic/jobs'
    } });

    const response = await getMechanicNotifications();
    const [notification] = response.notifications;
    const navigate = vi.fn();
    const opened = await openMechanicNotification(notification, navigate);

    expect(notification).toEqual({
      id: 'notification-id',
      text: 'New service booking',
      time: createdAt,
      read: false,
      link: '/mechanic/jobs'
    });
    expect(response.unreadCount).toBe(1);
    expect(apiMocks.markMechanicNotificationRead).toHaveBeenCalledWith('notification-id');
    expect(opened.read).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/mechanic/jobs');
  });

  it('marks all unread mechanic notifications and clears them through the API', async () => {
    const notifications = [
      { id: 'unread', read: false },
      { id: 'read', read: true }
    ];

    await expect(markMechanicNotificationsRead(notifications)).resolves.toEqual([
      { id: 'unread', read: true },
      { id: 'read', read: true }
    ]);
    expect(apiMocks.markMechanicNotificationRead).toHaveBeenCalledTimes(1);
    expect(apiMocks.markMechanicNotificationRead).toHaveBeenCalledWith('unread');
    await expect(clearMechanicNotifications()).resolves.toEqual([]);
    expect(apiMocks.clearMechanicNotifications).toHaveBeenCalledOnce();
  });

  it('validates quote prices and calls the existing quote submission endpoint', async () => {
    expect(isValidMechanicQuotePrice('')).toBe(false);
    expect(isValidMechanicQuotePrice(0)).toBe(false);
    expect(isValidMechanicQuotePrice('250.50')).toBe(true);
    expect(isValidMechanicQuotePrice(999999.99)).toBe(true);
    expect(isValidMechanicQuotePrice(1000000)).toBe(false);

    const job = { _id: 'request-id' };
    const quote = { price: 250.5, note: 'Parts and labor estimate.' };
    await performJobAction(job, 'quote', quote);
    expect(apiMocks.submitMechanicQuote).toHaveBeenCalledWith('request-id', quote);
  });

  it('does not offer Accept on unpaid jobs', () => {
    expect(getJobActions({ status: 'pending', paymentStatus: 'Payment Pending' })).toEqual([]);
    expect(getJobActions({ status: 'pending', paymentStatus: 'Confirmed' })).toEqual(['accept']);
  });
});