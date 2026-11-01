import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import { formatServiceName } from '../../utils/servicePricing';
import { calculateServiceAmounts } from '../../utils/servicePricing';
import ServicePriceBreakdown from '../../components/ServicePriceBreakdown';
import { clearCustomerAuthAction, readCustomerAuthAction, saveCustomerAuthAction } from './customerAuthAction';
import { getAuthToken } from '../../auth/authSession';
import {
  canSubmitServiceBooking,
  getDateChangeState
} from './serviceBookingTime';
import ServiceBookingTimeSelect from './ServiceBookingTimeSelect';
import { getServicePartsSource } from './servicePartsMode';
import '../styles/customer-flow.css';

function formatDuration(minutes) {
  const value = Number(minutes) || 60;
  if (value < 60) return `${value} min`;
  const hours = value / 60;
  return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
}

function manilaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function weekdayForDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function dateSummary(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function localTimeLabel(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function VehicleForm({ value, onChange, onSave, submitLabel = 'Save motorcycle' }) {
  return <form className="customer-vehicle-inline-form" onSubmit={onSave}>
    <label>Make<input required value={value.make} onChange={(event) => onChange({ ...value, make: event.target.value })} placeholder="Honda" /></label>
    <label>Model<input required value={value.model} onChange={(event) => onChange({ ...value, model: event.target.value })} placeholder="Click 160" /></label>
    <label>Year<input inputMode="numeric" value={value.year} onChange={(event) => onChange({ ...value, year: event.target.value })} placeholder="2024" /></label>
    <label>Plate number<input value={value.plate} onChange={(event) => onChange({ ...value, plate: event.target.value })} placeholder="ABC 1234" /></label>
    <button type="submit" className="customer-secondary-button">{submitLabel}</button>
  </form>;
}

export default function ServiceDetail() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { addCartItem, replaceCartItem, vehicles, addVehicle, cart } = useCustomerPrototype();
  const editCartKey = location.state?.editCartKey || location.state?.replaceBookingKey;
  const editingCartItem = cart.find((item) => item.key === editCartKey);
  const partsSource = editingCartItem?.partsSource || getServicePartsSource(location.search);
  const [service, setService] = useState(null);
  const [serviceError, setServiceError] = useState('');
  const [loadedServiceId, setLoadedServiceId] = useState('');
  const [serviceRetryKey, setServiceRetryKey] = useState(0);
  const isLoadingService = loadedServiceId !== serviceId;
  const [bookingDate, setBookingDate] = useState(() => {
    const action = location.state?.resumeAction ? readCustomerAuthAction() : null;
    return action?.type === 'service' && action.serviceId === serviceId
      ? action.date
      : editingCartItem?.bookingDate || location.state?.bookingDate || manilaDateKey();
  });
  const [timeSlot, setTimeSlot] = useState(editingCartItem?.startTime || '');
  const [vehicle, setVehicle] = useState(editingCartItem?.vehicle || '');
  const [notes, setNotes] = useState(editingCartItem?.notes || '');
  const [units, setUnits] = useState(editingCartItem?.units || 1);
  const [schedule, setSchedule] = useState(null);
  const [slots, setSlots] = useState([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [availabilityError, setAvailabilityError] = useState('');
  const [closedMessage, setClosedMessage] = useState('');
  const [bookingError, setBookingError] = useState(location.state?.message || '');
  const [isFindingNext, setIsFindingNext] = useState(false);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ make: '', model: '', year: '', plate: '' });
  const resumedActionRef = useRef('');
  const resumeRequestedRef = useRef(Boolean(location.state?.resumeAction));
  const slotRequestRef = useRef(0);
  const nextAvailableRequestRef = useRef(0);
  const today = manilaDateKey();

  useEffect(() => {
    let active = true;
    api.getService(serviceId).then((response) => {
      if (active) {
        setUnits(editingCartItem?.units || 1);
        setBookingDate(editingCartItem?.bookingDate || location.state?.bookingDate || manilaDateKey());
        setTimeSlot(editingCartItem?.startTime || '');
        setVehicle(editingCartItem?.vehicle || '');
        setNotes(editingCartItem?.notes || '');
        setService(response.service);
        setServiceError('');
      }
    }).catch((error) => {
      if (!active) return;
      setService(null);
      setServiceError(error.status === 404 ? 'not-found' : error.message || 'Could not load service.');
    }).finally(() => {
      if (active) setLoadedServiceId(serviceId);
    });
    return () => { active = false; };
  }, [
    editingCartItem?.bookingDate,
    editingCartItem?.notes,
    editingCartItem?.startTime,
    editingCartItem?.units,
    editingCartItem?.vehicle,
    location.state?.bookingDate,
    serviceId,
    serviceRetryKey
  ]);

  const loadSlots = useCallback(async (date, requestedUnits = units) => {
    const requestId = ++slotRequestRef.current;
    if (!date) {
      setSchedule(null);
      setSlots([]);
      setClosedMessage('');
      setAvailabilityError('');
      setTimeSlot('');
      setIsLoadingSlots(false);
      return;
    }
    setIsLoadingSlots(true);
    setAvailabilityError('');
    setTimeSlot('');
    try {
      const response = await api.getServiceSlots(serviceId, date, requestedUnits);
      if (requestId !== slotRequestRef.current) return;
      setSchedule(response);
      setSlots(response.slots || []);
      setClosedMessage(response.open ? '' : response.closedMessage || '');
      if (editingCartItem && editingCartItem.bookingDate === date) {
        const existingTime = editingCartItem.startTime || '';
        const existingSlot = response.slots?.find((slot) => slot.startTime === existingTime);
        setTimeSlot(existingTime);
        if (!existingSlot || existingSlot.status !== 'available') {
          setBookingError('That time was just booked. Please choose another.');
        }
      }
      if (resumeRequestedRef.current) {
        const action = readCustomerAuthAction();
        if (action?.type === 'service' && action.serviceId === serviceId && action.date === date && action.returnPath === `${location.pathname}${location.search}`) {
          const actionKey = `${action.createdAt}:${action.serviceId}:${action.date}:${action.time}`;
          if (resumedActionRef.current !== actionKey) {
            resumedActionRef.current = actionKey;
            const matchingSlot = response.slots?.find((slot) => slot.startTime === action.time);
            if (matchingSlot?.status === 'available') {
              setTimeSlot(action.time);
              setVehicle('');
              setBookingError('Choose a saved motorcycle to continue with this booking.');
            } else {
              setTimeSlot('');
              setBookingError('That booking time is no longer available. Please choose another time.');
            }
            clearCustomerAuthAction();
            resumeRequestedRef.current = false;
            navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
          }
        } else {
          clearCustomerAuthAction();
          resumeRequestedRef.current = false;
          navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
        }
      }
    } catch (error) {
      if (requestId !== slotRequestRef.current) return;
      setSchedule(error.details || null);
      setSlots([]);
      setClosedMessage('');
      setAvailabilityError(error.message || 'Booking times could not be loaded.');
      if (resumeRequestedRef.current) {
        clearCustomerAuthAction();
        resumeRequestedRef.current = false;
        navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
      }
    } finally {
      if (requestId === slotRequestRef.current) setIsLoadingSlots(false);
    }
  }, [editingCartItem, location.pathname, navigate, serviceId, units]);

  useEffect(() => {
    if (service) void Promise.resolve().then(() => loadSlots(bookingDate));
  }, [bookingDate, loadSlots, service]);

  const selectedSlot = slots.find((slot) => slot.startTime === timeSlot);
  const nextDateLimit = schedule?.maxDaysAhead ?? 30;
  const maximumDate = addDays(today, nextDateLimit);
  const allSlotsUnavailable = !isLoadingSlots && slots.length > 0 && slots.every((slot) => slot.status !== 'available');
  const canAddBooking = canSubmitServiceBooking({
    bookingDate,
    timeSlot,
    selectedSlot,
    motorcycle: vehicle,
    isLoadingSlots
  });

  if (isLoadingService) return <CustomerPage title="Loading service" description="Loading service details." />;
  if (serviceError === 'not-found') return <CustomerPage title="Service not found" description="This service could not be found."><Link to="/customer/services">Back to Services</Link></CustomerPage>;
  if (serviceError || !service) return <CustomerPage title="Could not load service" description={serviceError || 'Could not load service.'}><button type="button" className="customer-secondary-button" onClick={() => {
    setLoadedServiceId('');
    setService(null);
    setServiceError('');
    setServiceRetryKey((key) => key + 1);
  }}>Try again</button></CustomerPage>;

  const durationMinutes = Number(service.durationMinutes || 60) * (service.pricePerUnit && service.scaleDuration !== false ? units : 1);
  const durationLabel = formatDuration(durationMinutes);
  const laborOnlyUnavailable = partsSource === 'customer'
    && (service.laborOnlyPrice === null || service.laborOnlyPrice === undefined || service.laborOnlyPrice === '');
  const unitPrice = partsSource === 'customer' ? Number(service.laborOnlyPrice || 0) : Number(service.price || 0);
  const serviceAmounts = calculateServiceAmounts(unitPrice, service.mechanicFee, units);
  const unitPromptLabel = (service.unitLabel || 'unit').endsWith('s')
    ? service.unitLabel
    : `${service.unitLabel || 'unit'}s`;
  const handleDateChange = (event) => {
    const nextDate = event.target.value;
    slotRequestRef.current += 1;
    nextAvailableRequestRef.current += 1;
    if (!nextDate) {
      const state = getDateChangeState('');
      setBookingDate(state.bookingDate);
      setTimeSlot(state.timeSlot);
      setClosedMessage('');
      return;
    }
    const dayName = weekdayForDate(nextDate);
    if (schedule && !schedule.openDays.includes(dayName)) {
      setClosedMessage(`The shop is closed on ${dayName === 'Sun' ? 'Sundays' : `${dayName}s`}.`);
      const state = getDateChangeState(nextDate);
      setTimeSlot(state.timeSlot);
      return;
    }
    setClosedMessage('');
    const state = getDateChangeState(nextDate);
    setBookingDate(state.bookingDate);
    setTimeSlot(state.timeSlot);
  };

  const handleNextAvailable = async () => {
    setIsFindingNext(true);
    setBookingError('');
    const requestId = ++nextAvailableRequestRef.current;
    try {
      for (let offset = 1; offset <= nextDateLimit; offset += 1) {
        const date = addDays(bookingDate || today, offset);
        if (date > maximumDate) break;
        const response = await api.getServiceSlots(serviceId, date, units);
        if (requestId !== nextAvailableRequestRef.current) return;
        const availableSlot = response.slots?.find((slot) => slot.status === 'available');
        if (availableSlot) {
          setBookingDate(date);
          setClosedMessage('');
          return;
        }
      }
      setBookingError('No available booking times were found in the current booking window.');
    } catch (error) {
      if (requestId === nextAvailableRequestRef.current) {
        setBookingError(error.message || 'Available booking times could not be found.');
      }
    } finally {
      if (requestId === nextAvailableRequestRef.current) setIsFindingNext(false);
    }
  };

  const saveVehicle = (event) => {
    event.preventDefault();
    const name = `${vehicleForm.year} ${vehicleForm.make} ${vehicleForm.model}`.trim();
    addVehicle({ ...vehicleForm, name });
    setVehicle(name);
    setShowVehicleForm(false);
    setVehicleForm({ make: '', model: '', year: '', plate: '' });
  };

  const addBooking = async () => {
    if (!canAddBooking || !selectedSlot || laborOnlyUnavailable) return;
    const customerToken = getAuthToken('customer');
    if (!customerToken || customerToken === 'prototype-guest') {
      saveCustomerAuthAction({
        type: 'service',
        returnPath: `${location.pathname}${location.search}`,
        serviceId: service._id,
        date: bookingDate,
        time: timeSlot,
        motorcycle: vehicle.trim()
      });
      navigate('/customer/login');
      return;
    }
    setBookingError('');
    try {
      const latest = await api.getServiceSlots(service._id, bookingDate, units);
      const currentSlot = latest.slots?.find((slot) => slot.startTime === timeSlot);
      if (!currentSlot || currentSlot.status !== 'available') {
        setBookingError('That time was just booked. Please choose another.');
        setTimeSlot('');
        await loadSlots(bookingDate);
        return;
      }
      const cartItem = {
        kind: 'service',
        id: service._id,
        serviceId: service._id,
        partsSource,
        name: formatServiceName(service.name, service.pricePerUnit ? units : 1, service.unitLabel),
        price: serviceAmounts.servicePriceTotal,
        unitPrice,
        mechanicFee: serviceAmounts.mechanicFeeTotal,
        unitMechanicFee: Number(service.mechanicFee),
        ...serviceAmounts,
        ...(service.pricePerUnit ? { units, unitLabel: service.unitLabel } : {}),
        category: service.category,
        duration: durationLabel,
        durationMinutes: service.durationMinutes,
        icon: '🔧',
        bookingDate,
        startTime: timeSlot,
        timeSlot: localTimeLabel(timeSlot),
        endTime: currentSlot.endTime,
        vehicle: vehicle.trim(),
        notes
      };
      if (editCartKey) replaceCartItem(editCartKey, cartItem);
      else addCartItem(cartItem);
      navigate('/customer/cart', { state: { message: editCartKey ? 'Booking updated.' : `${service.name} booking added to your cart.` } });
    } catch (error) {
      setBookingError(error.message || 'That booking time could not be checked. Please try again.');
      await loadSlots(bookingDate);
    }
  };

  const missingBookingChoice = !bookingDate
    ? 'Choose a date to continue.'
    : !selectedSlot
      ? 'Choose a time to continue.'
      : !vehicle.trim()
        ? 'Choose a motorcycle to continue.'
        : '';
  const summary = selectedSlot && vehicle
    ? `${dateSummary(bookingDate)} · ${localTimeLabel(selectedSlot.startTime)} - ${localTimeLabel(selectedSlot.endTime)} · ${vehicle}`
    : 'Choose a date, time, and motorcycle to preview your booking.';

  return <CustomerPage title={service.name} description="Service details and booking availability.">
    <div className="customer-flow-page">
      {partsSource === 'customer' && <p className="customer-labor-only-note">
        Labor only: you bring your own parts.{' '}
        <Link to={`/customer/services/${service._id}`}>Switch to shop-parts version</Link>
      </p>}
      {laborOnlyUnavailable && <p className="customer-error" role="alert">Labor-only booking is not available for this service. <Link to={`/customer/services/${service._id}`}>Switch to shop parts</Link>.</p>}
      <nav className="customer-breadcrumbs" aria-label="Breadcrumb"><Link to="/customer/services">Services</Link><span>/</span><span>{service.category || 'General'}</span><span>/</span><span>{service.name}</span></nav>
      <section className="customer-detail-layout customer-service-detail">
        <div className="customer-detail-art tone-sun" aria-label={`${service.name} service illustration`}><span aria-hidden="true">🔧</span><small>{durationLabel}</small></div>
        <div className="customer-detail-copy"><p className="customer-eyebrow">{service.category || 'General'} · {durationLabel}</p><h1>{service.name}</h1><p>{service.description}</p><strong className="customer-detail-price">{partsSource === 'customer' ? 'Labor-only total' : 'Total'} {`₱${Number(serviceAmounts.estimatedPrice).toLocaleString('en-PH')}`}</strong>
          <h2>What&apos;s included</h2><ul className="customer-inclusion-list"><li>{service.description || 'Service details available at the shop.'}</li></ul>
        </div>
      </section>
      <section className="customer-booking-panel">
        <div className="customer-flow-section-heading"><div><p className="customer-eyebrow">BOOK A SERVICE</p><h2>Book a time</h2></div><span>{durationLabel} · all times Manila time</span></div>
        {partsSource === 'shop' && service.laborOnlyPrice != null && <p className="customer-labor-only-switch"><Link to={`/customer/services/${service._id}?parts=own`}>Book labor only (I have my own parts)</Link></p>}
        {service.pricePerUnit && <p className="customer-service-unit-price">{`${partsSource === 'customer' ? 'Labor-only ' : ''}₱${unitPrice.toLocaleString('en-PH')} + ₱${Number(service.mechanicFee || 0).toLocaleString('en-PH')} mechanic fee per ${service.unitLabel}`}</p>}
        <ServicePriceBreakdown {...serviceAmounts} />
        {service.pricePerUnit && <label className="customer-service-units">How many {unitPromptLabel}?
          <span className="customer-quantity-control">
            <button type="button" aria-label="Decrease service units" disabled={units <= 1} onClick={() => setUnits((value) => Math.max(1, value - 1))}>−</button>
            <output>{units}</output>
            <button type="button" aria-label="Increase service units" disabled={units >= Number(service.maxUnits || 2)} onClick={() => setUnits((value) => Math.min(Number(service.maxUnits || 2), value + 1))}>+</button>
          </span>
        </label>}
        <div className="customer-booking-fields">
          <label>Booking date<input type="date" min={today} max={maximumDate} value={bookingDate} onChange={handleDateChange} required />{closedMessage && <small className="customer-field-error" role="status">{closedMessage}</small>}</label>
          <div className="customer-motorcycle-field">
            <label htmlFor="service-motorcycle">Motorcycle</label>
            {vehicles.length > 0 && !showVehicleForm
              ? <select id="service-motorcycle" value={vehicle} onChange={(event) => {
                if (event.target.value === '__add_new__') {
                  setVehicle('');
                  setShowVehicleForm(true);
                } else {
                  setVehicle(event.target.value);
                }
              }}>
                <option value="">Select a motorcycle</option>
                {vehicles.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                <option value="__add_new__">Add new motorcycle</option>
              </select>
              : <VehicleForm value={vehicleForm} onChange={setVehicleForm} onSave={saveVehicle} />}
            {vehicles.length > 0 && showVehicleForm && <button className="customer-vehicle-cancel" type="button" onClick={() => { setShowVehicleForm(false); setVehicle(vehicles[0].name); }}>Choose a saved motorcycle</button>}
          </div>
          <ServiceBookingTimeSelect
            slots={slots}
            timeSlot={timeSlot}
            isLoading={isLoadingSlots}
            closedMessage={closedMessage}
            availabilityError={availabilityError}
            onChange={(event) => {
              setTimeSlot(event.target.value);
              setBookingError('');
            }}
          />
        </div>
        {availabilityError && <p className="customer-error" role="alert">{availabilityError}</p>}
        {bookingError && <p className="customer-error" role="alert">{bookingError}</p>}
        {closedMessage && <p className="customer-shop-closed-message" role="status">{closedMessage}</p>}
        {allSlotsUnavailable && <div className="customer-no-slots"><p>No slots left on this date</p><button type="button" className="customer-secondary-button" onClick={handleNextAvailable} disabled={isFindingNext}>{isFindingNext ? 'Finding a date...' : 'Show next available'}</button></div>}
        <label className="customer-notes-field">Notes for the mechanic<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="3" placeholder="Anything the mechanic should know?" /><small>{service.pricePerUnit ? 'Notes do not change the price. Choose the quantity above.' : 'Notes do not change the service price.'}</small></label>
        <div className="customer-booking-summary">
          <p>{summary}</p>
          <div className="customer-booking-footer"><p>Estimated total <strong>₱{Number(serviceAmounts.estimatedPrice).toLocaleString('en-PH')}</strong></p>          <button type="button" className="customer-primary-button" disabled={!canAddBooking} onClick={addBooking}>{editCartKey ? 'Update booking' : 'Add booking to cart'}</button></div>
          {!canAddBooking && <small className="customer-booking-hint">{missingBookingChoice || (closedMessage ? 'Choose an open date.' : 'Choose an available time to continue.')}</small>}
        </div>
      </section>
    </div>
  </CustomerPage>;
}
