import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ProductDetailContent from './ProductDetailContent';
import { closeOnProductModalBackdrop, handleProductModalKeyDown } from './productDetailModalHelpers';
import useCustomerModalEffects from './useCustomerModalEffects';
import '../styles/customer-flow.css';

const CLOSE_ANIMATION_MS = 180;

export default function ProductDetailModal({ productId, onClose, openerRef }) {
  const [visibleProductId, setVisibleProductId] = useState(productId || '');
  const [isClosing, setIsClosing] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1024px)').matches === true);
  const [modalFooter, setModalFooter] = useState(null);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useCustomerModalEffects(Boolean(visibleProductId), () => onCloseRef.current?.());

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(max-width: 1024px)');
    if (!mediaQuery) return undefined;
    const updateLayout = (event) => setIsCompactLayout(event.matches);
    mediaQuery.addEventListener?.('change', updateLayout);
    return () => mediaQuery.removeEventListener?.('change', updateLayout);
  }, []);

  useEffect(() => {
    if (productId) {
      const frame = window.requestAnimationFrame(() => {
        setVisibleProductId(productId);
        setIsClosing(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    if (!visibleProductId) return undefined;
    let timeout;
    const frame = window.requestAnimationFrame(() => {
      setIsClosing(true);
      timeout = window.setTimeout(() => setVisibleProductId(''), CLOSE_ANIMATION_MS);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [productId, visibleProductId]);

  useEffect(() => {
    if (!visibleProductId) return undefined;
    const scrollY = window.scrollY;
    const openerElement = openerRef?.current;
    const body = document.body;
    const backgroundElement = document.querySelector('.customer-page.shop-page');
    const previousStyles = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      backgroundInert: backgroundElement?.inert,
      backgroundAriaHidden: backgroundElement?.getAttribute('aria-hidden')
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    if (backgroundElement) {
      backgroundElement.inert = true;
      backgroundElement.setAttribute('aria-hidden', 'true');
    }
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event) => {
      handleProductModalKeyDown(event, {
        dialog: dialogRef.current,
        activeElement: document.activeElement,
        onClose: onCloseRef.current
      });
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      body.style.position = previousStyles.position;
      body.style.top = previousStyles.top;
      body.style.width = previousStyles.width;
      if (backgroundElement) {
        backgroundElement.inert = previousStyles.backgroundInert;
        if (previousStyles.backgroundAriaHidden === null) backgroundElement.removeAttribute('aria-hidden');
        else backgroundElement.setAttribute('aria-hidden', previousStyles.backgroundAriaHidden);
      }
      window.scrollTo(0, scrollY);
      window.requestAnimationFrame(() => openerElement?.focus());
    };
  }, [visibleProductId, openerRef]);

  if (!visibleProductId) return null;

  const modal = <div
    className={`customer-product-modal-overlay${isClosing ? ' is-closing' : ''}`}
    onClick={(event) => {
      closeOnProductModalBackdrop(event, onCloseRef.current);
    }}
  >
    <section
      className="customer-product-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-detail-title"
      aria-busy={isClosing}
      ref={dialogRef}
      tabIndex={-1}
    >
      <header className="customer-product-modal-header">
        <span className="customer-sr-only">Product details</span>
        <button
          ref={closeButtonRef}
          type="button"
          className="customer-product-modal-close"
          aria-label="Close product details"
          onClick={() => onCloseRef.current()}
        >×</button>
      </header>
      <div className="customer-product-modal-scroll">
        <ProductDetailContent key={visibleProductId} productId={visibleProductId} isModal modalFooter={isCompactLayout ? modalFooter : null} />
      </div>
      <footer ref={setModalFooter} className="customer-product-modal-footer" />
    </section>
  </div>;
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}
