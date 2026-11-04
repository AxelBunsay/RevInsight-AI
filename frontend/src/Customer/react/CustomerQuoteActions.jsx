import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { request } from '../../services/api';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

export default function CustomerQuoteActions({
  booking,
  settings,
  onBookingUpdate,
  onAccepted,
  redirectAfterAccept = false
}) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const quoteStatus = booking.quoteStatus;
  if (!['quote_requested', 'quoted'].includes(quoteStatus)) return null;

  const quotedPrice = Number(booking.quotedPrice || 0);
  const downPaymentPercent = Number(
    settings?.serviceDownPaymentPercent
      ?? settings?.downPaymentPercent
      ?? booking.downPaymentPercent
      ?? 30
  );
  const total = quotedPrice;
  const downPayment = booking.downPaymentAmount != null
    ? Number(booking.downPaymentAmount)
    : Math.round((total * downPaymentPercent / 100 + Number.EPSILON) * 100) / 100;

  const respond = async (action) => {
    if (action === 'reject' && !window.confirm('Reject this quote? This cannot be undone.')) return;
    if (action === 'cancel' && !window.confirm('Cancel this quote request? This cannot be undone.')) return;
    setError('');
    setIsSubmitting(true);
    try {
      const response = await request(`/api/service-requests/${booking._id}/quote/${action}`, {
        method: 'POST',
        body: JSON.stringify({}),
        tokenKey: 'customerToken'
      });
      onBookingUpdate?.(response.serviceRequest);
      if (action === 'accept') {
        onAccepted?.(response.serviceRequest);
        if (redirectAfterAccept) {
          navigate(`/customer/reservations/${booking._id}`, { state: { showPayment: true } });
        }
      }
    } catch (requestError) {
      setError(requestError.message || 'Quote response could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (quoteStatus === 'quote_requested') {
    return <div className="customer-quote-actions">
      <p>No payment now. The mechanic will send you a price first.</p>
      {error && <small className="customer-field-error" role="alert">{error}</small>}
      <button className="customer-secondary-button" type="button" disabled={isSubmitting} onClick={() => respond('cancel')}>
        {isSubmitting ? 'Cancelling...' : 'Cancel request'}
      </button>
    </div>;
  }

  return <section className="customer-quote-actions" aria-label="Service quote">
    <div><span>Mechanic&apos;s quote</span><strong>{money(quotedPrice)}</strong></div>
    {booking.quoteNote && <p className="customer-quote-note">{booking.quoteNote}</p>}
    <div><span>Total</span><strong>{money(total)}</strong></div>
    <div><span>Down payment ({downPaymentPercent}%)</span><strong>{money(downPayment)}</strong></div>
    {error && <small className="customer-field-error" role="alert">{error}</small>}
    <div className="customer-quote-actions-buttons">
      <button className="customer-primary-button" type="button" disabled={isSubmitting} onClick={() => respond('accept')}>
        {isSubmitting ? 'Saving...' : 'Accept quote'}
      </button>
      <button className="customer-secondary-button" type="button" disabled={isSubmitting} onClick={() => respond('reject')}>
        Reject
      </button>
    </div>
  </section>;
}