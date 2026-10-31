export function AdminPageFrame({ children }) {
  return <div className="admin-management-page">{children}</div>;
}

export function AdminDialog({ title, children, onClose, dialogClassName = '' }) {
  return (
    <div
      className="admin-dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className={`admin-dialog${dialogClassName ? ` ${dialogClassName}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-dialog-header">
          <h2 id="admin-dialog-title">{title}</h2>
          <button
            className="admin-dialog-close"
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
