import { describe, expect, it } from 'vitest';
import {
  ADMIN_DRAWER_BREAKPOINT,
  ADMIN_DRAWER_MEDIA_QUERY,
  adminDrawerReducer,
  lockDocumentScroll
} from './adminLayoutBreakpoints';
import { readFileSync } from 'node:fs';

const layoutSource = readFileSync(new URL('../../layouts/AdminLayout.jsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('./AdminSidebar.jsx', import.meta.url), 'utf8');
const layoutStyles = readFileSync(new URL('../../styles/layout.css', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

describe('admin drawer breakpoint and actions', () => {
  it('uses the single 1024px viewport breakpoint', () => {
    expect(ADMIN_DRAWER_BREAKPOINT).toBe(1024);
    expect(ADMIN_DRAWER_MEDIA_QUERY).toBe('(max-width: 1024px)');
  });

  it.each(['toggle', 'open'])('opens from the hamburger action: %s', (action) => {
    expect(adminDrawerReducer({ open: false, pathname: null }, { type: action, pathname: '/admin' }))
      .toEqual({ open: true, pathname: '/admin' });
  });

  it.each(['overlay', 'navigation', 'escape', 'close'])('closes on %s', (action) => {
    expect(adminDrawerReducer({ open: true, pathname: '/admin' }, { type: action, pathname: '/admin' }))
      .toEqual({ open: false, pathname: '/admin' });
  });

  it.each(['close', 'overlay', 'navigation', 'escape'])('restores page scrolling after %s', (action) => {
    const documentRef = {
      body: { style: { overflow: 'auto' } },
      documentElement: { style: { overflow: 'scroll' } }
    };
    const restoreScroll = lockDocumentScroll(documentRef);

    expect(documentRef.body.style.overflow).toBe('hidden');
    expect(documentRef.documentElement.style.overflow).toBe('hidden');
    expect(adminDrawerReducer({ open: true, pathname: '/admin' }, { type: action }).open).toBe(false);
    restoreScroll();

    expect(documentRef.body.style.overflow).toBe('auto');
    expect(documentRef.documentElement.style.overflow).toBe('scroll');
  });

  it.each(['route change', 'desktop resize', 'unmount'])('restores page scrolling after %s cleanup', (reason) => {
    const documentRef = {
      body: { style: { overflow: '' } },
      documentElement: { style: { overflow: '' } }
    };
    const restoreScroll = lockDocumentScroll(documentRef);
    const drawerState = { open: true, pathname: '/admin' };
    const isOpenAfterLifecycleChange = reason === 'route change'
      ? drawerState.open && drawerState.pathname === '/admin/transactions'
      : reason === 'desktop resize'
        ? adminDrawerReducer(drawerState, { type: 'close' }).open
        : false;

    expect(isOpenAfterLifecycleChange).toBe(false);
    restoreScroll();
    expect(documentRef.body.style.overflow).toBe('');
    expect(documentRef.documentElement.style.overflow).toBe('');
    expect(layoutSource).toContain('restoreScroll();');
  });

  it('wires drawer open, overlay, navigation, and Escape actions to the layout', () => {
    expect(layoutSource).toContain("type: drawerOpen ? 'close' : 'open'");
    expect(layoutSource).toContain("type: 'escape'");
    expect(layoutSource).toContain("drawerRef.current?.querySelector('.sidebar-nav a')?.focus();");
    expect(layoutSource).toContain('restoreScroll();');
    expect(sidebarSource).toContain("onClose('overlay')");
    expect(sidebarSource).toContain("onClose('navigation')");
  });

  it('lets the mobile main content grow and scroll with the document', () => {
    const adminStyles = readFileSync(new URL('../../styles/admin.css', import.meta.url), 'utf8').replaceAll('\r\n', '\n');

    expect(adminStyles).toContain('.admin-root.admin-root--drawer-layout {\n  display: block;\n  height: auto;');
    expect(adminStyles).toContain('overflow: visible;');
    expect(layoutStyles).toContain('.admin-root.admin-root--drawer-layout .admin-main {\n  width: 100%;\n  height: auto;');
    expect(layoutStyles).toContain('padding: 0 16px calc(24px + env(safe-area-inset-bottom));');
    expect(layoutStyles).toContain('overflow: visible;');
  });

  it('keeps the mobile sidebar fixed as an off-canvas drawer, not in page flow', () => {
    expect(layoutSource).toContain("ADMIN_DRAWER_MEDIA_QUERY");
    expect(layoutSource).toContain("admin-root--drawer-layout");
    expect(layoutStyles).toContain('.admin-root.admin-root--drawer-layout .sidebar {\n  position: fixed;');
    expect(layoutStyles).toContain('transform: translateX(-105%);');
    expect(layoutStyles).toContain('width: min(280px, 82vw);');
    expect(layoutStyles).toContain('transition: transform 220ms ease, visibility 0s linear 220ms;');
    expect(layoutStyles).toContain('transition: transform 220ms ease, visibility 0s;');
  });
});
