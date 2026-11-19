import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import PasswordInput from '../../components/PasswordInput';
import { api } from '../../services/api';

export default function CustomerPasswordRecovery({ returnTo, onComplete }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const codeInput = useRef(null);
  const location = useLocation();

  async function sendCode() {
    setBusy(true);
    setError('');
    try {
      const result = await api.requestCustomerReset(email.trim());
      setSent(true);
      setCooldown(60);
      setMessage(result.message);
      requestAnimationFrame(() => codeInput.current?.focus());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!sent) return sendCode();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await api.resetCustomerPassword({ email: email.trim(), code: fields.get('code'),
        newPassword: fields.get('newPassword'), confirmPassword: fields.get('confirmPassword') });
      onComplete(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="customer-auth-heading"><h2>Reset your password</h2>
      <p>{sent ? 'Enter the code and choose a new password.' : 'Enter your registered customer email.'}</p>
    </div>
    {message && <p role="status">{message}</p>}
    <form className="customer-auth-form" onSubmit={submit}>
      {error && <p role="alert" className="customer-error">{error}</p>}
      <label>Email<input autoFocus type="email" required autoComplete="email" readOnly={sent} value={email} onChange={e => setEmail(e.target.value)} /></label>
      {sent && <>
        <label>Reset code<input ref={codeInput} name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} /></label>
        <label>New password<PasswordInput required name="newPassword" minLength={8} autoComplete="new-password" aria-describedby="reset-password-policy" /></label>
        <small id="reset-password-policy">Use at least 8 characters, including a letter and a number.</small>
        <label>Confirm new password<PasswordInput required name="confirmPassword" minLength={8} autoComplete="new-password" /></label>
      </>}
      <button disabled={busy} type="submit">{sent ? 'Reset password' : 'Send reset code'}</button>
    </form>
    <div className="customer-login-otp-actions">
      {sent && <button type="button" disabled={busy || cooldown > 0} onClick={sendCode}>
        {cooldown ? `Resend code in ${cooldown}s` : 'Resend code'}
      </button>}
      <Link to={returnTo} state={location.state}>Back to Sign In</Link>
    </div>
  </>;
}
