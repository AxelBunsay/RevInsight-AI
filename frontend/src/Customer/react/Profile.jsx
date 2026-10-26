import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import ProductImage from './ProductImage';
import '../styles/customer-flow.css';

const activeReservationStatuses = ['Pending Down Payment', 'Payment Submitted', 'Reserved'];
const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
const statusClass = (status) => `status-${String(status || '').toLowerCase().replaceAll(' ', '-')}`;

function formatPhoneNumber(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('63')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(Boolean);
  return groups.length ? `+63 ${groups.join(' ')}` : '';
}

function isValidPhilippineMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const localNumber = digits.startsWith('63') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
  return /^9\d{9}$/.test(localNumber);
}

function dateKeyInManila(value) {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function itemReservationDeadline(reservation) {
  if (reservation.status === 'Pending Down Payment' && reservation.paymentDueAt) {
    const remaining = Math.max(0, new Date(reservation.paymentDueAt).getTime() - Date.now());
    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    return `Pay within ${hours ? `${hours}h ` : ''}${minutes}m`;
  }
  if (reservation.status === 'Reserved' && reservation.reservedUntil) {
    return `Reserved until ${new Date(reservation.reservedUntil).toLocaleDateString('en-PH', { dateStyle: 'medium' })}`;
  }
  return '';
}

function ServiceBookingCard({ booking, prototype = false }) {
  const serviceName = prototype ? booking.name : booking.serviceType;
  const bookingId = prototype ? booking.id : booking._id;
  const date = prototype ? booking.bookingDate : booking.scheduledDate;
  const status = prototype
    ? booking.status
    : booking.paymentStatus === 'Payment Submitted'
      ? booking.paymentStatus
      : booking.paymentStatus === 'Payment Pending' && booking.paymentRejectionReason
        ? 'Payment Pending'
      : booking.paymentStatus === 'Confirmed' && booking.status === 'pending'
        ? 'Confirmed'
        : booking.status;
  const dateLabel = date
    ? (prototype
      ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
      : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(date)))
    : 'Date to be confirmed';
  const bookingTime = prototype
    ? booking.timeSlot
    : [booking.startTime, booking.endTime].filter(Boolean).map(displayTime).join(' - ');
  return <article className="customer-reservation-card">
    <div className="customer-reservation-card-top">
      <div>
        <span className="customer-cart-item-kind">SERVICE BOOKING · {bookingId}</span>
        <h2>{serviceName}</h2>
        <p>{dateLabel}{bookingTime ? ` · ${bookingTime}` : ''}{booking.vehicle ? ` · ${booking.vehicle}` : ''}</p>
      </div>
      <span className={`customer-status-pill ${statusClass(status)}`}>{status}</span>
    </div>
    <div className="customer-reservation-card-bottom">
      <strong>{money(prototype ? booking.price : booking.estimatedPrice)}</strong>
      {prototype
        ? <Link to={`/customer/reservations/${bookingId}`}>View booking <span aria-hidden="true">→</span></Link>
        : <><span>{booking.description}</span><Link to={`/customer/reservations/${booking._id}`}>View booking <span aria-hidden="true">→</span></Link></>}
    </div>
  </article>;
}

