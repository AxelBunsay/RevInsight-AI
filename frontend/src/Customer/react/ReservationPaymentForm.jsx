import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import PaymentSettingsDisplay from './PaymentSettingsDisplay';
import { getPaymentDisplaySettings } from './paymentDisplaySettings';
import ServicePaymentBreakdown from '../../components/ServicePaymentBreakdown';
import CustomerModalPortal from './CustomerModalPortal';
import useCustomerModalEffects from './useCustomerModalEffects';
import '../styles/customer-flow.css';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MAX_RECEIPT_SIZE = 2 * 1024 * 1024;

export default function ReservationPaymentForm({ reservation, amount, settings, onSubmit, isSaving, onClose, showServiceBreakdown = false }) {
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState(null);
  const [fileError, setFileError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [fetchedPaymentSettings, setFetchedPaymentSettings] = useState(null);
  const [isLoadingPaymentSettings, setIsLoadingPaymentSettings] = useState(true);
  const [paymentSettingsError, setPaymentSettingsError] = useState('');
  const bodyRef = useRef(null);
  const instructions = getPaymentDisplaySettings(settings, fetchedPaymentSettings);
  const paymentAmount = amount ?? reservation?.downPaymentAmount;
  const canSubmit = Boolean(
    instructions.methodName
    && instructions.accountName
    && instructions.accountNumber
    && /^\d{10,20}$/.test(reference)
    && proof
  );

  useCustomerModalEffects(true, onClose);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return undefined;
    const keepFocusedFieldVisible = () => {
      const focused = document.activeElement;
      if (!bodyRef.current?.contains(focused)) return;
      window.requestAnimationFrame(() => focused.scrollIntoView?.({ block: 'nearest' }));
    };
    visualViewport.addEventListener('resize', keepFocusedFieldVisible);
    return () => visualViewport.removeEventListener('resize', keepFocusedFieldVisible);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    let isMounted = true;
    api.getPaymentSettings().then((response) => {
      if (!response?.settings) throw new Error('Payment settings response was incomplete.');
      if (isMounted) setFetchedPaymentSettings(response.settings);
    }).catch(() => {
      if (isMounted) setPaymentSettingsError('Could not load the latest payment details. Showing the saved reservation payment details instead.');
    }).finally(() => {
      if (isMounted) setIsLoadingPaymentSettings(false);
    });
    return () => { isMounted = false; };
  }, []);

  const copy = async (label, value) => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopyMessage(`${label} copied.`);
    } catch {
      setCopyMessage(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  const selectReceipt = (event) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    setFileError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setFileError('Choose a PNG or JPG receipt image.');
      return;
    }
    if (file.size > MAX_RECEIPT_SIZE) {
      setFileError('Receipt image must be 2 MB or smaller.');
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setProof(file);
  };

  const submit = async (event) => {
    event.preventDefault();
    setFileError('');
    if (!/^\d{10,20}$/.test(reference)) {
      setFileError('Enter a GCash reference number with 10 to 20 digits.');
      return;
    }
    if (!proof) {
      setFileError('Attach a PNG or JPG receipt image.');
      return;
    }
    await onSubmit({ reference, proof });
  };

  return <CustomerModalPortal>
    <div className="customer-confirmation-backdrop gcash-payment-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="customer-confirmation-dialog gcash-payment-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="gcash-payment-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="gcash-payment-header">
          <h2 id="gcash-payment-title">Pay with GCash</h2>
          <button type="button" className="gcash-payment-close" aria-label="Close" onClick={onClose} disabled={isSaving}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div ref={bodyRef} className="gcash-payment-body" onFocusCapture={(event) => {
          const target = event.target;
          if (!target.matches?.('input, textarea, select')) return;
          window.requestAnimationFrame(() => target.scrollIntoView?.({ block: 'nearest' }));
        }}>
          {showServiceBreakdown && <ServicePaymentBreakdown booking={reservation} className="gcash-service-payment-breakdown" />}
          <PaymentSettingsDisplay
            settings={instructions}
            amount={money(paymentAmount)}
            isLoading={isLoadingPaymentSettings}
            loadError={paymentSettingsError}
            onCopy={copy}
          />
          {copyMessage && <small className="gcash-payment-copy-message" role="status">{copyMessage}</small>}
          <label className="gcash-payment-reference">GCash reference number
            <input
              required
              type="text"
              inputMode="numeric"
              pattern="[0-9]{10,20}"
              minLength={10}
              maxLength={20}
              value={reference}
              onChange={(event) => setReference(event.target.value.replace(/\D/g, '').slice(0, 20))}
              autoComplete="off"
            />
          </label>
          <input className="gcash-payment-file-input" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={selectReceipt} aria-label="Attach receipt file" />
          <button className="customer-secondary-button gcash-payment-attach" type="button" onClick={(event) => event.currentTarget.previousElementSibling.click()}>Attach receipt</button>
          {proof && <div className="gcash-payment-preview"><img src={previewUrl} alt="Receipt preview" /><span>{proof.name}</span><button type="button" onClick={() => { setProof(null); setPreviewUrl(''); }}>Remove</button></div>}
          {fileError && <p className="customer-error" role="alert">{fileError}</p>}
        </div>
        <footer className="gcash-payment-submit-row gcash-payment-footer">
          <button className="customer-primary-button gcash-payment-submit" type="submit" disabled={!canSubmit || isSaving}>{isSaving ? 'Submitting...' : 'Submit payment'}</button>
        </footer>
      </form>
    </div>
  </CustomerModalPortal>;
}
