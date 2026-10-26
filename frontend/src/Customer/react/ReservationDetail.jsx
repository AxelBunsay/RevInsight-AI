import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import ReservationPaymentForm from './ReservationPaymentForm';
import ProductImage from './ProductImage';
import '../styles/customer-flow.css';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusClass = (status) => `status-${String(status || '').toLowerCase().replaceAll(' ', '-')}`;
const formatDate = (value) => value ? new Date(value).toLocaleString('en-PH') : 'Not yet';

function countdownUntil(value) {
  const remaining = Math.max(0, new Date(value).getTime() - Date.now());
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export default function ReservationDetail() {
  const { reservationId } = useParams();
  const location = useLocation();
  const { reservations } = useCustomerPrototype();
  const serviceReservation = reservations.find((item) => item.id === reservationId);
  const [reservation, setReservation] = useState(null);
  const [serviceBooking, setServiceBooking] = useState(null);
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(!serviceReservation);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(location.state?.message || '');
  const [countdown, setCountdown] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(Boolean(location.state?.showPayment));
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const expiryChecked = useRef(false);

  useEffect(() => {
    if (serviceReservation) return undefined;
    let isMounted = true;
    Promise.allSettled([
      api.getCustomerReservation(reservationId),
      api.getReservationSettings(),
      api.getCustomerServiceRequests()
    ]).then(([reservationResult, settingsResult, bookingResult]) => {
      if (!isMounted) return;
      if (settingsResult.status === 'fulfilled') setSettings(settingsResult.value.settings);
      if (reservationResult.status === 'fulfilled') {
        setReservation(reservationResult.value.reservation);
        return;
      }
      const serviceRequest = bookingResult.status === 'fulfilled'
        ? (bookingResult.value.requests || []).find((booking) => booking._id === reservationId)
        : null;
      if (serviceRequest) setServiceBooking(serviceRequest);
      else setError(reservationResult.reason?.message || 'Reservation could not be loaded.');
    }).finally(() => {
      if (isMounted) setIsLoading(false);
    });
    return () => { isMounted = false; };
  }, [reservationId, serviceReservation]);

  useEffect(() => {
    if (!reservation?.paymentDueAt || reservation.status !== 'Pending Down Payment') return undefined;
    expiryChecked.current = false;
    const updateCountdown = () => {
      const remaining = new Date(reservation.paymentDueAt).getTime() - Date.now();
      setCountdown(countdownUntil(reservation.paymentDueAt));
      if (remaining <= 0 && !expiryChecked.current) {
        expiryChecked.current = true;
        api.getCustomerReservation(reservation._id).then((response) => setReservation(response.reservation)).catch((requestError) => {
          setError(requestError.message || 'Reservation status could not be refreshed.');
        });
      }
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [reservation?._id, reservation?.paymentDueAt, reservation?.status]);

  const submitPayment = async ({ reference, proof }) => {
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      if (serviceBooking) {
        const response = await api.submitServiceRequestPayment(serviceBooking._id, { reference, proof });
        setServiceBooking(response.serviceRequest);
        setShowPaymentForm(false);
        setMessage('Payment sent. The shop will check it shortly.');
        return;
      }
      const response = await api.submitReservationPayment(reservation._id, { reference, proof });
      setReservation(response.reservation);
      setShowPaymentForm(false);
      setMessage('Payment sent. The shop will check it shortly.');
    } catch (requestError) {
      setError(requestError.message || 'Payment could not be submitted.');
    } finally {
      setIsSaving(false);
    }
  };

  const cancelReservation = async () => {
    setError('');
    setMessage('');
    setIsSaving(true);
    try {
      const response = await api.cancelCustomerReservation(reservation._id, 'Cancelled by customer');
      setReservation(response.reservation);
      setShowCancelDialog(false);
      setMessage('Reservation cancelled.');
    } catch (requestError) {
      setError(requestError.message || 'Reservation could not be cancelled.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <CustomerPage title="Reservation" description="Loading reservation details."><p>Loading...</p></CustomerPage>;

  if (serviceReservation) return <CustomerPage title="Booking details" description="Follow your service booking from confirmation to pickup.">
    <div className="customer-flow-page"><nav className="customer-breadcrumbs" aria-label="Breadcrumb"><Link to="/customer/purchases">My bookings</Link><span>/</span><span>{serviceReservation.id}</span></nav>
      <section className="customer-reservation-detail-card"><div className="customer-reservation-card-top"><div><p className="customer-eyebrow">SERVICE BOOKING · {serviceReservation.id}</p><h1>{serviceReservation.name}</h1><p>{serviceReservation.bookingDate} at {serviceReservation.timeSlot} · {serviceReservation.vehicle}</p></div><span className="customer-status-pill">{serviceReservation.status}</span></div><div className="customer-reservation-detail-meta"><div><span>Estimated total</span><strong>{money(serviceReservation.price)}</strong></div><div><span>Duration</span><strong>{serviceReservation.duration}</strong></div><div><span>Booking reference</span><strong>{serviceReservation.orderId}</strong></div></div><h2>Booking progress</h2><ol className="customer-reservation-timeline">{serviceReservation.timeline.map((event) => <li className={event.complete ? 'is-complete' : ''} key={event.label}><span className="customer-timeline-marker">{event.complete ? '✓' : ''}</span><div><strong>{event.label}</strong><small>{event.complete ? new Date(event.date).toLocaleString('en-PH') : 'Pending update'}</small></div></li>)}</ol><Link className="customer-secondary-button" to="/customer/services">Book another service</Link></section>
    </div>
  </CustomerPage>;

  if (serviceBooking) {
    const paymentPending = (serviceBooking.paymentStatus || 'Payment Pending') === 'Payment Pending';
    const serviceStatus = serviceBooking.paymentStatus === 'Payment Submitted'
      ? 'Payment Submitted'
      : serviceBooking.paymentStatus === 'Payment Pending' && serviceBooking.paymentRejectionReason
        ? 'Payment Pending'
      : serviceBooking.paymentStatus === 'Confirmed' && serviceBooking.status === 'pending'
        ? 'Confirmed'
        : serviceBooking.status;
    return <CustomerPage title="Booking details" description="Review your service booking and payment status.">
      <div className="customer-flow-page">
        <nav className="customer-breadcrumbs" aria-label="Breadcrumb"><Link to="/customer/profile">Account</Link><span>/</span><span>{serviceBooking.code || serviceBooking._id}</span></nav>
        {error && <p className="customer-error" role="alert">{error}</p>}
        {message && <p className="customer-success" role="status">{message}</p>}
        <section className="customer-reservation-detail-card">
          <div className="customer-reservation-card-top"><div><p className="customer-eyebrow">SERVICE BOOKING · {serviceBooking.code || serviceBooking._id}</p><h1>{serviceBooking.serviceType}</h1><p>{serviceBooking.scheduledDate ? formatDate(serviceBooking.scheduledDate) : 'Date to be confirmed'}{serviceBooking.startTime ? ` · ${serviceBooking.startTime} - ${serviceBooking.endTime}` : ''}{serviceBooking.vehicle ? ` · ${serviceBooking.vehicle}` : ''}</p></div><span className={`customer-status-pill ${statusClass(serviceStatus)}`}>{serviceStatus}</span></div>
          <div className="customer-reservation-detail-meta"><div><span>Amount due</span><strong>{money(serviceBooking.estimatedPrice)}</strong></div><div><span>Payment</span><strong>{serviceBooking.paymentStatus || 'Payment Pending'}</strong></div><div><span>Reference</span><strong>{serviceBooking.code || serviceBooking._id}</strong></div></div>
          {serviceBooking.paymentRejectionReason && <p className="customer-error" role="alert">Payment needs attention: {serviceBooking.paymentRejectionReason}</p>}
          {paymentPending && !showPaymentForm && <button className="customer-primary-button" type="button" onClick={() => setShowPaymentForm(true)}>Pay with GCash</button>}
          {showPaymentForm && paymentPending && <ReservationPaymentForm reservation={serviceBooking} amount={serviceBooking.estimatedPrice} settings={settings} onSubmit={submitPayment} onClose={() => setShowPaymentForm(false)} isSaving={isSaving} />}
          <Link className="customer-secondary-button" to="/customer/profile">Back to Account</Link>
        </section>
      </div>
    </CustomerPage>;
  }

  if (!reservation) return <CustomerPage title="Details not found" description={error || 'This record is not in your account.'}>{error && <p className="customer-error" role="alert">{error}</p>}<Link to="/customer/purchases">Back to My Purchases</Link></CustomerPage>;

  const canSubmitPayment = reservation.status === 'Pending Down Payment';
  const canCustomerCancel = ['Pending Down Payment', 'Payment Submitted'].includes(reservation.status);
  const currentStep = {
    'Pending Down Payment': 0,
    'Payment Submitted': 1,
    Reserved: 2,
    Completed: 3
  }[reservation.status];
  const timeline = [
    { label: 'Reservation placed', date: reservation.createdAt },
    { label: 'Down payment submitted', date: reservation.submittedAt },
    { label: 'Down payment confirmed (Reserved)', date: reservation.verifiedAt },
    { label: 'Picked up (Completed)', date: reservation.completedAt }
  ];
  const timelineStep = currentStep ?? (reservation.verifiedAt ? 2 : reservation.submittedAt ? 1 : 0);
  const pickupAddress = settings?.pickupAddress;
  const pickupHours = settings?.pickupHours;

  return <CustomerPage title="Reservation details" description="Submit your down payment and track your pickup reservation.">
    <div className="customer-flow-page">
      <nav className="customer-breadcrumbs" aria-label="Breadcrumb"><Link to="/customer/purchases">My Purchases</Link><span>/</span><span>{reservation.code}</span></nav>
      {error && <p className="customer-error" role="alert">{error}</p>}
      {message && <p className="customer-success" role="status">{message}</p>}
      <section className="customer-reservation-detail-card">
        <div className="customer-reservation-card-top"><div><p className="customer-eyebrow">ITEM RESERVATION · {reservation.code}</p><h1>{reservation.items.map((item) => item.name).join(', ')}</h1><p>Created {formatDate(reservation.createdAt)}</p></div><span className={`customer-status-pill ${statusClass(reservation.status)}`}>{reservation.status}</span></div>
        <div className="customer-review-lines">{reservation.items.map((item) => <div key={item.productId}><span className="customer-reservation-item-row"><ProductImage src={item.imageUrl} alt="" className="customer-inline-product-image" fallback={<span className="customer-inline-product-placeholder" aria-hidden="true">▣</span>} /><span><strong>{item.name}</strong><small>{money(item.unitPrice)} each × {item.qty}</small></span></span><strong>{money(item.lineTotal)}</strong></div>)}</div>
        <div className="customer-reservation-detail-meta customer-reservation-money">
          <div><span>Total</span><strong>{money(reservation.total)}</strong></div>
          <div><span>Down payment</span><strong>{money(reservation.downPaymentAmount)}</strong></div>
          <div><span>Paid</span><strong>{money(reservation.amountPaid)}</strong></div>
          <div><span>Balance due at pickup</span><strong>{money(reservation.balanceDue)}</strong></div>
        </div>
        {pickupAddress && <p className="customer-pickup-location">Pickup at {pickupAddress}{pickupHours ? ` · ${pickupHours}` : ''}</p>}
        {canSubmitPayment && !showPaymentForm && <p className="customer-payment-countdown">Pay within {countdown}</p>}
        {reservation.status === 'Reserved' && <p className="customer-reservation-note">Bring your reservation code <strong>{reservation.code}</strong> at pickup and pay the balance of {money(reservation.balanceDue)}.</p>}
        {['Cancelled', 'Expired'].includes(reservation.status) && <p className="customer-reservation-terminal-reason"><strong>{reservation.status} reason:</strong> {reservation.cancelReason || 'No reason was provided.'}</p>}
        {reservation.rejectionReason && <p className="customer-error">Payment needs attention: {reservation.rejectionReason}</p>}
        {reservation.refundDecision && <p className="customer-reservation-note">Refund decision: {reservation.refundDecision}.</p>}
        <h2>Reservation timeline</h2><ol className="customer-reservation-timeline">{timeline.map((event, index) => <li className={index < timelineStep ? 'is-complete' : index === timelineStep ? 'is-current' : ''} key={event.label}><span className="customer-timeline-marker">{index < timelineStep ? '✓' : index + 1}</span><div><strong>{event.label}</strong><small>{event.date ? formatDate(event.date) : currentStep !== undefined && index === currentStep ? 'In progress' : index > timelineStep || currentStep === undefined ? 'Not reached' : 'Pending'}</small></div></li>)}</ol>
        {canSubmitPayment && !showPaymentForm && <button className="customer-primary-button" type="button" onClick={() => setShowPaymentForm(true)}>Pay with GCash</button>}
        {canSubmitPayment && showPaymentForm && <ReservationPaymentForm reservation={reservation} settings={settings} onSubmit={submitPayment} onClose={() => setShowPaymentForm(false)} isSaving={isSaving} />}
        {canCustomerCancel && <button className="customer-secondary-button" type="button" onClick={() => setShowCancelDialog(true)} disabled={isSaving}>Cancel reservation</button>}
        <Link className="customer-secondary-button" to="/customer/purchases">Back to My Purchases</Link>
      </section>
      {showCancelDialog && <div className="customer-confirmation-backdrop" role="presentation"><section className="customer-confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-reservation-title"><h2 id="cancel-reservation-title">Cancel reservation?</h2><p>Cancel reservation {reservation.code}? This cannot be undone.</p><div><button type="button" className="customer-secondary-button" onClick={() => setShowCancelDialog(false)} disabled={isSaving}>Keep reservation</button><button type="button" className="customer-danger-button" onClick={cancelReservation} disabled={isSaving}>{isSaving ? 'Cancelling...' : 'Cancel reservation'}</button></div></section></div>}
    </div>
  </CustomerPage>;
}
