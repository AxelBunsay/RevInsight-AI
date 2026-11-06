import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { CustomerPage } from './CustomerLayout';
import { useCustomerPrototype } from './useCustomerPrototype';
import { clearAuthSession, storeAuthUser } from '../../auth/authSession';
import { clearCustomerAuthAction } from './customerAuthAction';
import { cleanAndValidateMobileNumber, MOBILE_NUMBER_ERROR } from '../../../../shared/mobileNumber.mjs';
import CustomerModalPortal from './CustomerModalPortal';
import PasswordInput from '../../components/PasswordInput';
import { getCustomerProfileImageValidationError } from './profileImageValidation';
import useCustomerModalEffects from './useCustomerModalEffects';
import '../styles/customer-flow.css';

const activeReservationStatuses = ['Pending Down Payment', 'Payment Submitted', 'Reserved'];
const incorrectPasswordMessage = 'Current password is incorrect.';

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

export default function CustomerProfile() {
  const navigate = useNavigate();
  const { profile, vehicles, reservations: prototypeBookings, updateProfile, addVehicle, clearCustomerData } = useCustomerPrototype();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileForm, setProfileForm] = useState(() => ({
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    email: profile.email || '',
    phoneNumber: cleanAndValidateMobileNumber(profile.phoneNumber || '').canonicalDigits
  }));
  const [vehicleForm, setVehicleForm] = useState({ make: '', model: '', year: '', plate: '' });
  const [itemReservations, setItemReservations] = useState([]);
  const [serviceBookings, setServiceBookings] = useState([]);
  const [reservationError, setReservationError] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  const [profileImagePreview, setProfileImagePreview] = useState('');
  const [profileImageError, setProfileImageError] = useState('');
  const profileImageInputRef = useRef(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isTwoFactorModalOpen, setIsTwoFactorModalOpen] = useState(false);
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorError, setTwoFactorError] = useState('');
  const [isUpdatingTwoFactor, setIsUpdatingTwoFactor] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [hasBlockedRecords, setHasBlockedRecords] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const deleteDialogRef = useRef(null);
  const customerName = `${profileForm.firstName} ${profileForm.lastName}`.trim() || profile.name || 'Demo Rider';

  useEffect(() => () => {
    if (profileImagePreview) URL.revokeObjectURL(profileImagePreview);
  }, [profileImagePreview]);

  useCustomerModalEffects(isDeleteModalOpen, () => {
    if (!isDeletingAccount) setIsDeleteModalOpen(false);
  });
  useCustomerModalEffects(isTwoFactorModalOpen, () => {
    if (!isUpdatingTwoFactor) setIsTwoFactorModalOpen(false);
  });

  useEffect(() => {
    if (!isDeleteModalOpen) return undefined;
    const dialog = deleteDialogRef.current;
    dialog?.focus();

    const keepFocusInDialog = (event) => {
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [...dialog.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === dialog) {
        event.preventDefault();
        last.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', keepFocusInDialog);
    return () => document.removeEventListener('keydown', keepFocusInDialog);
  }, [isDeleteModalOpen]);

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
    if (!cleanAndValidateMobileNumber(profileForm.phoneNumber).isValid) errors.phoneNumber = MOBILE_NUMBER_ERROR;
    setFieldErrors(errors);
    setFormError('');
    setToast('');
    if (Object.keys(errors).length) return;

    setIsSaving(true);
    try {
      const response = await api.updateCustomerProfile({
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        phoneNumber: cleanAndValidateMobileNumber(profileForm.phoneNumber).digits
      });
      const updatedProfile = response.user || {
        ...profile,
        ...profileForm,
        phoneNumber: cleanAndValidateMobileNumber(profileForm.phoneNumber).digits
      };
      updateProfile(updatedProfile);
      localStorage.setItem('customerUser', JSON.stringify({ ...profile, ...updatedProfile }));
      setProfileForm((current) => ({ ...current, ...updatedProfile, phoneNumber: cleanAndValidateMobileNumber(updatedProfile.phoneNumber).canonicalDigits }));
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

  const changeProfileImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const validationError = getCustomerProfileImageValidationError(file);
    setProfileImageError(validationError);
    setFormError('');
    setToast('');
    if (validationError) return;

    setProfileImagePreview(URL.createObjectURL(file));
    setIsUploadingProfileImage(true);
    try {
      const response = await api.uploadCustomerProfileImage(file);
      const updatedProfile = { ...profile, profileImage: response.profileImage };
      updateProfile(updatedProfile);
      storeAuthUser('customer', updatedProfile);
      localStorage.setItem('customerUser', JSON.stringify(updatedProfile));
      setProfileImagePreview('');
      setToast('Profile photo updated successfully.');
    } catch (error) {
      setProfileImagePreview('');
      setProfileImageError(error.message || 'Profile photo could not be uploaded.');
    } finally {
      setIsUploadingProfileImage(false);
    }
  };

  const removeProfileImage = async () => {
    setProfileImageError('');
    setToast('');
    setIsUploadingProfileImage(true);
    try {
      const response = await api.removeCustomerProfileImage();
      const updatedProfile = { ...profile, profileImage: response.profileImage };
      updateProfile(updatedProfile);
      storeAuthUser('customer', updatedProfile);
      localStorage.setItem('customerUser', JSON.stringify(updatedProfile));
      setProfileImagePreview('');
      setToast('Profile photo removed.');
    } catch (error) {
      setProfileImageError(error.message || 'Profile photo could not be removed.');
    } finally {
      setIsUploadingProfileImage(false);
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
      const message = error.message || 'Password could not be changed.';
      setPasswordError(message);
      if (message === incorrectPasswordMessage) {
        setPasswordForm((current) => ({ ...current, currentPassword: '' }));
        window.requestAnimationFrame(() => document.getElementById('change-password-current')?.focus());
      }
    } finally {
      setIsChangingPassword(false);
    }
  };

  const updateTwoFactor = async (event) => {
    event.preventDefault();
    setTwoFactorError('');
    setIsUpdatingTwoFactor(true);
    try {
      const response = await api.setCustomerTwoFactor(!profile.twoFactorEnabled, twoFactorPassword);
      const updatedProfile = { ...profile, twoFactorEnabled: response.twoFactorEnabled };
      updateProfile(updatedProfile);
      localStorage.setItem('customerUser', JSON.stringify(updatedProfile));
      setTwoFactorPassword('');
      setIsTwoFactorModalOpen(false);
      setToast(response.message || 'Two-step verification settings updated.');
    } catch (error) {
      const message = error.message || 'Two-step verification settings could not be updated.';
      setTwoFactorError(message);
      if (message === incorrectPasswordMessage) {
        setTwoFactorPassword('');
        window.requestAnimationFrame(() => document.getElementById('two-factor-current-password')?.focus());
      }
    } finally {
      setIsUpdatingTwoFactor(false);
    }
  };

  const deleteAccount = async () => {
    setDeleteError('');
    setHasBlockedRecords(false);
    setIsDeletingAccount(true);
    try {
      const response = await api.deleteCustomerAccount();
      clearAuthSession('customer');
      clearCustomerAuthAction();
      clearCustomerData();
      navigate('/customer/shop', {
        replace: true,
        state: { message: response.message || 'Your account was deleted.' }
      });
    } catch (error) {
      const message = error.message || 'Your account could not be deleted.';
      setDeleteError(message);
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

  const tabs = [['profile', 'Profile'], ['vehicles', 'My vehicles']];

  return <CustomerPage title="Account" description="Manage your profile and motorcycles.">
    <div className="customer-flow-page customer-account-page">
      <div className="customer-account-tabs" role="tablist" aria-label="Account sections">
        {tabs.map(([key, label]) => <button type="button" role="tab" aria-selected={activeTab === key} aria-controls={`account-panel-${key}`} id={`account-tab-${key}`} className={activeTab === key ? 'is-active' : ''} key={key} onClick={() => { setActiveTab(key); setToast(''); setFieldErrors({}); }}>
          {label}
        </button>)}
      </div>

      <aside className="customer-account-identity">
        <div className="customer-account-avatar-group">
          <button
            type="button"
            className="customer-account-avatar"
            aria-label="Change profile photo"
            onClick={() => profileImageInputRef.current?.click()}
            disabled={isUploadingProfileImage}
          >
            {profileImagePreview || profile.profileImage
              ? <img src={profileImagePreview || profile.profileImage} alt="" />
              : <span>{customerName.charAt(0).toUpperCase()}</span>}
            <span className="customer-account-avatar-overlay" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M8.5 5.5 10 3.75h4l1.5 1.75H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h3.5Z" />
                <circle cx="12" cy="12.5" r="3.25" />
              </svg>
            </span>
            <span className="customer-account-avatar-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24" focusable="false">
                <path d="M8.5 5.5 10 3.75h4l1.5 1.75H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h3.5Z" />
                <circle cx="12" cy="12.5" r="3.25" />
              </svg>
            </span>
            {isUploadingProfileImage && <span className="customer-account-avatar-spinner" role="status" aria-label="Uploading profile photo" />}
          </button>
          <input
            ref={profileImageInputRef}
            className="customer-account-avatar-input"
            type="file"
            accept="image/png,image/jpeg"
            onChange={changeProfileImage}
            tabIndex={-1}
            aria-hidden="true"
          />
          {profile.profileImage && <button
            type="button"
            className="customer-account-photo-remove"
            onClick={removeProfileImage}
            disabled={isUploadingProfileImage}
          >
            Remove photo
          </button>}
        </div>
        <div className="customer-account-identity-copy">
          <strong>{customerName}</strong>
        </div>
        {profileImageError && <small className="customer-field-error customer-account-photo-error" role="alert">{profileImageError}</small>}
        <div className="customer-account-identity-stats">
          <Link to="/my-purchases?tab=items">Active reservations: <strong>{activeReservationCount}</strong></Link>
          <Link to="/my-purchases?tab=services">Upcoming bookings: <strong>{upcomingBookingsCount}</strong></Link>
        </div>
      </aside>
      {(reservationError || bookingError) && <p className="customer-error customer-account-data-error" role="alert">{[reservationError, bookingError].filter(Boolean).join(' ')}</p>}

      {toast && <p className="customer-success customer-account-toast" role="status">{toast}</p>}

      {activeTab === 'profile' && <section className="customer-account-panel" id="account-panel-profile" role="tabpanel" aria-labelledby="account-tab-profile">
        <div className="customer-flow-section-heading"><div><p className="customer-eyebrow">PERSONAL DETAILS</p><h2>My profile</h2></div></div>
        <form className="customer-account-form" onSubmit={saveProfile} noValidate>
          <label>First name<input required value={profileForm.firstName} aria-invalid={Boolean(fieldErrors.firstName)} onChange={(event) => { setProfileForm({ ...profileForm, firstName: event.target.value }); setFieldErrors({ ...fieldErrors, firstName: '' }); setFormError(''); }} />{fieldErrors.firstName && <small className="customer-field-error" role="alert">{fieldErrors.firstName}</small>}</label>
          <label>Last name<input required value={profileForm.lastName} aria-invalid={Boolean(fieldErrors.lastName)} onChange={(event) => { setProfileForm({ ...profileForm, lastName: event.target.value }); setFieldErrors({ ...fieldErrors, lastName: '' }); setFormError(''); }} />{fieldErrors.lastName && <small className="customer-field-error" role="alert">{fieldErrors.lastName}</small>}</label>
          <label>Username<input type="text" readOnly title="Your username can't be changed here." value={profile.username || 'Not set'} className="is-read-only" /></label>
          <label className="customer-account-email-field">Email address<input type="email" readOnly title="Your email is your login and can't be changed here." value={profileForm.email} className="is-read-only" /></label>
          <label>Phone number<input type="tel" inputMode="numeric" maxLength={11} autoComplete="tel" value={profileForm.phoneNumber} aria-invalid={Boolean(fieldErrors.phoneNumber)} onChange={(event) => { const phoneNumber = cleanAndValidateMobileNumber(event.target.value).digits.slice(0, 11); setProfileForm({ ...profileForm, phoneNumber }); setFieldErrors({ ...fieldErrors, phoneNumber: cleanAndValidateMobileNumber(phoneNumber).isValid ? '' : MOBILE_NUMBER_ERROR }); setFormError(''); }} onPaste={(event) => { event.preventDefault(); const phoneNumber = cleanAndValidateMobileNumber(event.clipboardData.getData('text')).digits.slice(0, 11); setProfileForm({ ...profileForm, phoneNumber }); setFieldErrors({ ...fieldErrors, phoneNumber: cleanAndValidateMobileNumber(phoneNumber).isValid ? '' : MOBILE_NUMBER_ERROR }); setFormError(''); }} placeholder="09xxxxxxxxx" />{fieldErrors.phoneNumber && <small className="customer-field-error" role="alert">{fieldErrors.phoneNumber}</small>}</label>
          <button type="submit" className="customer-primary-button" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save profile'}</button>
          {formError && <small className="customer-field-error customer-form-error" role="alert">{formError}</small>}
        </form>

        <section className="customer-account-subsection">
          <div className="customer-flow-section-heading">
            <div><p className="customer-eyebrow">ACCOUNT ACCESS</p><h2>Security</h2></div>
          </div>
          <div className="customer-two-factor-setting">
            <div>
              <h3>Two-step verification (email code)</h3>
              <p>When on, we email you a 6-digit code each time you sign in.</p>
              <small role="status">{profile.twoFactorEnabled ? 'Currently on' : 'Currently off'}</small>
            </div>
            <button type="button" className={profile.twoFactorEnabled ? 'customer-secondary-button' : 'customer-primary-button'} onClick={() => {
              setTwoFactorPassword('');
              setTwoFactorError('');
              setIsTwoFactorModalOpen(true);
            }}>{profile.twoFactorEnabled ? 'Turn off' : 'Turn on'}</button>
          </div>
          <form className="customer-account-form" onSubmit={changePassword} noValidate>
            <label>Current password<PasswordInput id="change-password-current" autoComplete="current-password" aria-invalid={passwordError === incorrectPasswordMessage} value={passwordForm.currentPassword} onChange={(event) => { setPasswordForm({ ...passwordForm, currentPassword: event.target.value }); setPasswordError(''); }} />{passwordError === incorrectPasswordMessage && <small className="customer-field-error" role="alert">{passwordError}</small>}</label>
            <label>New password<PasswordInput autoComplete="new-password" value={passwordForm.newPassword} onChange={(event) => { setPasswordForm({ ...passwordForm, newPassword: event.target.value }); setPasswordError(''); }} /><small className="customer-field-hint">At least 8 characters, including a letter and a number.</small></label>
            <label>Confirm new password<PasswordInput autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(event) => { setPasswordForm({ ...passwordForm, confirmPassword: event.target.value }); setPasswordError(''); }} /></label>
            <button type="submit" className="customer-primary-button" disabled={isChangingPassword}>{isChangingPassword ? 'Updating...' : 'Change password'}</button>
            {passwordError && passwordError !== incorrectPasswordMessage && <small className="customer-field-error customer-form-error" role="alert">{passwordError}</small>}
          </form>
        </section>

        <section className="customer-account-delete">
          <h2>Delete account</h2>
          <p>Deleting your account removes your personal information. Your past purchase and booking records are kept without your name for the shop&apos;s sales records.</p>
          <button type="button" className="customer-danger-button" onClick={() => { setDeleteError(''); setHasBlockedRecords(false); setIsDeleteModalOpen(true); }}>Delete my account</button>
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

      {isDeleteModalOpen && <CustomerModalPortal><div className="customer-confirmation-backdrop customer-delete-account-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeletingAccount) setIsDeleteModalOpen(false); }}>
        <section ref={deleteDialogRef} className="customer-confirmation-dialog customer-delete-account-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" tabIndex="-1">
          <header className="customer-modal-header customer-delete-header">
            <div className="customer-delete-heading">
              <span className="customer-delete-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 3.25 1.8 20.75h20.4L12 3.25Z" fill="currentColor" /><path d="M12 9v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="17" r="1.15" fill="#fff" /></svg></span>
              <h2 id="delete-account-title">Delete your account?</h2>
            </div>
            <button type="button" className="customer-modal-close" aria-label="Close" onClick={() => setIsDeleteModalOpen(false)} disabled={isDeletingAccount}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
          </header>
          <div className="customer-modal-body">
            <p>This action cannot be undone. Your profile, saved details and access to your account will be removed. Your past orders and bookings are kept for the shop&apos;s records without your personal details.</p>
            {deleteError && <div className="customer-delete-notice" role="alert">
              <p>{deleteError}</p>
              {hasBlockedRecords && <div className="customer-delete-record-links">
                <Link to="/my-purchases?tab=items">View reservations</Link>
                <Link to="/my-purchases?tab=services">View bookings</Link>
              </div>}
            </div>}
          </div>
          <footer className="customer-modal-footer">
            <button type="button" className="customer-delete-cancel-button" onClick={() => setIsDeleteModalOpen(false)} disabled={isDeletingAccount}>Cancel</button>
            <button type="button" className="customer-delete-submit-button" onClick={deleteAccount} disabled={isDeletingAccount}>{isDeletingAccount ? 'Deleting...' : 'Delete my account'}</button>
          </footer>
        </section>
      </div></CustomerModalPortal>}
      {isTwoFactorModalOpen && <CustomerModalPortal><div className="customer-confirmation-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isUpdatingTwoFactor) setIsTwoFactorModalOpen(false); }}>
        <section className="customer-confirmation-dialog customer-two-factor-dialog" role="dialog" aria-modal="true" aria-labelledby="two-factor-title">
          <header className="customer-modal-header"><h2 id="two-factor-title">{profile.twoFactorEnabled ? 'Turn off two-step verification?' : 'Turn on two-step verification?'}</h2><button type="button" className="customer-modal-close" aria-label="Close two-step verification dialog" onClick={() => setIsTwoFactorModalOpen(false)} disabled={isUpdatingTwoFactor}>×</button></header>
          <div className="customer-modal-body">
            <p>Enter your current password to confirm this change.</p>
            <form id="two-factor-form" onSubmit={updateTwoFactor}>
              <label className="customer-delete-field">Current password<PasswordInput id="two-factor-current-password" required autoComplete="current-password" aria-invalid={twoFactorError === incorrectPasswordMessage} value={twoFactorPassword} onChange={(event) => { setTwoFactorPassword(event.target.value); setTwoFactorError(''); }} />{twoFactorError && <small className="customer-field-error" role="alert">{twoFactorError}</small>}</label>
            </form>
          </div>
          <footer className="customer-modal-footer">
            <button type="button" className="customer-secondary-button" onClick={() => setIsTwoFactorModalOpen(false)} disabled={isUpdatingTwoFactor}>Cancel</button>
            <button type="submit" form="two-factor-form" className="customer-primary-button" disabled={isUpdatingTwoFactor || !twoFactorPassword}>{isUpdatingTwoFactor ? 'Saving...' : profile.twoFactorEnabled ? 'Turn off' : 'Turn on'}</button>
          </footer>
        </section>
      </div></CustomerModalPortal>}
    </div>
  </CustomerPage>;
}
