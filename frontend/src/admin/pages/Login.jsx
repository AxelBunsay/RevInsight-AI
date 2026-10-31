import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import useAuth from '../../context/useAuth';
import '../styles/admin.css';

const GAUGE_CENTER_X = 210;
const GAUGE_CENTER_Y = 194;
const GAUGE_RADIUS = 145;

function gaugePoint(percent, radius = GAUGE_RADIUS) {
  const angle = Math.PI * (1 - percent / 100);
  return {
    x: GAUGE_CENTER_X + radius * Math.cos(angle),
    y: GAUGE_CENTER_Y - radius * Math.sin(angle)
  };
}

function gaugeArc(startPercent, endPercent) {
  const start = gaugePoint(startPercent);
  const end = gaugePoint(endPercent);
  return `M ${start.x} ${start.y} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 0 ${end.x} ${end.y}`;
}

function RevenueGauge() {
  const ticks = Array.from({ length: 21 }, (_, index) => {
    const percent = index * 5;
    const outer = gaugePoint(percent, 132);
    const inner = gaugePoint(percent, index % 2 === 0 ? 116 : 122);
    return { percent, outer, inner };
  });
  const start = gaugePoint(0);
  const end = gaugePoint(100);
  const forty = gaugePoint(40, 166);
  const sixty = gaugePoint(60, 166);

  return (
    <svg
      className="admin-login__gauge"
      viewBox="0 0 420 310"
      role="img"
      aria-label="Sample revenue gauge: top category carries 34 percent, in the Normal range"
    >
      <path className="admin-login__gauge-zone admin-login__gauge-zone--normal" d={gaugeArc(0, 40)} />
      <path className="admin-login__gauge-zone admin-login__gauge-zone--moderate" d={gaugeArc(40, 60)} />
      <path className="admin-login__gauge-zone admin-login__gauge-zone--high" d={gaugeArc(60, 100)} />
      {ticks.map(({ percent, outer, inner }) => (
        <line
          key={percent}
          className="admin-login__gauge-tick"
          x1={outer.x}
          y1={outer.y}
          x2={inner.x}
          y2={inner.y}
        />
      ))}
      <text className="admin-login__gauge-label" x={start.x - 2} y={start.y + 26} textAnchor="middle">0%</text>
      <text className="admin-login__gauge-label" x={forty.x} y={forty.y} textAnchor="middle">40%</text>
      <text className="admin-login__gauge-label" x={sixty.x} y={sixty.y} textAnchor="middle">60%</text>
      <text className="admin-login__gauge-label" x={end.x + 2} y={end.y + 26} textAnchor="middle">100%</text>
      <g className="admin-login__gauge-needle">
        <line
          x1={GAUGE_CENTER_X}
          y1={GAUGE_CENTER_Y}
          x2={GAUGE_CENTER_X - 116}
          y2={GAUGE_CENTER_Y}
        />
      </g>
      <circle className="admin-login__gauge-hub" cx={GAUGE_CENTER_X} cy={GAUGE_CENTER_Y} r="10" />
      <circle className="admin-login__gauge-hub-center" cx={GAUGE_CENTER_X} cy={GAUGE_CENTER_Y} r="4" />
    </svg>
  );
}

function BrandWordmark({ compact = false }) {
  return (
    <div className={`admin-login__wordmark${compact ? ' admin-login__wordmark--compact' : ''}`} aria-label="REVINSIGHT AI">
      <img src="/logo-admin.png" alt="RevInsight AI admin" width="44" height="44" />
      <span>REVINSIGHT</span>
      <span className="admin-login__ai-badge">AI</span>
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
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

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
      <section className="admin-login__brand-panel" aria-label="Revenue insight sample">
        <header className="admin-login__brand-header">
          <BrandWordmark />
          <p className="admin-login__shop-name">Manoy&apos;s Motorcycle Parts, Accessories and Services</p>
        </header>
        <div className="admin-login__brand-content">
          <h1>See which revenue is <span>carrying</span> the shop.</h1>
          <div className="admin-login__sample">
            <RevenueGauge />
          </div>
        </div>
      </section>

      <section className="admin-login__form-panel" aria-label="Admin sign in">
        <div className="admin-login__mobile-brand">
          <BrandWordmark compact />
        </div>
        <div className="admin-login__card-area">
          <div className="admin-login__card">
            <p className="admin-login__eyebrow">ADMIN ACCESS</p>
            <h2>Welcome back</h2>
            <p className="admin-login__intro">Sign in to review this quarter&apos;s revenue and inventory.</p>
            <form onSubmit={handleSubmit}>
              <div className="admin-login__field">
                <label htmlFor="admin-username">Username</label>
                <input id="admin-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter your username" autoComplete="username" required />
              </div>
              <div className="admin-login__field">
                <label htmlFor="admin-password">Password</label>
                <div className="admin-login__password-wrap">
                  <input
                    id="admin-password"
                    type={isPasswordVisible ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    className="admin-login__password-toggle"
                    type="button"
                    aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                    aria-pressed={isPasswordVisible}
                    onClick={() => setIsPasswordVisible((visible) => !visible)}
                  >
                    {isPasswordVisible ? 'Hide' : 'Show'}
                  </button>
                </div>
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
        </div>
      </section>
    </main>
  );
}

export default AdminLogin;
