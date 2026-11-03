import { useEffect, useReducer, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { api } from '../../services/api';
import { CUSTOMER_SHOP_MAPS_URL, hasCustomerFooterDetails } from './customerFooterSettings';
import { customerHeaderMenuReducer, isOutsideCustomerMenus } from './customerHeaderMenu';
import { getLegacyCustomerPurchaseLink } from './customerPurchases';
import { getCustomerAuthRedirect, hasCustomerSession } from './customerAuthAction';
import { useCustomerPrototype } from './useCustomerPrototype';
import NotificationDropdown from '../../components/NotificationDropdown';
import NotificationContent from '../../components/NotificationContent';
import AuthBackdrop from '../../components/AuthBackdrop';
import { clearNotificationList } from '../../utils/notificationActions';
import RouteContentTransition from '../../components/RouteContentTransition';
import useDocumentTitle from '../../utils/useDocumentTitle';
import { clearAuthSession, getAuthToken } from '../../auth/authSession';
import { clearCustomerAuthAction } from './customerAuthAction';
import '../styles/shared.css';
import '../styles/customer-flow.css';

function getCustomerDocumentTitle(title) {
  const titlesByHeading = {
    'Motorcycle Shop': "Shop | Manoy's Motorcycle",
    'Motorcycle Services': "Services | Manoy's Motorcycle",
    Home: "Home | Manoy's Motorcycle",
    Cart: "Cart | Manoy's Motorcycle",
    'My purchases': "My purchases | Manoy's Motorcycle",
    'My Purchases': "My purchases | Manoy's Motorcycle",
    'My Reservations': "My purchases | Manoy's Motorcycle",
    Account: "Account | Manoy's Motorcycle",
    Profile: "Account | Manoy's Motorcycle"
  };
  return titlesByHeading[title] || `${title} | Manoy's Motorcycle`;
}

export function CustomerAccountMenu({ isOpen, onSelect, onSignOut, canSignOut = false }) {
  return <div
    className={`customer-account-menu-collapse${isOpen ? ' is-open' : ''}`}
    id="customer-account-menu"
    aria-hidden={!isOpen}
    inert={!isOpen}
  >
    <div className="customer-account-menu-collapse-inner">
      <div className="customer-account-menu" role="menu" aria-label="Account options">
        {canSignOut && <>
          <Link role="menuitem" to="/customer/profile" onClick={onSelect}>My profile</Link>
          <Link role="menuitem" to="/my-purchases?tab=all" onClick={onSelect}>My purchases</Link>
          <div className="customer-account-menu-divider" role="separator" />
          <button type="button" className="customer-account-menu-signout" role="menuitem" onClick={() => { onSelect?.(); onSignOut?.(); }}>Sign out</button>
        </>}
      </div>
    </div>
  </div>;
}

export function CustomerAccountMenuTrigger({ isActive, isExpanded, onClick }) {
  return <button
    type="button"
    className={`customer-account-menu-trigger${isActive ? ' active' : ''}`}
    aria-haspopup="menu"
    aria-expanded={isExpanded}
    aria-controls="customer-account-menu"
    onClick={onClick}
  >
    Account
    <svg className="customer-account-menu-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg>
  </button>;
}

export function CustomerAuthGuard() {
  const location = useLocation();
  const redirect = getCustomerAuthRedirect(getAuthToken('customer'), location);

  return redirect ? <Navigate to={redirect} replace /> : <Outlet />;
}

export function CustomerPurchasesRedirect() {
  const location = useLocation();
  return <Navigate to={`/my-purchases${location.search || '?tab=all'}${location.hash}`} replace />;
}

export function CustomerHeader() {
  const location = useLocation();
  const { cart, clearCustomerData } = useCustomerPrototype();
  const [menuOpenPath, setMenuOpenPath] = useState(null);
  const isMenuOpen = menuOpenPath === location.pathname;
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [customerMenus, dispatchCustomerMenu] = useReducer(customerHeaderMenuReducer, {
    accountOpen: false,
    notificationsOpen: false
  });
  const menuRef = useRef(null);
  const menuToggleRef = useRef(null);
  const headerRef = useRef(null);
  const notificationPanelRef = useRef(null);
  const accountAreaRef = useRef(null);
  const notificationAreaRef = useRef(null);
  const [notificationError, setNotificationError] = useState('');
  const [isClearingNotifications, setIsClearingNotifications] = useState(false);
  const customerToken = getAuthToken('customer');
  const hasCustomerAccount = hasCustomerSession(customerToken);
  const cartCount = cart.reduce((total, item) => total + Number(item.quantity || 1), 0);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      const outsideNavigation = !menuRef.current?.contains(event.target)
        && !menuToggleRef.current?.contains(event.target);
      if (outsideNavigation) setMenuOpenPath(null);
      if (isOutsideCustomerMenus(event.target, accountAreaRef.current, notificationAreaRef.current)) {
        dispatchCustomerMenu({ type: 'close' });
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpenPath(null);
        dispatchCustomerMenu({ type: 'close' });
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    const pathname = location.pathname;
    const frame = window.requestAnimationFrame(() => {
      setMenuOpenPath((currentPath) => currentPath === pathname ? currentPath : null);
      dispatchCustomerMenu({ type: 'close' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  useEffect(() => {
    const header = headerRef.current;
    const panel = notificationPanelRef.current;
    if (!header || !panel) return undefined;

    const updateHeaderHeight = () => {
      panel.style.setProperty('--customer-header-height', `${header.getBoundingClientRect().height}px`);
    };
    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

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
      dispatchCustomerMenu({ type: 'close' });
      setMenuOpenPath(null);
    } catch (error) {
      setNotificationError(error.message || 'Notification could not be opened.');
    }
  };

  const clearCustomerNotifications = async () => {
    setIsClearingNotifications(true);
    await clearNotificationList({
      clearApi: api.clearCustomerNotifications,
      setNotifications,
      setUnreadCount: setUnreadNotificationCount,
      setError: setNotificationError
    });
    setIsClearingNotifications(false);
  };

  const logout = () => {
    clearAuthSession('customer');
    clearCustomerAuthAction();
    clearCustomerData();
    window.location.href = '/';
  };

  const currentPath = location.pathname;
  const isHomePage = currentPath === '/';
  const isShopPage = currentPath === '/customer/shop'
    || currentPath.startsWith('/customer/products/');
  const isServicesPage = currentPath.startsWith('/customer/services');
  const isAccountPage = currentPath === '/customer/profile' || currentPath.startsWith('/my-purchases');
  const closeNavigation = () => {
    setMenuOpenPath(null);
    dispatchCustomerMenu({ type: 'close' });
  };

  return <header ref={headerRef} className="customer-header">
    <Link className="customer-brand" to={hasCustomerAccount ? '/customer/shop' : '/'} aria-label="Manoy's Motorcycle Parts, Accessories & Services"><img className="customer-brand__mark" src="/logo.svg" alt="Manoy's Motorcycle logo" width="40" height="40" decoding="async" /><span className="customer-brand__copy"><strong>MANOY&apos;S</strong><small>MOTORCYCLE PARTS, ACCESSORIES &amp; SERVICES</small></span></Link>
    <div className="customer-header-actions">
      <Link className="customer-header-icon-button customer-header-cart" to="/customer/cart" aria-label={`Open Reservation Cart${cartCount ? `, ${cartCount} items` : ''}`} title="Reservation Cart">
        <svg viewBox="0 0 24 24" aria-hidden="true"><g transform="translate(0.5 -0.1)"><path d="M3 4h2l2.2 10.1a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L20 8H6" /><circle cx="10" cy="19" r="1.2" /><circle cx="17" cy="19" r="1.2" /></g></svg>
        {cartCount > 0 && <span className="customer-header-cart-count">{cartCount}</span>}
      </Link>
      <div className="customer-notification-area" ref={notificationAreaRef}>
        <button type="button" className="customer-header-icon-button customer-notification-bell" aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`} aria-expanded={customerMenus.notificationsOpen} onClick={() => { setMenuOpenPath(null); dispatchCustomerMenu({ type: 'toggle-notifications' }); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
          {unreadNotificationCount > 0 && <span className="customer-notification-count">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>}
        </button>
        <div
          ref={notificationPanelRef}
          className={`customer-notification-panel customer-notification-panel--viewport${customerMenus.notificationsOpen ? ' is-open' : ''}`}
          aria-hidden={!customerMenus.notificationsOpen}
          inert={!customerMenus.notificationsOpen}
        >
          {hasCustomerAccount ? <NotificationDropdown
            className="customer-notification-popover"
            notifications={notifications}
            error={notificationError}
            isClearing={isClearingNotifications}
            onClearAll={clearCustomerNotifications}
            renderNotification={(notification) => <li key={notification._id} className={notification.read ? '' : 'is-unread'}>
              <Link to={getLegacyCustomerPurchaseLink(notification.link) || `/customer/reservations/${notification.recordId}`} state={{ showPayment: notification.type === 'payment_rejected' }} onClick={() => openCustomerNotification(notification)}>
                <NotificationContent message={notification.message} timestamp={notification.createdAt} />
              </Link>
            </li>}
          /> : <div className="customer-notification-popover customer-notification-guest" role="status">Sign in to view notifications.</div>}
        </div>
      </div>
      <button ref={menuToggleRef} type="button" className="customer-header-icon-button customer-menu-toggle" aria-expanded={isMenuOpen} aria-controls="customer-navigation" aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => { dispatchCustomerMenu({ type: 'close' }); setMenuOpenPath(isMenuOpen ? null : location.pathname); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
    </div>
    <nav ref={menuRef} id="customer-navigation" aria-label="Customer navigation" className={`customer-nav${isMenuOpen ? ' is-open' : ''}`}>
      {!hasCustomerAccount && <Link onClick={closeNavigation} className={isHomePage ? 'active' : ''} aria-current={isHomePage ? 'page' : undefined} to="/">Home</Link>}
      <Link onClick={closeNavigation} className={isShopPage ? 'active' : ''} aria-current={isShopPage ? 'page' : undefined} to="/customer/shop">Shop</Link>
      <Link onClick={closeNavigation} className={isServicesPage ? 'active' : ''} aria-current={isServicesPage ? 'page' : undefined} to="/customer/services">Services</Link>
      {hasCustomerAccount && <div className="customer-account-menu-area" ref={accountAreaRef}>
        <CustomerAccountMenuTrigger
          isActive={isAccountPage}
          isExpanded={customerMenus.accountOpen}
          onClick={() => dispatchCustomerMenu({ type: 'toggle-account' })}
        />
        <CustomerAccountMenu
          isOpen={customerMenus.accountOpen}
          onSelect={closeNavigation}
          onSignOut={logout}
          canSignOut
        />
      </div>}
      {!hasCustomerAccount && <div className="customer-guest-links">
        <Link onClick={closeNavigation} className={currentPath.startsWith('/customer/login') ? 'active' : ''} aria-current={currentPath.startsWith('/customer/login') ? 'page' : undefined} to="/customer/login">Sign in</Link>
        <Link onClick={closeNavigation} className={currentPath.startsWith('/customer/register') ? 'active' : ''} aria-current={currentPath.startsWith('/customer/register') ? 'page' : undefined} to="/customer/register">Register</Link>
      </div>}
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

  const noPickupDetails = settings && !hasCustomerFooterDetails(settings);

  return <footer className="customer-site-footer">
    <strong>Manoy&apos;s Motorcycle</strong>
    {error || noPickupDetails
      ? <p className="customer-site-footer-message">Pickup details are temporarily unavailable.</p>
      : <div className="customer-site-footer-details">
        {settings?.pickupAddress && <span>Pickup: {settings.pickupAddress}</span>}
        <div className="customer-site-footer-meta">
          {settings?.pickupHours && <span>Hours: {settings.pickupHours}</span>}
          {settings?.contactNumber && <a href={`tel:${settings.contactNumber.replace(/[^\d+]/g, '')}`}>Contact: {settings.contactNumber}</a>}
        </div>
        <span>Pickup only. No delivery.</span>
      </div>}
    <a className="customer-site-footer-map-link" href={CUSTOMER_SHOP_MAPS_URL} target="_blank" rel="noopener noreferrer">Open in Maps</a>
  </footer>;
}

export function CustomerPage({ title, description, children, preserveScrollOnMount = false, actions = null }) {
  const location = useLocation();
  useDocumentTitle(getCustomerDocumentTitle(title));

  useEffect(() => {
    if (!preserveScrollOnMount) window.scrollTo(0, 0);
  }, [location.pathname, preserveScrollOnMount]);

  useEffect(() => {
    if (preserveScrollOnMount) return undefined;
    const resetScroll = () => window.scrollTo(0, 0);
    resetScroll();
    window.setTimeout(resetScroll, 0);
    window.setTimeout(resetScroll, 100);
    return undefined;
  }, [preserveScrollOnMount]);

  return <>
      <section className="customer-heading">
        {title !== 'Account' && <p className="customer-eyebrow">MOTORCYCLE PARTS, ACCESSORIES &amp; SERVICES</p>}
        {actions
          ? <div className="customer-heading-title-row"><h1>{title}</h1>{actions}</div>
          : <h1>{title}</h1>}
        <p>{description}</p>
      </section>
      {children}
  </>;
}

export function CustomerRouteLayout() {
  const { pathname } = useLocation();
  const routeClasses = [
    pathname === '/' ? 'home-page' : '',
    pathname === '/customer/shop' || pathname.startsWith('/customer/products/') ? 'shop-page' : '',
    pathname === '/customer/services' ? 'services-page' : '',
    pathname.startsWith('/my-purchases') ? 'orders-page reservations-page' : '',
    pathname === '/customer/profile' ? 'profile-page' : ''
  ].filter(Boolean).join(' ');

  return <main className={`customer-page ${routeClasses}`}>
    <div className="customer-layout-container">
      <CustomerHeader />
      <RouteContentTransition><Outlet /></RouteContentTransition>
      <CustomerFooter />
    </div>
  </main>;
}

export function CustomerAuthShell({ activeTab, children }) {
  useDocumentTitle(activeTab === 'register'
    ? "Register | Manoy's Motorcycle"
    : "Sign in | Manoy's Motorcycle");

  return <main className="customer-auth-page">
    <AuthBackdrop variant="streaks" />
    <div className="customer-auth-layout">
      <div className="customer-auth-brand-group">
        <Link className="customer-auth-brand" to="/" aria-label="Go to Manoy's Motorcycle home">
          <img className="customer-auth-logo" src="/logo.svg" alt="Manoy's Motorcycle logo" width="88" height="88" decoding="async" />
          <span>
            <strong>MANOY&apos;S</strong>
            <small>MOTORCYCLE PARTS,<br />ACCESSORIES &amp; SERVICES</small>
          </span>
        </Link>
        <p className="customer-auth-slogan">Learn it. Live it. Love it.</p>
      </div>
      <section className="customer-auth-content" aria-label="Customer account">
        <nav className={`customer-auth-tabs${activeTab === 'register' ? ' is-register' : ''}`} role="tablist" aria-label="Customer account">
          <span className="customer-auth-tab-indicator" aria-hidden="true" />
          <Link className={activeTab === 'login' ? 'active' : ''} role="tab" aria-selected={activeTab === 'login'} to="/customer/login">Sign In</Link>
          <Link className={activeTab === 'register' ? 'active' : ''} role="tab" aria-selected={activeTab === 'register'} to="/customer/register">Register</Link>
        </nav>
        <div className="customer-auth-form-content"><RouteContentTransition>{children}</RouteContentTransition></div>
      </section>
    </div>
  </main>;
}

export function CustomerAuthLayout() {
  const { pathname } = useLocation();
  const activeTab = pathname === '/customer/register' ? 'register' : 'login';

  return <CustomerAuthShell activeTab={activeTab}><Outlet /></CustomerAuthShell>;
}
