import { useEffect, useReducer, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import useDashboardData from '../hooks/useDashboardData';
import AdminSidebar from '../components/layout/AdminSidebar';
import AdminNotifications from '../components/layout/AdminNotifications';
import RouteContentTransition from '../../components/RouteContentTransition';
import {
  ADMIN_DRAWER_MEDIA_QUERY,
  adminDrawerReducer,
  lockDocumentScroll
} from '../components/layout/adminLayoutBreakpoints';
import '../styles/admin.css';
import '../styles/layout.css';
import '../styles/dashboard.css';
import '../styles/management.css';

function AdminLayout() {
  const { pathname } = useLocation();
  const isDashboardRoute = pathname === '/admin' || pathname === '/admin/dashboard';
  const [isDrawerLayout, setIsDrawerLayout] = useState(() => window.matchMedia(ADMIN_DRAWER_MEDIA_QUERY).matches);
  const [drawerState, dispatchDrawer] = useReducer(adminDrawerReducer, { open: false, pathname: null });
  const drawerOpen = drawerState.open && drawerState.pathname === pathname;
  const hamburgerRef = useRef(null);
  const drawerRef = useRef(null);
  const dashboardDate = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date());
  const dashboard = useDashboardData();

  useEffect(() => {
    const responsiveQuery = window.matchMedia(ADMIN_DRAWER_MEDIA_QUERY);
    const syncLayout = (event) => {
      setIsDrawerLayout(event.matches);
      if (!event.matches) dispatchDrawer({ type: 'close' });
    };

    responsiveQuery.addEventListener('change', syncLayout);
    return () => responsiveQuery.removeEventListener('change', syncLayout);
  }, []);

  useEffect(() => {
    if (!drawerOpen || !isDrawerLayout) return undefined;
    const hamburger = hamburgerRef.current;
    const restoreScroll = lockDocumentScroll(document);
    drawerRef.current?.querySelector('.sidebar-nav a')?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        dispatchDrawer({ type: 'escape' });
      }
    };
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      restoreScroll();
      if (window.matchMedia(ADMIN_DRAWER_MEDIA_QUERY).matches) hamburger?.focus();
    };
  }, [drawerOpen, isDrawerLayout]);

  const closeDrawer = (reason = 'close') => {
    dispatchDrawer({ type: reason, pathname });
  };

  return (
    <div className={`admin-root${isDrawerLayout ? ' admin-root--drawer-layout' : ''}`}>
      <div className="admin-shell">
        <AdminSidebar
          badges={dashboard.data?.badges}
          loading={dashboard.loading}
          isDrawerLayout={isDrawerLayout}
          drawerOpen={drawerOpen}
          drawerRef={drawerRef}
          onClose={closeDrawer}
        />
        <main className="admin-main" id="admin-main">
          <header className={`admin-topbar${isDashboardRoute && !isDrawerLayout ? ' admin-topbar--dashboard' : ''}${isDrawerLayout ? ' admin-topbar--drawer-layout' : ''}`}>
            {isDrawerLayout ? (
              <>
                <div className="admin-mobile-topbar-leading">
                  <button
                    ref={hamburgerRef}
                    type="button"
                    className="admin-mobile-menu-button"
                    aria-label={drawerOpen ? 'Close admin navigation' : 'Open admin navigation'}
                    aria-expanded={drawerOpen}
                    aria-controls="admin-sidebar-navigation"
                    onClick={() => dispatchDrawer({ type: drawerOpen ? 'close' : 'open', pathname })}
                  >
                    <span aria-hidden="true">☰</span>
                  </button>
                  <span className="admin-mobile-brand">
                    <img src="/logo-admin.png" alt="RevInsight AI admin" width="32" height="32" />
                    <span>RevInsight AI</span>
                  </span>
                </div>
                <AdminNotifications />
              </>
            ) : isDashboardRoute ? (
              <div className="admin-page-heading admin-topbar-heading">
                <h1>Dashboard</h1>
                <p>{dashboardDate}</p>
              </div>
            ) : null}
            {!isDrawerLayout && <div className="admin-topbar-actions">
              <span className="admin-topbar-label">Administration</span>
              <AdminNotifications />
            </div>}
          </header>
          <RouteContentTransition>
            {isDrawerLayout && isDashboardRoute && (
              <header className="admin-page-heading admin-mobile-page-heading">
                <h1>Dashboard</h1>
                <p>{dashboardDate}</p>
              </header>
            )}
            <Outlet context={dashboard} />
          </RouteContentTransition>
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
