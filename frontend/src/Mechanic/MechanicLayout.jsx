import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getMechanicNotifications, logoutMechanic, markMechanicNotificationsRead } from './mechanicService';
import { getAuthUser } from '../auth/authSession';
import NotificationContent from '../components/NotificationContent';
import RouteContentTransition from '../components/RouteContentTransition';
import useDocumentTitle from '../utils/useDocumentTitle';
import './mechanic-ui.css';
import './mechanic-notifications.css';

const links = [
  { to: '/mechanic/dashboard', label: 'Dashboard', icon: '▥' },
  { to: '/mechanic/jobs', label: 'Jobs', icon: '🔨' },
  { to: '/mechanic/profile', label: 'Profile', icon: '●' }
];

export default function MechanicLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTitle = location.pathname === '/mechanic/jobs'
    ? 'Mechanic Jobs'
    : location.pathname === '/mechanic/profile'
      ? 'Mechanic Profile'
      : 'Mechanic Dashboard';
  const pageName = currentTitle === 'Mechanic Jobs'
    ? 'Jobs'
    : currentTitle === 'Mechanic Dashboard'
      ? 'Dashboard'
      : currentTitle === 'Mechanic Profile'
        ? 'Profile'
        : currentTitle;
  useDocumentTitle(`${pageName} | Mechanic | Manoy's`);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [profile, setProfile] = useState({});

  useEffect(() => {
    let active = true;
    getMechanicNotifications().then((items) => {
      if (active) {
        setNotifications(items);
        setProfile(getAuthUser('mechanic') || {});
      }
    });
    return () => { active = false; };
  }, [location.pathname]);

  const unreadCount = notifications.filter((item) => !item.read).length;
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Mechanic';
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());

  return (
    <div className="mechanic-shell">
      <aside className="mechanic-sidebar">
        <Link className="mechanic-brand" to="/mechanic/dashboard" aria-label="Mechanic dashboard"><img src="/logo-mechanic.png" alt="Manoy's mechanic portal" width="40" height="40" /></Link>
        <nav className="mechanic-navigation" aria-label="Mechanic navigation">
          {links.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `mechanic-nav-link${isActive ? ' active' : ''}`}><span className="mechanic-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span></NavLink>)}
        </nav>
        <button className="mechanic-logout" type="button" onClick={() => setShowLogout(true)}><span aria-hidden="true">⇥</span><span>Logout</span></button>
      </aside>

      <div className="mechanic-workspace">
        <header className="mechanic-header">
          <div className="mechanic-heading"><img className="mechanic-header-logo" src="/logo-mechanic.png" alt="Manoy's mechanic portal" width="40" height="40" /><div><span className="mechanic-eyebrow">Mechanic portal</span><h1>{currentTitle}</h1></div></div>
          <div className="mechanic-header-tools">
            <time>{date}</time>
            <div className="mechanic-notification-wrap">
              <button className="mechanic-icon-button" type="button" aria-label={`Notifications, ${unreadCount} unread`} aria-expanded={showNotifications} onClick={() => setShowNotifications((value) => !value)}>
                <span aria-hidden="true">🔔</span>{unreadCount > 0 && <span className="mechanic-notification-count">{unreadCount}</span>}
              </button>
              {showNotifications && <section className="mechanic-notification-popover" aria-label="Notifications">
                <header className="mechanic-notification-popover-header">
                  <strong>Notifications</strong>
                  <div className="mechanic-notification-actions">
                    {!!unreadCount && <button type="button" onClick={async () => setNotifications(await markMechanicNotificationsRead())}>Mark all as read</button>}
                    {!!notifications.length && <button type="button" onClick={() => setNotifications([])}>Clear all</button>}
                  </div>
                </header>
                <div className="mechanic-notification-list">{notifications.length ? notifications.map((item) => <article className={`mechanic-notification${item.read ? '' : ' unread'}`} key={item.id}><NotificationContent message={item.text} timestamp={item.time} /></article>) : <p className="mechanic-notification-empty">No notifications yet.</p>}</div>
              </section>}
            </div>
            <Link className="mechanic-user-link" to="/mechanic/profile" aria-label={`Profile: ${name}`}><span>{name.charAt(0).toUpperCase()}</span></Link>
          </div>
        </header>
        <main className="mechanic-main">
          <RouteContentTransition pathname={location.pathname}>
            <Outlet />
          </RouteContentTransition>
        </main>
      </div>

      {showLogout && <div className="mechanic-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowLogout(false); }}>
        <section className="mechanic-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title"><h2 id="logout-title">Log out?</h2><p>You will need to sign in again.</p><div className="mechanic-dialog-actions"><button className="button-secondary" type="button" onClick={() => setShowLogout(false)}>Cancel</button><button className="button-primary" type="button" onClick={() => { logoutMechanic(); navigate('/mechanic/login', { replace: true }); }}>Log out</button></div></section>
      </div>}
    </div>
  );
}