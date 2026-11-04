import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { closeOnProductModalBackdrop, handleProductModalKeyDown } from './productDetailModalHelpers';
import ServiceBookingForm from './ServiceBookingForm';
import useCustomerModalEffects from './useCustomerModalEffects';
import '../styles/customer-flow.css';

export default function ServiceBookingModal({ service, partsSource, openerRef, onClose }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useCustomerModalEffects(Boolean(service), () => onCloseRef.current?.());

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!service) return undefined;
    const opener = openerRef.current;
    const scrollY = window.scrollY;
    const body = document.body;
    const backgroundElement = document.querySelector('.customer-page.services-page');
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
      if (event.key !== 'Tab') return;
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
      window.requestAnimationFrame(() => opener?.focus());
    };
  }, [openerRef, service]);

  if (!service) return null;

  const modal = <div
    className="customer-product-modal-overlay"
    onClick={(event) => closeOnProductModalBackdrop(event, onCloseRef.current)}
  >
    <section
      className="customer-product-modal customer-service-booking-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-booking-modal-title"
      ref={dialogRef}
      tabIndex={-1}
    >
      <header className="customer-product-modal-header">
        <h2 className="customer-sr-only" id="service-booking-modal-title">{service.name}</h2>
        <button
          ref={closeButtonRef}
          type="button"
          className="customer-product-modal-close"
          aria-label="Close service booking"
          onClick={() => onCloseRef.current?.()}
        >×</button>
      </header>
      <div className="customer-product-modal-scroll">
        <ServiceBookingForm
          key={service._id}
          service={service}
          partsSource={partsSource}
          isModal
        />
      </div>
    </section>
  </div>;

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}
