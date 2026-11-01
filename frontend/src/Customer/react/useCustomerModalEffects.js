import { useEffect, useRef } from 'react';

let activeScrollLocks = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';
const activeModalClosers = [];

export function lockCustomerDocumentScroll(documentRef) {
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

export function createCustomerModalLifecycle(documentRef, onClose) {
  const releaseScroll = lockCustomerDocumentScroll(documentRef);
  const closeOnEscape = (event) => {
    if (activeModalClosers.at(-1) !== closeOnEscape) return;
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onClose?.();
  };
  activeModalClosers.push(closeOnEscape);
  documentRef.addEventListener('keydown', closeOnEscape);

  return () => {
    documentRef.removeEventListener('keydown', closeOnEscape);
    const closerIndex = activeModalClosers.lastIndexOf(closeOnEscape);
    if (closerIndex >= 0) activeModalClosers.splice(closerIndex, 1);
    releaseScroll();
  };
}

export default function useCustomerModalEffects(isOpen, onClose) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    return createCustomerModalLifecycle(document, () => onCloseRef.current?.());
  }, [isOpen]);
}