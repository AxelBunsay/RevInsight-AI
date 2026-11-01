import { useEffect, useRef } from 'react';

let activeScrollLocks = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';

export function lockAdminModalScroll(documentRef) {
  if (activeScrollLocks === 0) {
    previousBodyOverflow = documentRef.body.style.overflow;
    previousHtmlOverflow = documentRef.documentElement.style.overflow;
    documentRef.body.style.overflow = 'hidden';
    documentRef.documentElement.style.overflow = 'hidden';
  }
  activeScrollLocks += 1;

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    activeScrollLocks = Math.max(0, activeScrollLocks - 1);
    if (activeScrollLocks === 0) {
      documentRef.body.style.overflow = previousBodyOverflow;
      documentRef.documentElement.style.overflow = previousHtmlOverflow;
    }
  };
}

export function createAdminModalLifecycle(documentRef, onClose) {
  const releaseScroll = lockAdminModalScroll(documentRef);
  const closeOnEscape = (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onClose?.();
  };
  documentRef.addEventListener('keydown', closeOnEscape);

  return () => {
    documentRef.removeEventListener('keydown', closeOnEscape);
    releaseScroll();
  };
}

export default function useAdminModalEffects(isOpen, onClose) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    return createAdminModalLifecycle(document, () => onCloseRef.current?.());
  }, [isOpen]);
}