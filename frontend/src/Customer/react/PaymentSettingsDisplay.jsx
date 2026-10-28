import { useEffect, useState } from 'react';
import { downloadQrImage, qrPreviewReducer } from './paymentQr';

export default function PaymentSettingsDisplay({ settings, amount, isLoading, loadError, onCopy }) {
  const [loadedQrUrl, setLoadedQrUrl] = useState('');
  const [failedQrUrl, setFailedQrUrl] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');
  const qrUrl = settings.qrImageUrl;
  const isQrLoaded = loadedQrUrl === qrUrl;
  const qrFailed = failedQrUrl === qrUrl;

  useEffect(() => {
    if (!isPreviewOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setIsPreviewOpen((open) => qrPreviewReducer(open, { type: 'escape' }));
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isPreviewOpen]);

  const saveQr = async (event) => {
    event.preventDefault();
    setDownloadMessage('');
    try {
      await downloadQrImage(qrUrl);
    } catch {
      setDownloadMessage('Long-press the QR to save it');
    }
  };

  if (isLoading) {
    return <>
      <div className="gcash-payment-info-block gcash-payment-settings-skeleton" aria-label="Loading GCash payment settings">
        <div className="gcash-payment-detail gcash-payment-amount">
          <span>Amount to pay</span>
          <div className="gcash-payment-detail-value"><strong>{amount}</strong><button type="button" onClick={() => onCopy('Amount', amount)}>Copy</button></div>
        </div>
        <span className="gcash-payment-skeleton-detail" />
        <span className="gcash-payment-skeleton-detail" />
      </div>
      <div className="gcash-payment-qr-section">
        <span className="gcash-payment-skeleton-qr" />
      </div>
      {settings.paymentInstructions && <p className="gcash-payment-instructions">{settings.paymentInstructions}</p>}
      {loadError && <small className="gcash-payment-fallback-note" role="status">{loadError}</small>}
    </>;
  }

  return <>
    <div className="gcash-payment-info-block">
      <div className="gcash-payment-detail gcash-payment-amount">
        <span>Amount to pay</span>
        <div className="gcash-payment-detail-value"><strong>{amount}</strong><button type="button" onClick={() => onCopy('Amount', amount)}>Copy</button></div>
      </div>
      <div className="gcash-payment-detail">
        <span>Account name</span>
        <div className="gcash-payment-detail-value"><strong className="gcash-payment-account-name">{settings.accountName || 'Not configured'}</strong><button type="button" onClick={() => onCopy('Account name', settings.accountName)}>Copy</button></div>
      </div>
      <div className="gcash-payment-detail">
        <span>Account number</span>
        <div className="gcash-payment-detail-value"><strong className="gcash-payment-account-number">{settings.accountNumber || 'Not configured'}</strong><button type="button" onClick={() => onCopy('Account number', settings.accountNumber)}>Copy</button></div>
      </div>
    </div>
    {qrUrl && !qrFailed
      ? <div className="gcash-payment-qr-section">
        {!isQrLoaded && <span className="gcash-payment-qr-loading" aria-label="Loading GCash QR image" />}
        <div className="gcash-payment-qr-image-frame">
          <button
            type="button"
            className={`gcash-payment-qr-trigger${isQrLoaded ? ' is-loaded' : ''}`}
            onClick={() => setIsPreviewOpen((open) => qrPreviewReducer(open, { type: 'open' }))}
            aria-label="Open GCash QR full-screen preview"
            disabled={!isQrLoaded}
          >
            <img
              className="gcash-payment-qr"
              src={qrUrl}
              alt="Shop GCash QR code"
              onLoad={() => setLoadedQrUrl(qrUrl)}
              onError={() => setFailedQrUrl(qrUrl)}
            />
          </button>
        </div>
        <a className="customer-secondary-button gcash-payment-save-qr" href={qrUrl} download="gcash-qr.png" onClick={saveQr}>
          Save QR image
        </a>
        <small className="gcash-payment-qr-hint">On a phone? Save the QR and upload it in GCash &gt; Pay QR.</small>
        {downloadMessage && <small className="gcash-payment-fallback-note" role="status">{downloadMessage}</small>}
        {isPreviewOpen && <div
          className="gcash-qr-lightbox"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsPreviewOpen((open) => qrPreviewReducer(open, { type: 'outside-click' }));
            }
          }}
        >
          <button type="button" className="gcash-qr-lightbox-close" aria-label="Close QR preview" onClick={() => setIsPreviewOpen((open) => qrPreviewReducer(open, { type: 'close' }))}>×</button>
          <img src={qrUrl} alt="Shop GCash QR code enlarged" onClick={(event) => event.stopPropagation()} />
        </div>}
      </div>
      : <p className="customer-reservation-note">The shop has not added a GCash QR code yet. You can use the account details below.</p>}
    {settings.paymentInstructions && <p className="gcash-payment-instructions">{settings.paymentInstructions}</p>}
    {loadError && <small className="gcash-payment-fallback-note" role="status">{loadError}</small>}
  </>;
}
