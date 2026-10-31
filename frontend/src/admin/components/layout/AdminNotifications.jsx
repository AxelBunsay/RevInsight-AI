import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/adminApi';
import NotificationDropdown from '../../../components/NotificationDropdown';
import NotificationContent from '../../../components/NotificationContent';
import { clearNotificationList } from '../../../utils/notificationActions';

function AdminNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await adminApi.getNotifications();
        if (!active) return;
        setNotifications(response.notifications || []);
        setUnreadCount(Number(response.unreadCount || 0));
        setError('');
      } catch (loadError) {
        if (active) setError(loadError.message || 'Notifications could not be loaded.');
      }
    };
    load();
    const interval = window.setInterval(load, 30000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  const openNotification = async (notification) => {
    try {
      if (!notification.read) await adminApi.markNotificationRead(notification._id);
      setNotifications((current) => current.map((item) => item._id === notification._id ? { ...item, read: true } : item));
      setUnreadCount((count) => notification.read ? count : Math.max(0, count - 1));
      setIsOpen(false);
      const tab = notification.recordType === 'service' ? 'services' : 'items';
      navigate(`/admin/transactions?type=${tab}&review=${notification.recordId}`);
    } catch (markError) {
      setError(markError.message || 'Notification could not be opened.');
    }
  };

  const markAllRead = async () => {
    setIsMarkingAllRead(true);
    try {
      await adminApi.markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications((current) => current.map((item) => ({ ...item, read: true })));
      setError('');
    } catch (markError) {
      setError(markError.message || 'Notifications could not be updated.');
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  const clearAll = async () => {
    setIsClearing(true);
    await clearNotificationList({
      clearApi: adminApi.clearNotifications,
      setNotifications,
      setUnreadCount,
      setError
    });
    setIsClearing(false);
  };

  return <div className="admin-notification-area">
    <button className="admin-notification-bell" type="button" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unreadCount > 0 && <span className="admin-notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    {isOpen && <NotificationDropdown
      className="admin-notification-popover"
      notifications={notifications}
      error={error}
      isClearing={isClearing}
      onClearAll={clearAll}
      onMarkAllRead={markAllRead}
      isMarkingAllRead={isMarkingAllRead}
      renderNotification={(notification) => <li key={notification._id} className={notification.read ? '' : 'is-unread'}>
          <button type="button" onClick={() => openNotification(notification)}><NotificationContent message={notification.message} timestamp={notification.createdAt} /></button>
        </li>}
    />}
  </div>;
}

export default AdminNotifications;
