import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import ReservationPaymentForm from './ReservationPaymentForm';
import '../styles/customer-flow.css';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Checkout() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const reservationId = searchParams.get('reservation');
  const { cart, removeCartItem } = useCustomerPrototype();
  const productItems = cart.filter((item) => item.kind === 'product');
  const serviceItems = cart.filter((item) => item.kind === 'service');
  const [checkoutReservation, setCheckoutReservation] = useState(null);
  const isReservationFlow = Boolean(reservationId || productItems.length || checkoutReservation);
  const [step, setStep] = useState(reservationId ? 'payment' : isReservationFlow ? 'reservation' : 'payment');
  const [payment, setPayment] = useState('Cash at pickup');
  const [settings, setSettings] = useState(null);
  const [loadedReservationId, setLoadedReservationId] = useState('');
  const isLoadingReservation = Boolean(reservationId && loadedReservationId !== reservationId);
  const [error, setError] = useState('');
  const [bookingResults, setBookingResults] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(Boolean(reservationId));
  const [servicePayment, setServicePayment] = useState(null);
  const [paymentMessage, setPaymentMessage] = useState('');
  const productSubtotal = productItems.reduce((total, item) => total + item.price * item.quantity, 0);
  const serviceTotal = serviceItems.reduce((total, item) => total + item.price, 0);
  const downPaymentAmount = Math.round((productSubtotal * (settings?.downPaymentPercent ?? 30) / 100 + Number.EPSILON) * 100) / 100;

  useEffect(() => {
    let isMounted = true;
    api.getReservationSettings().then((response) => {
      if (isMounted) setSettings(response.settings);
    }).catch((requestError) => {
      if (isMounted) setError(requestError.message || 'Pickup details could not be loaded.');
    });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!reservationId) return undefined;
    let isMounted = true;
    api.getCustomerReservation(reservationId).then((response) => {
      if (!isMounted) return;
      setCheckoutReservation(response.reservation);
      if (response.reservation.status !== 'Pending Down Payment') {
        navigate(`/customer/reservations/${response.reservation._id}`, { replace: true });
      }
    }).catch((requestError) => {
      if (isMounted) setError(requestError.message || 'Reservation could not be loaded.');
    }).finally(() => {
      if (isMounted) setLoadedReservationId(reservationId);
    });
    return () => { isMounted = false; };
  }, [reservationId, navigate]);

  if (!cart.length && !reservationId && !checkoutReservation && !bookingResults) {
    return <CustomerPage title="Checkout" description="Review your cart before continuing.">
      <p className="customer-empty">Your cart is empty. <Link to="/customer/shop">Continue shopping</Link></p>
    </CustomerPage>;
  }

  const createPendingReservation = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const response = await api.createReservation(productItems.map((item) => ({ productId: item.id, qty: item.quantity })));
      const reservation = response.reservation;
      setCheckoutReservation(reservation);
      productItems.forEach((item) => removeCartItem(item.key));
      setSearchParams({ reservation: reservation._id }, { replace: true });
      setStep('payment');
      setShowPaymentModal(true);
    } catch (requestError) {
      setError(requestError.message || 'Reservation could not be created.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitPayment = async ({ reference, proof }) => {
    if (!checkoutReservation) return;
    setError('');
    setIsSubmitting(true);
    try {
      await api.submitReservationPayment(checkoutReservation._id, { reference, proof });
      navigate(`/customer/reservations/${checkoutReservation._id}`, {
        state: { message: 'Payment sent. The shop will check it shortly.' }
      });
    } catch (requestError) {
      setError(requestError.message || 'Payment could not be submitted.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitServicePayment = async ({ reference, proof }) => {
    if (!servicePayment?.serviceRequest?._id) return;
    setError('');
    setIsSubmitting(true);
    try {
      const response = await api.submitServiceRequestPayment(servicePayment.serviceRequest._id, { reference, proof });
      setBookingResults((current) => current?.map((result) => result.cartKey === servicePayment.cartKey
        ? { ...result, serviceRequest: response.serviceRequest }
        : result));
      setServicePayment(null);
      setPaymentMessage('Payment sent. The shop will check it shortly.');
    } catch (requestError) {
      setError(requestError.message || 'Payment could not be submitted.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const completeServiceBooking = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      const response = await api.createServiceBookings(serviceItems.map((item) => ({
        cartKey: item.key,
        serviceId: item.serviceId || item.id,
        date: item.bookingDate,
        startTime: item.startTime,
        vehicle: item.vehicle,
        notes: item.notes
      })));
      const itemsByKey = new Map(serviceItems.map((item) => [item.key, item]));
      const results = (response.results || []).map((result) => ({
        ...result,
        cartItem: itemsByKey.get(result.cartKey)
      }));
      if (results.length !== serviceItems.length) {
        throw new Error('The booking results were incomplete. Your cart was not changed.');
      }
      setBookingResults(results);
      results.filter((result) => result.ok).forEach((result) => removeCartItem(result.cartKey));
    } catch (requestError) {
      setError(requestError.message || 'Service booking could not be submitted.');
      return;
    } finally {
      setIsSubmitting(false);
    }
  };

  return <CustomerPage title={isReservationFlow ? 'Reserve items' : 'Service checkout'} description={isReservationFlow ? 'Submit a down payment to reserve items for pickup.' : 'Review the payment method for your service booking.'}>
    <div className="customer-flow-page customer-checkout-page">
      {error && <p className="customer-error" role="alert">{error}</p>}
      {paymentMessage && <p className="customer-success" role="status">{paymentMessage}</p>}
      {isReservationFlow ? <div className="customer-checkout-layout">
        <section className="customer-checkout-panel">
          <div className="customer-checkout-progress" aria-label="Reservation checkout progress">
            {['Reservation', 'Down payment'].map((label, index) => <div className={step === 'payment' ? index === 0 ? 'is-complete' : 'is-current' : index === 0 ? 'is-current' : ''} key={label}><span>{step === 'payment' && index === 0 ? '✓' : index + 1}</span><strong>{label}</strong></div>)}
          </div>
          {step === 'reservation' && <>
            <p className="customer-eyebrow">STEP 1 OF 2</p>
            <h2>Review your items</h2>
            <div className="customer-review-lines">{productItems.map((item) => <div key={item.key}><span><strong>{item.name}</strong><small>Qty {item.quantity} · Only {item.stock} left</small></span><strong>{money(item.price * item.quantity)}</strong></div>)}</div>
            <div className="customer-reservation-payment-instructions">
              <p><strong>Items total</strong><strong>{money(productSubtotal)}</strong></p>
              <p><strong>Down payment ({settings?.downPaymentPercent ?? 30}%): due now</strong><strong>{money(downPaymentAmount)}</strong></p>
              <p><strong>Balance due at pickup</strong><strong>{money(productSubtotal - downPaymentAmount)}</strong></p>
              <p className="customer-reservation-note">Your item is reserved only after the shop confirms your down payment.</p>
              {settings?.pickupAddress && <p className="customer-pickup-location">Pickup at {settings.pickupAddress}{settings.pickupHours ? ` · ${settings.pickupHours}` : ''}</p>}
            </div>
            {serviceItems.length > 0 && <p className="customer-reservation-note">Service bookings remain in your cart and are not changed by this item reservation.</p>}
            <button type="button" className="customer-primary-button" onClick={createPendingReservation} disabled={isSubmitting || !settings || productItems.some((item) => item.quantity < 1 || item.quantity > item.stock)}>
              {isSubmitting ? 'Creating reservation...' : 'Continue to payment'}
            </button>
          </>}
          {step === 'payment' && isLoadingReservation && <p>Loading reservation details...</p>}
          {step === 'payment' && checkoutReservation && <>
            <p className="customer-eyebrow">STEP 2 OF 2 · {checkoutReservation.code}</p>
            <h2>Pay your down payment</h2>
            <p>Submit your down payment of {money(checkoutReservation.downPaymentAmount)} using GCash.</p>
            <button type="button" className="customer-primary-button" onClick={() => setShowPaymentModal(true)}>Pay with GCash</button>
            <button type="button" className="customer-secondary-button" onClick={() => navigate(`/customer/reservations/${checkoutReservation._id}`, { state: { showPayment: true } })}>Pay later</button>
          </>}
        </section>
      </div> : <div className="customer-checkout-layout">
        <section className="customer-checkout-panel">
          <div className="customer-checkout-progress" aria-label="Service checkout progress">{['Payment', 'Review'].map((label, index) => <div className={step === (index === 0 ? 'payment' : 'review') ? 'is-current' : step === 'review' && index === 0 ? 'is-complete' : ''} key={label}><span>{step === 'review' && index === 0 ? '✓' : index + 1}</span><strong>{label}</strong></div>)}</div>
          {step === 'payment' ? <>
            <p className="customer-eyebrow">STEP 1 OF 2</p><h2>Payment method</h2>
            <div className="customer-payment-options">{['Cash at pickup', 'GCash', 'Card on pickup'].map((method) => <label className={payment === method ? 'is-selected' : ''} key={method}><input type="radio" name="payment" value={method} checked={payment === method} onChange={() => setPayment(method)} /><span><strong>{method}</strong><small>{method === 'Cash at pickup' ? 'Pay at the shop' : method === 'GCash' ? 'Submit payment after booking' : 'Pay at the shop'}</small></span></label>)}</div>
            <button type="button" className="customer-primary-button" onClick={() => setStep('review')}>Review service booking</button>
          </> : <>
            <p className="customer-eyebrow">STEP 2 OF 2</p><h2>Review your service booking</h2>
            {bookingResults && <section className="customer-booking-results" aria-live="polite">
              <h3>Booking results</h3>
              {bookingResults.map((result, index) => <article className={result.ok ? 'is-success' : 'has-error'} key={`${result.cartKey}-${index}`}>
                <div>
                  <strong>{result.cartItem?.name || result.serviceRequest?.serviceType || 'Service booking'}</strong>
                  <small>{result.cartItem?.bookingDate} · {result.cartItem?.timeSlot}</small>
                </div>
                {result.ok
                  ? <div><p>Request created · {result.serviceRequest?.code || result.serviceRequest?._id} · {result.serviceRequest?.paymentStatus || 'Payment Pending'}</p>
                    {payment === 'GCash' && !['Payment Submitted', 'Confirmed'].includes(result.serviceRequest?.paymentStatus) && <button type="button" className="customer-secondary-button" onClick={() => setServicePayment(result)}>Pay with GCash</button>}
                  </div>
                  : <div><p>{result.message}</p>{result.cartItem && <Link to={`/customer/services/${result.cartItem.id}`} state={{ bookingDate: result.cartItem.bookingDate, replaceBookingKey: result.cartKey, message: result.message === 'That time was just booked. Please choose another.' ? result.message : '' }}>Choose another time</Link>}</div>}
              </article>)}
              <Link className="customer-secondary-button" to="/customer/profile">View your bookings</Link>
            </section>}
            <div className="customer-review-lines">{serviceItems.map((item) => <div key={item.key}><span><strong>{item.name}</strong><small>{item.bookingDate} · {item.timeSlot} · {item.vehicle}</small></span><strong>{money(item.price)}</strong></div>)}</div>
            <div className="customer-review-meta"><p><span>Service total</span><strong>{money(serviceTotal)}</strong></p><p><span>Payment</span><strong>{payment}</strong></p></div>
            {serviceItems.length > 0 && <div className="customer-checkout-actions"><button type="button" className="customer-secondary-button" onClick={() => setStep('payment')}>Back</button><button type="button" className="customer-primary-button" onClick={completeServiceBooking} disabled={isSubmitting}>{isSubmitting ? 'Submitting bookings...' : `Submit ${serviceItems.length} service booking${serviceItems.length === 1 ? '' : 's'}`}</button></div>}
          </>}
        </section>
      </div>}
      {showPaymentModal && checkoutReservation && <ReservationPaymentForm
        key={checkoutReservation._id}
        reservation={checkoutReservation}
        settings={settings}
        onSubmit={submitPayment}
        onClose={() => setShowPaymentModal(false)}
        isSaving={isSubmitting}
      />}
      {servicePayment && <ReservationPaymentForm
        key={servicePayment.serviceRequest?._id}
        reservation={servicePayment.serviceRequest}
        amount={servicePayment.serviceRequest?.estimatedPrice}
        settings={settings}
        onSubmit={submitServicePayment}
        onClose={() => setServicePayment(null)}
        isSaving={isSubmitting}
      />}
    </div>
  </CustomerPage>;
}
