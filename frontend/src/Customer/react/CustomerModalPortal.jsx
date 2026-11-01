import { createPortal } from 'react-dom';

export default function CustomerModalPortal({ children }) {
  const content = <div className="customer-modal-portal">{children}</div>;
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}