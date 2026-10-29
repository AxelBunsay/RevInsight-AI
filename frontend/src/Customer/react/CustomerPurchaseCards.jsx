import { Link } from 'react-router-dom';
import { formatServiceName, serviceUnitSummary } from '../../utils/servicePricing';
import ServicePriceBreakdown from '../../components/ServicePriceBreakdown';
import ServicePaymentBreakdown from '../../components/ServicePaymentBreakdown';
import { getServiceBookingStatus } from '../../utils/servicePayment';
import ProductImage from './ProductImage';
import '../styles/customer-flow.css';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const statusClass = (status) => `status-${String(status || '').toLowerCase().replaceAll(' ', '-')}`;
const formatDate = (value) => value
  ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(value))
  : 'Date to be confirmed';

function itemName(item) {
  const name = item.name || item.productName || 'Product';
  return item.variantLabel && !String(name).includes(item.variantLabel)
    ? `${name} - ${item.variantLabel}`
    : name;
}

function serviceName(booking, prototype) {
  return prototype
    ? booking.name
    : formatServiceName(booking.serviceType || 'Service booking', booking.units, booking.unitLabel);
}

function serviceReference(booking, prototype) {
  return prototype ? booking.id : booking.code || booking._id;
}

function serviceStatus(booking, prototype) {
  return prototype ? booking.status : getServiceBookingStatus(booking);
}

function serviceDate(booking, prototype) {
  return prototype ? booking.bookingDate : booking.scheduledDate;
}

function serviceTotal(booking, prototype) {
  return prototype ? booking.price : booking.estimatedPrice;
}

export function ItemReservationCard({ reservation, showType = false }) {
  const keyDate = reservation.status === 'Pending Down Payment'
    ? `Pay by ${formatDate(reservation.paymentDueAt)}`
    : reservation.status === 'Payment Submitted'
      ? `Payment submitted ${formatDate(reservation.submittedAt)}`
      : reservation.status === 'Reserved'
        ? `Reserved until ${formatDate(reservation.reservedUntil)}`
        : reservation.status === 'Completed'
          ? `Picked up ${formatDate(reservation.completedAt)}`
          : reservation.status === 'Expired'
            ? `Expired ${formatDate(reservation.expiredAt)}`
            : `Cancelled ${formatDate(reservation.cancelledAt)}`;

  return <article className="customer-reservation-card">
    <div className="customer-reservation-card-top">
      <div>
        <span className="customer-cart-item-kind">
          {showType && <span className="customer-purchase-type">Item</span>}
          RESERVATION · {reservation.code}
        </span>
        <div className="customer-reservation-item-list">
          {(reservation.items || []).map((item) => <span className="customer-reservation-item-row" key={item.variantId || item.productId}>
            <ProductImage src={item.imageUrl} alt="" className="customer-inline-product-image" fallback={<span className="customer-inline-product-placeholder" aria-hidden="true">▣</span>} />
            <strong>{itemName(item)} × {item.qty}</strong>
          </span>)}
        </div>
        <p>{keyDate}</p>
        {showType && <small className="customer-purchase-date">Created {formatDate(reservation.createdAt)}</small>}
      </div>
      <span className={`customer-status-pill ${statusClass(reservation.status)}`}>{reservation.status}</span>
    </div>
    <div className="customer-reservation-card-finances">
      <span>Total <strong>{money(reservation.total)}</strong></span>
      <span>Paid <strong>{money(reservation.amountPaid)}</strong></span>
      <span>Balance <strong>{money(reservation.balanceDue)}</strong></span>
    </div>
    <div className="customer-reservation-card-bottom">
      <Link to={`/customer/reservations/${reservation._id}`}>View reservation <span aria-hidden="true">→</span></Link>
    </div>
  </article>;
}

export function ServiceBookingCard({ booking, prototype = false, showType = false }) {
  const reference = serviceReference(booking, prototype);
  const status = serviceStatus(booking, prototype);
  const date = serviceDate(booking, prototype);
  const bookingTime = prototype
    ? booking.timeSlot
    : [booking.startTime, booking.endTime].filter(Boolean).join(' - ');
  const pathId = prototype ? booking.id : booking._id;

  return <article className="customer-reservation-card">
    <div className="customer-reservation-card-top">
      <div>
        <span className="customer-cart-item-kind">
          {showType && <span className="customer-purchase-type">Service</span>}
          SERVICE BOOKING · {reference}
        </span>
        <h2>{serviceName(booking, prototype)}</h2>
        <p>{!prototype && booking.pricePerUnit ? `${serviceUnitSummary(booking.units || 1, booking.unitLabel)} · ` : ''}{formatDate(date)}{bookingTime ? ` · ${bookingTime}` : ''}{booking.vehicle ? ` · ${booking.vehicle}` : ''}</p>
        {showType && !prototype && <small className="customer-purchase-date">Created {formatDate(booking.createdAt)}</small>}
      </div>
      <span className={`customer-status-pill ${statusClass(status)}`}>{status}</span>
    </div>
    <div className="customer-reservation-card-bottom">
      {prototype
        ? <strong>{money(serviceTotal(booking, true))}</strong>
        : <>
          <ServicePriceBreakdown
            servicePriceTotal={booking.servicePriceTotal}
            mechanicFeeTotal={booking.mechanicFeeTotal}
            estimatedPrice={booking.estimatedPrice}
          />
          <ServicePaymentBreakdown booking={booking} />
        </>}
      {!prototype && booking.description && <span>{booking.description}</span>}
      <Link to={`/customer/reservations/${pathId}`}>View booking <span aria-hidden="true">→</span></Link>
    </div>
  </article>;
}
