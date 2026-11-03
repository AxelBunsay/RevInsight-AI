import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { loginMechanic } from './mechanicService';
import { getMechanicLoginDestination } from './mechanicLoginHelpers';
import {
  buildLoginPayload,
  DEFAULT_REMEMBER_ME,
  getRememberedIdentifier,
  storeAuthSession
} from '../auth/authSession';
import useDocumentTitle from '../utils/useDocumentTitle';
import PasswordInput from '../components/PasswordInput';
import AuthBackdrop from '../components/AuthBackdrop';
import './mechanic-login-background.css';

export default function MechanicLogin() {
  useDocumentTitle("Mechanic sign in | Manoy's");
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState(() => getRememberedIdentifier('mechanic'));
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(DEFAULT_REMEMBER_ME);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const response = await loginMechanic(buildLoginPayload('username', username, password, rememberMe));
      storeAuthSession('mechanic', {
        token: response.token,
        user: response.mechanic,
        rememberMe,
        identifier: username
      });
      const from = location.state?.from;
      const fromPath = from ? `${from.pathname}${from.search || ''}${from.hash || ''}` : null;
      const returnTo = searchParams.get('returnTo');
      navigate(getMechanicLoginDestination(fromPath, returnTo), { replace: true });
    } catch (loginError) {
      setError(loginError.message || 'Invalid username or password');
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="mechanic-login-page">
    <AuthBackdrop variant="tools" baseColor="#12131C" glowColor="108, 92, 231" />
    <section className="mechanic-login-wrap">
    <div className="mechanic-login-intro"><img className="mechanic-login-logo" src="/logo-mechanic.png" alt="Manoy's mechanic portal" /><span className="mechanic-eyebrow">MECHANIC PORTAL</span><h1>Mechanic Login</h1><p>Sign in to manage assigned service jobs.</p></div>
    <form className="mechanic-login-card" onSubmit={submit}>
      <label className="mechanic-field"><span>Username</span><input autoComplete="username" autoCapitalize="none" spellCheck="false" type="text" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
      <label className="mechanic-field"><span>Password</span><PasswordInput className="mechanic-login-password-row" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      <label className="mechanic-login-remember"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span>Remember me</span></label>
      {error && <p className="mechanic-alert" role="alert">{error}</p>}
      <button className="button-primary mechanic-login-submit" type="submit" disabled={submitting}>{submitting && <span className="mechanic-login-spinner" aria-hidden="true" />}{submitting ? 'Signing in…' : 'Sign in'}</button>
    </form>
    </section>
  </main>;
}