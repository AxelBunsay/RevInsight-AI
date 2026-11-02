import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import useAuth from '../../context/useAuth';
import AuthBackdrop from '../../components/AuthBackdrop';
import PasswordInput from '../../components/PasswordInput';
import '../styles/admin.css';

function BrandWordmark() {
  return (
    <div className="admin-login__wordmark" aria-label="REVINSIGHT AI">
      <img src="/logo-admin.png" alt="RevInsight AI admin" width="64" height="64" />
      <span>REVINSIGHT</span>
      <span className="admin-login__wordmark-ai">AI</span>
    </div>
  );
}

function AdminLogin() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('Admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) return <Navigate to="/admin" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await login({ username, password });
      const destination = location.state?.from?.pathname || '/admin';
      navigate(destination, { replace: true });
    } catch (loginError) {
      setError(loginError.message || 'Login failed. Check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="admin-root admin-login">
      <AuthBackdrop variant="cogs" />
      <div className="admin-login__layout">
        <header className="admin-login__brand-header">
          <BrandWordmark />
        </header>
        <section className="admin-login__card" aria-label="Admin sign in">
          <div className="admin-login__card-content">
            <form onSubmit={handleSubmit}>
              <div className="admin-login__field">
                <label htmlFor="admin-username">Username</label>
                <input id="admin-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter your username" autoComplete="username" required />
              </div>
              <div className="admin-login__field">
                <label htmlFor="admin-password">Password</label>
                <PasswordInput
                    className="admin-login__password-wrap"
                    id="admin-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
              </div>
              {error && (
                <p className="admin-login__error" role="alert">
                  <span aria-hidden="true">!</span>
                  {error}
                </p>
              )}
              <button className="admin-login__submit" type="submit" disabled={isSubmitting}>
                {isSubmitting && <span className="admin-login__spinner" aria-hidden="true" />}
                {isSubmitting ? 'Signing in' : 'Login'}
              </button>
            </form>
            <footer className="admin-login__footer">Authorized staff only.</footer>
          </div>
        </section>
      </div>
    </main>
  );
}

export default AdminLogin;
