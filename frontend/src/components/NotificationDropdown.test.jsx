import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import NotificationDropdown from './NotificationDropdown';
import { clearNotificationList } from '../utils/notificationActions';

const notifications = [
  { _id: 'notification-1', message: 'A new notification', read: false }
];

describe('notification dropdown actions', () => {
  it('shows Clear all for a non-empty list and hides it when empty', () => {
    const render = (items) => renderToStaticMarkup(
      <NotificationDropdown
        className="customer-notification-popover"
        notifications={items}
        error=""
        isClearing={false}
        onClearAll={() => {}}
        renderNotification={(notification) => <li key={notification._id}>{notification.message}</li>}
      />
    );

    expect(render(notifications)).toContain('Clear all');
    expect(render(notifications)).toContain('A new notification');
    expect(render([])).not.toContain('Clear all');
    expect(render([])).toContain('No notifications');
  });

  it('calls the clear API, clears the list and unread badge count', async () => {
    const clearApi = vi.fn().mockResolvedValue({ unreadCount: 0 });
    const setNotifications = vi.fn();
    const setUnreadCount = vi.fn();
    const setError = vi.fn();

    await expect(clearNotificationList({
      clearApi,
      setNotifications,
      setUnreadCount,
      setError
    })).resolves.toBe(true);

    expect(clearApi).toHaveBeenCalledOnce();
    expect(setNotifications).toHaveBeenCalledWith([]);
    expect(setUnreadCount).toHaveBeenCalledWith(0);
    expect(setError).toHaveBeenCalledWith('');
  });

  it('keeps the existing list and surfaces an error if clearing fails', async () => {
    const setNotifications = vi.fn();
    const setUnreadCount = vi.fn();
    const setError = vi.fn();
    const clearApi = vi.fn().mockRejectedValue(new Error('Could not clear notifications.'));

    await expect(clearNotificationList({
      clearApi,
      setNotifications,
      setUnreadCount,
      setError
    })).resolves.toBe(false);

    expect(setNotifications).not.toHaveBeenCalled();
    expect(setUnreadCount).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith('Could not clear notifications.');
  });
});
