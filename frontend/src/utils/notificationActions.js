export async function clearNotificationList({ clearApi, setNotifications, setUnreadCount, setError }) {
  try {
    const response = await clearApi();
    setNotifications([]);
    setUnreadCount(Number(response.unreadCount || 0));
    setError('');
    return true;
  } catch (error) {
    setError(error.message || 'Notifications could not be cleared.');
    return false;
  }
}
