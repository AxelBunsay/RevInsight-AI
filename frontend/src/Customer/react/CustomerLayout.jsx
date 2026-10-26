import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { api } from '../../services/api';
import { useCustomerPrototype } from './useCustomerPrototype';
import '../styles/shared.css';
import '../styles/customer-flow.css';

export function CustomerAuthGuard({ children }) {
  const location = useLocation();
  const customerToken = localStorage.getItem('customerToken');
  const hasCustomerAccount = Boolean(customerToken && customerToken !== 'prototype-guest');

  return hasCustomerAccount ? children : <Navigate to="/customer/login" replace state={{ from: location }} />;
}

export function CustomerHeader() {
  const location = useLocation();
  const { cart, clearCustomerData } = useCustomerPrototype();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const customerToken = localStorage.getItem('customerToken');
  const hasCustomerAccount = Boolean(customerToken && customerToken !== 'prototype-guest');
  const cartCount = cart.reduce((total, item) => total + Number(item.quantity || 1), 0);

  useEffect(() => {
    if (!hasCustomerAccount) return undefined;
    let active = true;
    const loadNotifications = async () => {
      try {
        const response = await api.getCustomerNotifications();
        if (!active) return;
        setNotifications(response.notifications || []);
        setUnreadNotificationCount(Number(response.unreadCount || 0));
        setNotificationError('');
      } catch (error) {
        if (active) setNotificationError(error.message || 'Notifications could not be loaded.');
      }
    };
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [hasCustomerAccount]);

  const openCustomerNotification = async (notification) => {
    try {
      if (!notification.read) {
        await api.markCustomerNotificationRead(notification._id);
        setNotifications((current) => current.map((item) => item._id === notification._id ? { ...item, read: true } : item));
        setUnreadNotificationCount((count) => Math.max(0, count - 1));
      }
      setIsNotificationsOpen(false);
      setIsMenuOpen(false);
    } catch (error) {
      setNotificationError(error.message || 'Notification could not be opened.');
    }
  };

  const logout = () => {
    localStorage.removeItem('customerToken');
    clearCustomerData();
    window.location.href = '/customer/login';
  };

  const currentPath = location.pathname;
  const isShopPage = currentPath === '/customer/shop'
    || currentPath === '/'
    || currentPath.startsWith('/customer/products/');
  const isServicesPage = currentPath.startsWith('/customer/services');
  const isAccountPage = currentPath.startsWith('/customer/profile')
    || currentPath.startsWith('/customer/cart')
    || currentPath.startsWith('/customer/purchases')
    || currentPath.startsWith('/customer/orders')
    || currentPath.startsWith('/customer/reservations')
    || currentPath.startsWith('/customer/checkout')
    || currentPath.startsWith('/customer/order-confirmation');

  return <header className="customer-header">
    <Link className="customer-brand" to="/customer/shop"><span className="customer-brand__mark" aria-hidden="true">🔧</span><span className="customer-brand__copy"><strong>Manoy&apos;s Motorcycle</strong><small>Parts, Accessories &amp; Services</small></span></Link>
    <button type="button" className="customer-menu-toggle" aria-expanded={isMenuOpen} aria-controls="customer-navigation" aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setIsMenuOpen((open) => !open)}>
      <span /><span /><span />
    </button>
    <nav id="customer-navigation" aria-label="Customer navigation" className={`customer-nav${isMenuOpen ? ' is-open' : ''}`}>
      <Link onClick={() => setIsMenuOpen(false)} className={isShopPage ? 'active' : ''} aria-current={isShopPage ? 'page' : undefined} to="/customer/shop">Shop</Link>
      <Link onClick={() => setIsMenuOpen(false)} className={isServicesPage ? 'active' : ''} aria-current={isServicesPage ? 'page' : undefined} to="/customer/services">Services</Link>
      <Link onClick={() => setIsMenuOpen(false)} className={isAccountPage ? 'active' : ''} aria-current={isAccountPage ? 'page' : undefined} to="/customer/profile">Account</Link>
      {hasCustomerAccount && <Link onClick={() => setIsMenuOpen(false)} className="customer-header-cart" to="/customer/cart" aria-label={`Open Reservation Cart${cartCount ? `, ${cartCount} items` : ''}`} title="Reservation Cart">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L20 8H6" /><circle cx="10" cy="19" r="1.2" /><circle cx="17" cy="19" r="1.2" /></svg>
        {cartCount > 0 && <span className="customer-header-cart-count">{cartCount}</span>}
      </Link>}
      {hasCustomerAccount && <div className="customer-notification-area">
        <button type="button" className="customer-notification-bell" aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`} aria-expanded={isNotificationsOpen} onClick={() => setIsNotificationsOpen((open) => !open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
          {unreadNotificationCount > 0 && <span className="customer-notification-count">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}
        </button>
        {isNotificationsOpen && <section className="customer-notification-popover" aria-label="Notifications">
          <strong>Notifications</strong>
          {notificationError && <p role="alert">{notificationError}</p>}
          {notifications.length
            ? <ul>{notifications.map((notification) => <li key={notification._id} className={notification.read ? '' : 'is-unread'}>
              <Link to={`/customer/reservations/${notification.recordId}`} state={{ showPayment: notification.type === 'payment_rejected' }} onClick={() => openCustomerNotification(notification)}>
                {notification.message}<small>{new Date(notification.createdAt).toLocaleString('en-PH')}</small>
              </Link>
            </li>)}</ul>
            : !notificationError && <p>No notifications yet.</p>}
        </section>}
      </div>}
      {hasCustomerAccount
        ? <button type="button" className="customer-logout" onClick={logout}>Sign out</button>
        : <Link onClick={() => setIsMenuOpen(false)} className={currentPath.startsWith('/customer/login') || currentPath.startsWith('/customer/register') ? 'active' : ''} aria-current={currentPath.startsWith('/customer/login') || currentPath.startsWith('/customer/register') ? 'page' : undefined} to="/customer/login">Sign in</Link>}
    </nav>
  </header>;
}

function CustomerFooter() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    api.getShopSettings()
      .then((response) => {
        if (isMounted) setSettings(response.settings || {});
      })
      .catch((requestError) => {
        if (isMounted) setError(requestError.message || 'Pickup details could not be loaded.');
      });
    return () => { isMounted = false; };
  }, []);

  return <footer className="customer-site-footer">
    <strong>Manoy&apos;s Motorcycle</strong>
    {error
      ? <p className="customer-site-footer-message">Pickup details are temporarily unavailable.</p>
      : <div className="customer-site-footer-details">
        {settings?.pickupAddress && <span>Pickup: {settings.pickupAddress}</span>}
        {settings?.pickupHours && <span>Hours: {settings.pickupHours}</span>}
        {settings?.contactNumber && <a href={`tel:${settings.contactNumber.replace(/[^\d+]/g, '')}`}>Contact: {settings.contactNumber}</a>}
        <span>Pickup only. No delivery.</span>
      </div>}
  </footer>;
}

export function CustomerPage({ title, description, children, includeHeader = true }) {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const resetScroll = () => window.scrollTo(0, 0);
    resetScroll();
    window.setTimeout(resetScroll, 0);
    window.setTimeout(resetScroll, 100);
  }, []);

  return (
    <main className={`customer-page ${title === 'Motorcycle Shop' ? 'shop-page' : ''} ${title === 'Motorcycle Services' ? 'services-page' : ''} ${title === 'My Purchases' || title === 'My Reservations' ? 'orders-page reservations-page' : ''} ${title === 'Profile' || title === 'Account' ? 'profile-page' : ''}`}>
      {includeHeader && <CustomerHeader />}
      <section className="customer-heading">
        <p className="customer-eyebrow">MOTORCYCLE PARTS, ACCESSORIES &amp; SERVICES</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>
      {children}
      <CustomerFooter />
    </main>
  );
}

export function CustomerAuthShell({ activeTab, children }) {
  return <main className="customer-auth-page">
    <section className="customer-auth-showcase">
      <Link className="customer-auth-brand" to="/customer/shop">
        <span className="customer-auth-logo" aria-hidden="true">🔧</span>
        <span><strong>Manoy&apos;s Motorcycle</strong><small>Parts, Accessories &amp; Services</small></span>
      </Link>
      <div className="customer-auth-copy">
        <p className="customer-auth-eyebrow">MANOY&apos;S MOTORCYCLE PARTS &amp; ACCESSORIES</p>
        <h1>Everything your ride needs.</h1>
        <p>Browse genuine motorcycle parts and accessories. Fast, reliable, and trusted by riders.</p>
        <ul>
          <li><span>▤</span><span><strong>Wide product selection</strong><small>Parts, accessories &amp; more</small></span></li>
          <li><span>▣</span><span><strong>Track purchases and bookings</strong><small>Item pickup and service booking progress</small></span></li>
          <li><span>⌁</span><span><strong>Trusted service</strong><small>Quality parts and expert mechanics</small></span></li>
        </ul>
      </div>
    </section>
    <section className="customer-auth-panel">
      <Link className="customer-auth-back" to="/customer/shop">← Back to shop</Link>
      <div className="customer-auth-content">
        <nav className="customer-auth-tabs" aria-label="Customer account">
          <Link className={activeTab === 'login' ? 'active' : ''} to="/customer/login">Sign In</Link>
          <Link className={activeTab === 'register' ? 'active' : ''} to="/customer/register">Register</Link>
        </nav>
        {children}
      </div>
    </section>
  </main>;
}
