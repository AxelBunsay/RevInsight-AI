import { describe, expect, it } from 'vitest';
import { createCustomerModalLifecycle, lockCustomerDocumentScroll } from './useCustomerModalEffects';

function makeDocument() {
  return {
    body: { style: { overflow: 'auto' } },
    documentElement: { style: { overflow: 'scroll' } },
    handlers: {},
    addEventListener(type, handler) { this.handlers[type] ||= new Set(); this.handlers[type].add(handler); },
    removeEventListener(type, handler) { this.handlers[type]?.delete(handler); },
    dispatch(event) { [...(this.handlers[event.type] || [])].forEach((handler) => handler(event)); }
  };
}

describe('customer popup scroll lock', () => {
  it('releases the page lock for every close route', () => {
    for (const closeRoute of ['close button', 'Cancel', 'Save success', 'Escape', 'overlay click', 'route change', 'unmount']) {
      const documentRef = makeDocument();
      let cleanup;
      const onClose = () => cleanup();
      cleanup = createCustomerModalLifecycle(documentRef, onClose);
      expect(documentRef.body.style.overflow, closeRoute).toBe('hidden');
      if (closeRoute === 'Escape') {
        documentRef.dispatch({ type: 'keydown', key: 'Escape', defaultPrevented: false, preventDefault() {}, stopImmediatePropagation() {} });
      } else if (closeRoute === 'route change' || closeRoute === 'unmount') cleanup();
      else onClose();
      expect(documentRef.body.style.overflow, closeRoute).toBe('auto');
      expect(documentRef.documentElement.style.overflow, closeRoute).toBe('scroll');
      expect(documentRef.handlers.keydown?.size || 0, closeRoute).toBe(0);
    }
  });

  it('keeps the document locked until the last nested popup closes', () => {
    const documentRef = makeDocument();
    const closePayment = lockCustomerDocumentScroll(documentRef);
    const closePreview = lockCustomerDocumentScroll(documentRef);
    closePreview();
    expect(documentRef.body.style.overflow).toBe('hidden');
    closePayment();
    expect(documentRef.body.style.overflow).toBe('auto');
  });

  it('sends Escape to the topmost nested popup first', () => {
    const documentRef = makeDocument();
    const closed = [];
    const closePayment = createCustomerModalLifecycle(documentRef, () => closed.push('payment'));
    const closePreview = createCustomerModalLifecycle(documentRef, () => closed.push('preview'));
    documentRef.dispatch({ type: 'keydown', key: 'Escape', defaultPrevented: false, preventDefault() {}, stopImmediatePropagation() {} });

    expect(closed).toEqual(['preview']);
    closePreview();
    closePayment();
  });
});