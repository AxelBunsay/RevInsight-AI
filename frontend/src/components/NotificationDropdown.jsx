export default function NotificationDropdown({
  className,
  notifications,
  error,
  isClearing,
  onClearAll,
  onMarkAllRead,
  isMarkingAllRead,
  renderNotification,
  emptyMessage = 'No notifications'
}) {
  const headerClass = `${className}-header`;
  return <section className={`${className} notification-dropdown`} aria-label="Notifications">
    <header className={`${headerClass} notification-dropdown-header`}>
      <strong>Notifications</strong>
      <div className="notification-dropdown-actions">
        {onMarkAllRead && <button type="button" disabled={!notifications.length || isMarkingAllRead} onClick={onMarkAllRead}>Mark all read</button>}
        {notifications.length > 0 && <button type="button" disabled={isClearing} onClick={onClearAll}>
          {isClearing ? 'Clearing...' : 'Clear all'}
        </button>}
      </div>
    </header>
    {error && <p className="notification-dropdown-error" role="alert">{error}</p>}
    {notifications.length > 0
      ? <ul>{notifications.map(renderNotification)}</ul>
      : !error && <p className="notification-dropdown-empty">{emptyMessage}</p>}
  </section>;
}
