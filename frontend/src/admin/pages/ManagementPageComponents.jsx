import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import useAdminModalEffects from '../components/useAdminModalEffects';

export function AdminModalPortal({ children }) {
  const content = <div className="admin-root admin-modal-portal">
    <div className="admin-management-page">{children}</div>
  </div>;

  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}

export function AdminPageFrame({ children }) {
  return <div className="admin-management-page">{children}</div>;
}

export function AdminDialog({ title, children, footer, onClose, dialogClassName = '' }) {
  const bodyRef = useRef(null);
  useAdminModalEffects(true, onClose);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return undefined;
    const keepFocusedFieldVisible = () => {
      const focused = document.activeElement;
      if (!bodyRef.current?.contains(focused)) return;
      requestAnimationFrame(() => focused.scrollIntoView?.({ block: 'nearest' }));
    };
    visualViewport.addEventListener('resize', keepFocusedFieldVisible);
    return () => visualViewport.removeEventListener('resize', keepFocusedFieldVisible);
  }, []);

  return <AdminModalPortal>
    <div
      className="admin-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
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
        <div
          ref={bodyRef}
          className="admin-dialog-body"
          onFocusCapture={(event) => {
            const target = event.target;
            if (!target.matches?.('input, textarea, select')) return;
            requestAnimationFrame(() => target.scrollIntoView?.({ block: 'nearest' }));
          }}
        >{children}</div>
        {footer && <div className="admin-dialog-footer">{footer}</div>}
      </div>
    </div>
  </AdminModalPortal>;
}
