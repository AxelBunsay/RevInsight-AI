function formatTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export default function NotificationContent({ message, timestamp }) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const dateTime = Number.isNaN(date.getTime()) ? undefined : date.toISOString();

  return <div className="notification-content">
    <p className="notification-message">{message}</p>
    <time className="notification-timestamp" dateTime={dateTime}>{formatTimestamp(timestamp)}</time>
  </div>;
}