function displayTime(value) {
  if (!value) return '';
  const [hours, minutes] = value.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

export default function CustomerProfile() {
  const navigate = useNavigate();
  const { profile, vehicles, reservations: prototypeBookings, updateProfile, addVehicle, clearCustomerData } = useCustomerPrototype();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileForm, setProfileForm] = useState(() => ({
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    email: profile.email || '',
    phoneNumber: formatPhoneNumber(profile.phoneNumber || '')
  }));
  const [vehicleForm, setVehicleForm] = useState({ make: '', model: '', year: '', plate: '' });
  const [itemReservations, setItemReservations] = useState([]);
  const [serviceBookings, setServiceBookings] = useState([]);
  const [isLoadingReservations, setIsLoadingReservations] = useState(true);
  const [reservationError, setReservationError] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [hasBlockedRecords, setHasBlockedRecords] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const customerName = `${profileForm.firstName} ${profileForm.lastName}`.trim() || profile.name || 'Demo Rider';

  useEffect(() => {
    let isMounted = true;
    Promise.allSettled([api.getCustomerReservations(), api.getCustomerServiceRequests()]).then(([itemsResult, bookingsResult]) => {
      if (!isMounted) return;
      if (itemsResult.status === 'fulfilled') {
        setItemReservations(itemsResult.value.reservations || []);
        setReservationError('');
      } else {
        setReservationError(itemsResult.reason.message || 'Item reservations could not be loaded.');
      }
      if (bookingsResult.status === 'fulfilled') {
        setServiceBookings(bookingsResult.value.requests || []);
        setBookingError('');
      } else {
        setBookingError(bookingsResult.reason.message || 'Service bookings could not be loaded.');
      }
      setIsLoadingReservations(false);
    });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const activeReservationCount = itemReservations.filter((reservation) => activeReservationStatuses.includes(reservation.status)).length;
  const allBookings = useMemo(() => {
    const prototypeIds = new Set(prototypeBookings.map((booking) => booking.id));
    return [
      ...prototypeBookings.map((booking) => ({ ...booking, source: 'prototype' })),
      ...serviceBookings
        .filter((booking) => !prototypeIds.has(booking._id))
        .map((booking) => ({ ...booking, source: 'api' }))
    ];
  }, [prototypeBookings, serviceBookings]);
  const upcomingBookingsCount = allBookings.filter((booking) => {
    const date = booking.source === 'prototype' ? booking.bookingDate : booking.scheduledDate;
    const isNotCancelled = !['cancelled', 'declined', 'completed'].includes(String(booking.status || '').toLowerCase());
    return isNotCancelled && date && dateKeyInManila(date) >= dateKeyInManila(new Date());
  }).length;

  const saveProfile = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!profileForm.firstName.trim()) errors.firstName = 'First name is required.';
    if (!profileForm.lastName.trim()) errors.lastName = 'Last name is required.';
    if (!isValidPhilippineMobile(profileForm.phoneNumber)) errors.phoneNumber = 'Enter a valid Philippine mobile number, such as +63 947 188 6228.';
    setFieldErrors(errors);
    setFormError('');
    setToast('');
    if (Object.keys(errors).length) return;

    setIsSaving(true);
    try {
      const response = await api.updateCustomerProfile({
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        phoneNumber: formatPhoneNumber(profileForm.phoneNumber)
      });
      const updatedProfile = response.user || {
        ...profile,
        ...profileForm,
        phoneNumber: formatPhoneNumber(profileForm.phoneNumber)
      };
      updateProfile(updatedProfile);
      localStorage.setItem('customerUser', JSON.stringify({ ...profile, ...updatedProfile }));
      setProfileForm((current) => ({ ...current, ...updatedProfile, phoneNumber: formatPhoneNumber(updatedProfile.phoneNumber) }));
      setToast('Profile saved successfully.');
    } catch (error) {
      const message = error.message || 'Profile could not be saved.';
      const lowerMessage = message.toLowerCase();
      const serverField = Object.keys(error.fieldErrors || {}).find((field) => ['firstName', 'lastName', 'phoneNumber'].includes(field));
      const field = serverField
        || (lowerMessage.includes('first name') ? 'firstName'
          : lowerMessage.includes('last name') ? 'lastName'
            : lowerMessage.includes('phone') ? 'phoneNumber'
              : lowerMessage.includes('cannot be empty') && !profileForm.firstName.trim() ? 'firstName'
                : lowerMessage.includes('cannot be empty') && !profileForm.lastName.trim() ? 'lastName'
                  : lowerMessage.includes('cannot be empty') && !profileForm.phoneNumber.trim() ? 'phoneNumber'
                    : '');
      if (field) setFieldErrors({ [field]: error.fieldErrors?.[field] || message });
      else setFormError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setPasswordError('');
    setToast('');

    if (passwordForm.newPassword.length < 8 || !/[A-Za-z]/.test(passwordForm.newPassword) || !/\d/.test(passwordForm.newPassword)) {
      setPasswordError('New password must be at least 8 characters and include a letter and a number.');
      return;
    }
    if (passwordForm.newPassword === passwordForm.currentPassword) {
      setPasswordError('New password must be different from your current password.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await api.changeCustomerPassword(passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setToast(response.message || 'Password changed successfully.');
    } catch (error) {
      setPasswordError(error.message || 'Password could not be changed.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const deleteAccount = async (event) => {
    event.preventDefault();
    setDeleteError('');
    setHasBlockedRecords(false);
    setIsDeletingAccount(true);
    try {
      const response = await api.deleteCustomerAccount({
        password: deletePassword,
        confirmation: deleteConfirmation
      });
      localStorage.removeItem('customerToken');
      clearCustomerData();
      navigate('/customer/shop', {
        replace: true,
        state: { message: response.message || 'Your account was deleted.' }
      });
    } catch (error) {
      setDeleteError(error.message || 'Your account could not be deleted.');
      setHasBlockedRecords(error.status === 409 && Boolean(error.details?.records));
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const saveVehicle = (event) => {
    event.preventDefault();
    addVehicle({ ...vehicleForm, name: `${vehicleForm.year} ${vehicleForm.make} ${vehicleForm.model}`.trim() });
    setVehicleForm({ make: '', model: '', year: '', plate: '' });
    setToast('Motorcycle saved.');
  };

  const tabs = [
    ['profile', 'Profile'],
    ['vehicles', 'My vehicles'],
    ['reservations', 'Reservations'],
    ['bookings', 'Bookings']
  ];

  return <CustomerPage title="Account" description="Manage your profile and motorcycles.">
    <div className="customer-flow-page customer-account-page">
      <div className="customer-account-tabs" role="tablist" aria-label="Account sections">
        {tabs.map(([key, label]) => <button type="button" role="tab" aria-selected={activeTab === key} aria-controls={`account-panel-${key}`} id={`account-tab-${key}`} className={activeTab === key ? 'is-active' : ''} key={key} onClick={() => { setActiveTab(key); setToast(''); setFieldErrors({}); }}>
          {label}{key === 'reservations' && <span className="customer-account-tab-count" aria-label={`${activeReservationCount} active reservations`}>{activeReservationCount}</span>}
        </button>)}
      </div>

      <aside className="customer-account-identity">
        <span>{customerName.charAt(0).toUpperCase()}</span>
        <div className="customer-account-identity-copy">
          <strong>{customerName}</strong>
          <small>{profileForm.email || profile.email || 'Local prototype account'}</small>
        </div>
        <div className="customer-account-identity-stats">
          <span>Active reservations: <strong>{activeReservationCount}</strong></span>
          <span>Upcoming bookings: <strong>{upcomingBookingsCount}</strong></span>
        </div>
      </aside>

      {toast && <p className="customer-success customer-account-toast" role="status">{toast}</p>}

      {activeTab === 'profile' && <section className="customer-account-panel" id="account-panel-profile" role="tabpanel" aria-labelledby="account-tab-profile">
        <div className="customer-flow-section-heading"><div><p className="customer-eyebrow">PERSONAL DETAILS</p><h2>My profile</h2></div></div>
        <form className="customer-account-form" onSubmit={saveProfile} noValidate>
          <label>First name<input required value={profileForm.firstName} aria-invalid={Boolean(fieldErrors.firstName)} onChange={(event) => { setProfileForm({ ...profileForm, firstName: event.target.value }); setFieldErrors({ ...fieldErrors, firstName: '' }); setFormError(''); }} />{fieldErrors.firstName && <small className="customer-field-error" role="alert">{fieldErrors.firstName}</small>}</label>
          <label>Last name<input required value={profileForm.lastName} aria-invalid={Boolean(fieldErrors.lastName)} onChange={(event) => { setProfileForm({ ...profileForm, lastName: event.target.value }); setFieldErrors({ ...fieldErrors, lastName: '' }); setFormError(''); }} />{fieldErrors.lastName && <small className="customer-field-error" role="alert">{fieldErrors.lastName}</small>}</label>
          <label>Email address<input type="email" readOnly value={profileForm.email} className="is-read-only" /><small className="customer-field-hint">Contact the shop to change your email.</small></label>
          <label>Phone number<input type="tel" inputMode="tel" value={profileForm.phoneNumber} aria-invalid={Boolean(fieldErrors.phoneNumber)} onChange={(event) => { setProfileForm({ ...profileForm, phoneNumber: formatPhoneNumber(event.target.value) }); setFieldErrors({ ...fieldErrors, phoneNumber: '' }); setFormError(''); }} placeholder="+63 947 188 6228" />{fieldErrors.phoneNumber && <small className="customer-field-error" role="alert">{fieldErrors.phoneNumber}</small>}</label>
          <button type="submit" className="customer-primary-button" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save profile'}</button>
          {formError && <small className="customer-field-error customer-form-error" role="alert">{formError}</small>}
        </form>

        <section className="customer-account-subsection">
          <div className="customer-flow-section-heading">
            <div><p className="customer-eyebrow">ACCOUNT ACCESS</p><h2>Security</h2></div>
            <button type="button" className="customer-password-toggle" onClick={() => setShowPasswords((visible) => !visible)}>{showPasswords ? 'Hide passwords' : 'Show passwords'}</button>
          </div>
          <form className="customer-account-form" onSubmit={changePassword} noValidate>
            <label>Current password<input type={showPasswords ? 'text' : 'password'} autoComplete="current-password" value={passwordForm.currentPassword} onChange={(event) => { setPasswordForm({ ...passwordForm, currentPassword: event.target.value }); setPasswordError(''); }} /></label>
            <label>New password<input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => { setPasswordForm({ ...passwordForm, newPassword: event.target.value }); setPasswordError(''); }} /><small className="customer-field-hint">At least 8 characters, including a letter and a number.</small></label>
            <label>Confirm new password<input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(event) => { setPasswordForm({ ...passwordForm, confirmPassword: event.target.value }); setPasswordError(''); }} /></label>
            <button type="submit" className="customer-primary-button" disabled={isChangingPassword}>{isChangingPassword ? 'Updating...' : 'Change password'}</button>
            {passwordError && <small className="customer-field-error customer-form-error" role="alert">{passwordError}</small>}
          </form>
        </section>

        <section className="customer-account-delete">
          <h2>Delete account</h2>
          <p>Deleting your account removes your personal information. Your past purchase and booking records are kept without your name for the shop&apos;s sales records.</p>
          <button type="button" className="customer-danger-button" onClick={() => { setDeletePassword(''); setDeleteConfirmation(''); setDeleteError(''); setHasBlockedRecords(false); setIsDeleteModalOpen(true); }}>Delete my account</button>
        </section>
      </section>}

      {activeTab === 'vehicles' && <section className="customer-account-panel" id="account-panel-vehicles" role="tabpanel" aria-labelledby="account-tab-vehicles">
        <div className="customer-flow-section-heading"><div><p className="customer-eyebrow">GARAGE</p><h2>Saved motorcycles</h2></div><span>{vehicles.length} saved</span></div>
        {vehicles.length > 0 && <div className="customer-account-records">{vehicles.map((vehicle) => <article key={vehicle.id}><span aria-hidden="true">🏍</span><div><strong>{vehicle.name}</strong><small>{vehicle.plate || 'License plate not added'}</small></div></article>)}</div>}
        <form className="customer-account-form" onSubmit={saveVehicle}>
          <label>Make<input required value={vehicleForm.make} onChange={(event) => setVehicleForm({ ...vehicleForm, make: event.target.value })} placeholder="Honda" /></label>
          <label>Model<input required value={vehicleForm.model} onChange={(event) => setVehicleForm({ ...vehicleForm, model: event.target.value })} placeholder="Click 160" /></label>
          <label>Year<input inputMode="numeric" value={vehicleForm.year} onChange={(event) => setVehicleForm({ ...vehicleForm, year: event.target.value })} placeholder="2024" /></label>
          <label>Plate number<input value={vehicleForm.plate} onChange={(event) => setVehicleForm({ ...vehicleForm, plate: event.target.value })} placeholder="ABC 1234" /></label>
          <button type="submit" className="customer-primary-button">Save motorcycle</button>
        </form>
      </section>}

      {activeTab === 'reservations' && <section className="customer-account-panel" id="account-panel-reservations" role="tabpanel" aria-labelledby="account-tab-reservations">
        <div className="customer-flow-section-heading"><div><p className="customer-eyebrow">ITEM PURCHASES</p><h2>Reservations</h2></div><span>{itemReservations.length} total</span></div>
        {reservationError && <p className="customer-error" role="alert">{reservationError}</p>}
        {isLoadingReservations
          ? <p className="customer-empty">Loading reservations...</p>
          : itemReservations.length
            ? <div className="customer-reservation-list">{itemReservations.map((reservation) => <article className="customer-reservation-card" key={reservation._id}>
              <div className="customer-reservation-card-top">
                <div><span className="customer-cart-item-kind">RESERVATION · {reservation.code}</span><div className="customer-reservation-item-list">{reservation.items.map((item) => <span className="customer-reservation-item-row" key={item.productId}><ProductImage src={item.imageUrl} alt="" className="customer-inline-product-image" fallback={<span className="customer-inline-product-placeholder" aria-hidden="true">▣</span>} /><strong>{item.name} × {item.qty}</strong></span>)}</div><p>{itemReservationDeadline(reservation)}</p></div>
                <span className={`customer-status-pill ${statusClass(reservation.status)}`}>{reservation.status}</span>
              </div>
              <div className="customer-reservation-card-finances"><span>Total <strong>{money(reservation.total)}</strong></span><span>Paid <strong>{money(reservation.amountPaid)}</strong></span><span>Balance <strong>{money(reservation.balanceDue)}</strong></span></div>
              <div className="customer-reservation-card-bottom"><Link to={`/customer/reservations/${reservation._id}`}>View reservation <span aria-hidden="true">→</span></Link></div>
            </article>)}</div>
            : !reservationError && <section className="customer-empty-cart"><span aria-hidden="true">▱</span><h2>No item reservations yet</h2><p>Your item reservations and pickup status will appear here.</p><Link className="customer-primary-button" to="/customer/shop">Browse the shop</Link></section>}
      </section>}

      {activeTab === 'bookings' && <section className="customer-account-panel" id="account-panel-bookings" role="tabpanel" aria-labelledby="account-tab-bookings">
        <div className="customer-flow-section-heading"><div><p className="customer-eyebrow">MECHANIC SERVICES</p><h2>Bookings</h2></div><span>{allBookings.length} total</span></div>
        {bookingError && <p className="customer-error" role="alert">{bookingError}</p>}
        {isLoadingReservations
          ? <p className="customer-empty">Loading bookings...</p>
          : allBookings.length
            ? <div className="customer-reservation-list">{allBookings.map((booking) => <ServiceBookingCard key={`${booking.source}-${booking.id || booking._id}`} booking={booking} prototype={booking.source === 'prototype'} />)}</div>
            : !bookingError && <section className="customer-empty-cart"><span aria-hidden="true">⌁</span><h2>No service bookings yet</h2><p>Your service bookings will appear here.</p><Link className="customer-primary-button" to="/customer/services">Browse services</Link></section>}
      </section>}

      {isDeleteModalOpen && <div className="customer-confirmation-backdrop" role="presentation">
        <section className="customer-confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
          <h2 id="delete-account-title">Delete your account?</h2>
          <p>This action cannot be undone. Enter your password and type DELETE to confirm.</p>
          <form onSubmit={deleteAccount}>
            <label className="customer-delete-field">Password<input type="password" autoComplete="current-password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label>
            <label className="customer-delete-field">Type DELETE to confirm<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" /></label>
            {deleteError && <p className="customer-field-error" role="alert">{deleteError}</p>}
            {hasBlockedRecords && <div className="customer-delete-record-links">
              <a href="#account-tab-reservations" onClick={(event) => { event.preventDefault(); setActiveTab('reservations'); setIsDeleteModalOpen(false); }}>View reservations</a>
              <a href="#account-tab-bookings" onClick={(event) => { event.preventDefault(); setActiveTab('bookings'); setIsDeleteModalOpen(false); }}>View bookings</a>
            </div>}
            <div>
              <button type="button" className="customer-primary-button" onClick={() => setIsDeleteModalOpen(false)} disabled={isDeletingAccount}>Cancel</button>
              <button type="submit" className="customer-danger-button" disabled={isDeletingAccount || !deletePassword || deleteConfirmation !== 'DELETE'}>{isDeletingAccount ? 'Deleting...' : 'Delete my account'}</button>
            </div>
          </form>
        </section>
      </div>}
    </div>
  </CustomerPage>;
}
