import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { getMechanicProfile, saveMechanicProfile } from './mechanicService';
import { cleanAndValidateMobileNumber, MOBILE_NUMBER_ERROR } from '../../../shared/mobileNumber.mjs';

const emptyProfile = { username: '', firstName: '', lastName: '', email: '', phoneNumber: '', specialization: 'general', yearsOfExperience: 0, certifications: [], bio: '', availabilityStatus: 'available' };

export default function MechanicProfile() {
  const [profile, setProfile] = useState(emptyProfile);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [phoneNumberError, setPhoneNumberError] = useState('');

  useEffect(() => {
    let active = true;
    getMechanicProfile().then(async (result) => {
      if (!active) return;
      const mechanic = result.mechanic || {};
      setProfile({ ...emptyProfile, ...mechanic, phoneNumber: cleanAndValidateMobileNumber(mechanic.phoneNumber || '').canonicalDigits });
      if (mechanic.id) {
        const statsResult = await api.getMechanicStats(mechanic.id);
        if (active) setStats(statsResult);
      }
    })
      .catch((loadError) => { if (active) setError(loadError.message || 'Profile could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const setField = (field, value) => setProfile((current) => ({ ...current, [field]: value }));
  const save = async (event) => {
    event.preventDefault();
    if (!cleanAndValidateMobileNumber(profile.phoneNumber).isValid) {
      setPhoneNumberError(MOBILE_NUMBER_ERROR);
      return;
    }
    setPhoneNumberError('');
    setSaving(true); setMessage(''); setError('');
    try {
      const result = await saveMechanicProfile({ ...profile, yearsOfExperience: Number(profile.yearsOfExperience), certifications: Array.isArray(profile.certifications) ? profile.certifications : profile.certifications.split(',').map((item) => item.trim()).filter(Boolean) });
      const savedProfile = result.mechanic || profile;
      setProfile({ ...emptyProfile, ...savedProfile, phoneNumber: cleanAndValidateMobileNumber(savedProfile.phoneNumber || profile.phoneNumber).canonicalDigits });
      setMessage(result.message || 'Profile saved.');
    } catch (saveError) { setError(saveError.message || 'Profile could not be saved.'); }
    finally { setSaving(false); }
  };

  return <>
    {error && <p className="mechanic-alert" role="alert">{error}</p>}{message && <p className="mechanic-success" role="status">{message}</p>}
    {loading ? <p className="mechanic-loading">Loading profile…</p> : <>
      <section className="mechanic-panel workload-panel">
        <div className="mechanic-panel-heading"><h2>Performance</h2></div>
        <div className="mechanic-workload-stats">
          <div><strong>{stats?.completedJobs ?? 0}</strong><span>Completed repairs</span></div>
          <div><strong>{Number(profile.averageRating || 0).toFixed(1)}</strong><span>Average rating</span></div>
          <div><strong>{Number(profile.successRate || 0)}%</strong><span>Success rate</span></div>
        </div>
      </section>
      <form className="mechanic-panel mechanic-profile-form" onSubmit={save}>
      <div className="mechanic-profile-grid">
        <label className="mechanic-field"><span>First name</span><input required value={profile.firstName} onChange={(event) => setField('firstName', event.target.value)} /></label>
        <label className="mechanic-field"><span>Last name</span><input required value={profile.lastName} onChange={(event) => setField('lastName', event.target.value)} /></label>
        <label className="mechanic-field full-width"><span>Username</span><input value={profile.username || ''} readOnly autoComplete="username" /></label>
        <label className="mechanic-field full-width"><span>Email</span><input type="email" value={profile.email} readOnly /></label>
        <label className="mechanic-field full-width"><span>Phone number</span><input required type="tel" inputMode="numeric" maxLength={11} autoComplete="tel" value={profile.phoneNumber || ''} aria-invalid={Boolean(phoneNumberError)} onChange={(event) => { const phoneNumber = cleanAndValidateMobileNumber(event.target.value).digits.slice(0, 11); setField('phoneNumber', phoneNumber); setPhoneNumberError(cleanAndValidateMobileNumber(phoneNumber).isValid ? '' : MOBILE_NUMBER_ERROR); }} onPaste={(event) => { event.preventDefault(); const phoneNumber = cleanAndValidateMobileNumber(event.clipboardData.getData('text')).digits.slice(0, 11); setField('phoneNumber', phoneNumber); setPhoneNumberError(cleanAndValidateMobileNumber(phoneNumber).isValid ? '' : MOBILE_NUMBER_ERROR); }} />{phoneNumberError && <small className="mechanic-alert" role="alert">{phoneNumberError}</small>}</label>
        <label className="mechanic-field"><span>Specialization</span><select value={profile.specialization} onChange={(event) => setField('specialization', event.target.value)}><option value="general">General</option><option value="engine">Engine</option><option value="transmission">Transmission</option><option value="electrical">Electrical</option><option value="suspension">Suspension</option><option value="brakes">Brakes</option></select></label>
        <label className="mechanic-field"><span>Years of experience</span><input min="0" required type="number" value={profile.yearsOfExperience} onChange={(event) => setField('yearsOfExperience', event.target.value)} /></label>
        <label className="mechanic-field full-width"><span>Availability</span><select value={profile.availabilityStatus} onChange={(event) => setField('availabilityStatus', event.target.value)}><option value="available">Available</option><option value="busy">Busy</option><option value="on-leave">On leave</option></select></label>
        <label className="mechanic-field full-width"><span>Certifications</span><input value={Array.isArray(profile.certifications) ? profile.certifications.join(', ') : profile.certifications} onChange={(event) => setField('certifications', event.target.value)} placeholder="Separate certifications with commas" /></label>
        <label className="mechanic-field full-width"><span>Biography</span><textarea rows="5" value={profile.bio || ''} onChange={(event) => setField('bio', event.target.value)} /></label>
      </div>
      <button className="button-primary profile-save" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button>
      </form>
    </>}
  </>;
}