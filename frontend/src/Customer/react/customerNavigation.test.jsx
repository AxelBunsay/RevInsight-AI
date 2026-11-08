import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  CustomerAccountMenu,
  CustomerAccountMenuTrigger,
  CustomerAuthShell,
  CustomerHeader
} from './CustomerLayout';
import { CustomerPrototypeProvider } from './CustomerPrototypeProvider';
import { getCustomerAuthRedirect, getCustomerLandingRedirect } from './customerAuthAction';
import { customerHeaderMenuReducer, isOutsideCustomerMenus } from './customerHeaderMenu';

const appSource = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const authStyles = readFileSync(new URL('../styles/auth.css', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const customerLayoutSource = readFileSync(new URL('./CustomerLayout.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const responsiveStyles = readFileSync(new URL('../styles/customer-responsive.css', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const flowStyles = readFileSync(new URL('../styles/customer-flow.css', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const sharedStyles = readFileSync(new URL('../styles/shared.css', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const initialMenuState = { accountOpen: false, notificationsOpen: false };

describe('customer route authentication', () => {
  it('redirects signed-in customers from the root to Shop and leaves guest landing public', () => {
    expect(getCustomerLandingRedirect('customer-token')).toBe('/customer/shop');
    expect(getCustomerLandingRedirect('prototype-guest')).toBeNull();
    expect(getCustomerLandingRedirect(null)).toBeNull();
  });

  it('redirects guests from protected routes to login with the requested path', () => {
    const redirect = getCustomerAuthRedirect(null, {
      pathname: '/customer/shop',
      search: '?category=parts',
      hash: ''
    });

    expect(redirect).toBe('/customer/login?redirect=%2Fcustomer%2Fshop%3Fcategory%3Dparts&returnTo=%2Fcustomer%2Fshop%3Fcategory%3Dparts');
  });
});

describe('customer account menu', () => {
  it('opens by click action, toggles closed, and closes notifications when opened', () => {
    const accountOpen = customerHeaderMenuReducer(initialMenuState, { type: 'toggle-account' });
    expect(accountOpen).toEqual({ accountOpen: true, notificationsOpen: false });
    expect(customerHeaderMenuReducer(accountOpen, { type: 'toggle-account' })).toEqual(initialMenuState);
    expect(customerHeaderMenuReducer(
      { accountOpen: false, notificationsOpen: true },
      { type: 'toggle-account' }
    )).toEqual(accountOpen);
  });

  it('closes on Escape or an outside click and closes the account menu when notifications open', () => {
    const open = { accountOpen: true, notificationsOpen: false };
    expect(customerHeaderMenuReducer(open, { type: 'close' })).toEqual(initialMenuState);
    expect(customerHeaderMenuReducer(open, { type: 'toggle-notifications' }))
      .toEqual({ accountOpen: false, notificationsOpen: true });

    const target = {};
    expect(isOutsideCustomerMenus(target, { contains: () => false }, { contains: () => false })).toBe(true);
    expect(isOutsideCustomerMenus(target, { contains: (node) => node === target }, { contains: () => false })).toBe(false);
    expect(isOutsideCustomerMenus(target, { contains: () => false }, { contains: (node) => node === target })).toBe(false);
  });

  it('exposes an accessible trigger, destinations, and sign-out menu item', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <CustomerAccountMenuTrigger isActive isExpanded onClick={() => {}} />
        <CustomerAccountMenu isOpen canSignOut onSelect={() => {}} onSignOut={() => {}} />
      </MemoryRouter>
    );

    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('role="menu"');
    expect(markup).toContain('href="/customer/profile"');
    expect(markup).toContain('href="/my-purchases?tab=all"');
    expect(markup).toContain('My profile');
    expect(markup).toContain('My purchases');
    expect(markup).toContain('role="separator"');
    expect(markup).toContain('class="customer-account-menu-signout" role="menuitem"');
    expect(markup).toContain('Sign out');
    expect(markup.indexOf('My purchases')).toBeLessThan(markup.indexOf('Sign out'));
  });

  it('makes the auth brand the accessible shop link without a separate back link', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <CustomerAuthShell activeTab="login" />
      </MemoryRouter>
    );

    expect(markup).toContain('aria-label="Go to Manoy&#x27;s Motorcycle shop"');
    expect(markup).toContain('class="customer-auth-brand"');
    expect(markup).not.toContain('customer-auth-back');
    expect(markup).not.toContain('Back to shop');
  });

  it('exposes an animated, stateful tablist and keyed form content', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <CustomerAuthShell activeTab="register">
          <div>Registration form</div>
        </CustomerAuthShell>
      </MemoryRouter>
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('class="customer-auth-tabs is-register"');
    expect(markup).toContain('class="customer-auth-tab-indicator"');
    expect(markup).toContain('role="tab" aria-selected="false" href="/customer/login"');
    expect(markup).toContain('role="tab" aria-selected="true" href="/customer/register"');
    expect(markup).toContain('class="customer-auth-form-content"');
  });

  it('keeps one indicator mounted across auth routes and changes its transform', () => {
    expect(appSource).toContain(
      '<Route element={<CustomerAuthLayout />}>\n          <Route path="/customer/login" element={<CustomerLogin />} />\n          <Route path="/customer/register" element={<CustomerRegister />} />\n        </Route>'
    );
    expect(customerLayoutSource).toContain(
      'return <CustomerAuthShell activeTab={activeTab}><Outlet /></CustomerAuthShell>;'
    );
    expect(customerLayoutSource.match(/className="customer-auth-tab-indicator"/g)).toHaveLength(1);
    expect(customerLayoutSource.indexOf('className="customer-auth-tab-indicator"'))
      .toBeLessThan(customerLayoutSource.indexOf('className="customer-auth-form-content"'));
    expect(authStyles).toContain('.customer-auth-tabs.is-register .customer-auth-tab-indicator {\n  transform: translateX(100%);');
    expect(authStyles).toContain('transition: transform 250ms ease-in-out;');
    expect(authStyles).toContain('@media (prefers-reduced-motion: reduce) {\n  .customer-auth-tab-indicator {\n    transition: transform 120ms ease-in-out;');
  });

  it('only shows Sign out when the customer has an account session', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <CustomerAccountMenu isOpen onSelect={() => {}} onSignOut={() => {}} />
      </MemoryRouter>
    );

    expect(markup).not.toContain('Sign out');
    expect(markup).not.toContain('role="separator"');
    expect(markup).not.toContain('My profile');
    expect(markup).not.toContain('My purchases');
  });

  it('keeps cart, notifications, and hamburger in the header outside the collapsible menu', () => {
    const originalLocalStorage = globalThis.localStorage;
    const originalSessionStorage = globalThis.sessionStorage;
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    globalThis.localStorage = storage;
    globalThis.sessionStorage = storage;
    let markup;
    try {
      markup = renderToStaticMarkup(<MemoryRouter><CustomerPrototypeProvider><CustomerHeader /></CustomerPrototypeProvider></MemoryRouter>);
    } finally {
      if (originalLocalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalLocalStorage;
      if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
      else globalThis.sessionStorage = originalSessionStorage;
    }

    const actions = markup.indexOf('class="customer-header-actions"');
    const cart = markup.indexOf('customer-header-cart');
    const bell = markup.indexOf('customer-notification-bell');
    const toggle = markup.indexOf('customer-menu-toggle');
    const nav = markup.indexOf('id="customer-navigation"');
    expect(actions).toBeGreaterThan(-1);
    expect(markup).toContain('<strong>MANOY&#x27;S</strong>');
    expect(markup).toContain('class="customer-brand" href="/"');
    expect(markup).toContain('aria-current="page" href="/"');
    expect(markup).toContain('>Home</a>');
    expect(markup).not.toContain('>Shop</a>');
    expect(markup).not.toContain('>Services</a>');
    expect(cart).toBeGreaterThan(actions);
    expect(bell).toBeGreaterThan(cart);
    expect(toggle).toBeGreaterThan(bell);
    expect(nav).toBeGreaterThan(toggle);
    expect(markup).toContain('>Register</a>');
    expect(customerLayoutSource).toContain("const isHomePage = currentPath === '/';");
    expect(markup.match(/customer-header-icon-button/g)).toHaveLength(3);
    expect(markup).not.toContain('customer-header-cart-count');
    expect(markup).not.toContain('customer-notification-count');
  });

  it('keeps Shop, Services, and Account links in the signed-in customer navbar', () => {
    const originalLocalStorage = globalThis.localStorage;
    const originalSessionStorage = globalThis.sessionStorage;
    const storage = {
      getItem: (key) => key === 'customerToken' ? 'customer-token' : null,
      setItem: () => {},
      removeItem: () => {}
    };
    globalThis.localStorage = storage;
    globalThis.sessionStorage = storage;
    let markup;
    try {
      markup = renderToStaticMarkup(<MemoryRouter><CustomerPrototypeProvider><CustomerHeader /></CustomerPrototypeProvider></MemoryRouter>);
    } finally {
      if (originalLocalStorage === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = originalLocalStorage;
      if (originalSessionStorage === undefined) delete globalThis.sessionStorage;
      else globalThis.sessionStorage = originalSessionStorage;
    }

    expect(markup).toContain('>Shop</a>');
    expect(markup).toContain('>Services</a>');
    expect(markup).toContain('Account');
    expect(markup).not.toContain('>Home</a>');
    expect(markup).not.toContain('>Register</a>');
  });

  it('keeps customer chrome mounted while route content changes by pathname', () => {
    expect(customerLayoutSource).toContain('onClick={closeNavigation}');
    expect(customerLayoutSource).toContain('<CustomerHeader />');
    expect(customerLayoutSource).toContain('<RouteContentTransition><Outlet /></RouteContentTransition>');
    expect(customerLayoutSource).not.toContain('<CustomerHeader key={location.pathname} />');
    expect(customerLayoutSource).toContain('const outsideNavigation = !menuRef.current?.contains(event.target)');
    expect(customerLayoutSource).toContain('if (outsideNavigation) setMenuOpenPath(null);');
    expect(customerLayoutSource).toContain('if (event.key === \'Escape\') {\n        setMenuOpenPath(null);');
    expect(customerLayoutSource).toContain('className="customer-site-footer"');
  });

  it('uses the shared customer container for the header, routed page, and footer', () => {
    const container = customerLayoutSource.indexOf('<div className="customer-layout-container">');
    const header = customerLayoutSource.indexOf('<CustomerHeader />', container);
    const route = customerLayoutSource.indexOf('<RouteContentTransition><Outlet /></RouteContentTransition>', container);
    const footer = customerLayoutSource.indexOf('<CustomerFooter />', container);

    expect(container).toBeGreaterThan(-1);
    expect(header).toBeGreaterThan(container);
    expect(route).toBeGreaterThan(header);
    expect(footer).toBeGreaterThan(route);
    expect(responsiveStyles).toContain('.customer-page .customer-layout-container');
    expect(responsiveStyles).toContain('max-width: 1760px;');
    expect(sharedStyles).toContain('.customer-page {\n  --customer-wide-content-padding: clamp(16px, 3vw, 44px);');
  });

  it('keeps menu panels mounted and animates them with reduced-motion support', () => {
    expect(customerLayoutSource).toContain('customer-account-menu-collapse${isOpen ? \' is-open\' : \'\'}');
    expect(customerLayoutSource).toContain('customer-notification-panel customer-notification-panel--viewport${customerMenus.notificationsOpen ? \' is-open\' : \'\'}');
    expect(customerLayoutSource).toContain('inert={!isOpen}');
    expect(customerLayoutSource).toContain('inert={!customerMenus.notificationsOpen}');
    expect(flowStyles).toContain('grid-template-rows: 0fr;');
    expect(flowStyles).toContain('grid-template-rows: 1fr;');
    expect(flowStyles).toContain('transform: rotate(180deg);');
    expect(responsiveStyles).toContain('transition: opacity 180ms ease-out, transform 180ms ease-out, visibility 0s linear 180ms;');
    expect(responsiveStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none !important;/);
    expect(responsiveStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important;/);
  });

  it('centers the notification panel on phones and closes it when the menu opens', () => {
    expect(customerLayoutSource).toContain('customer-notification-panel customer-notification-panel--viewport');
    expect(responsiveStyles).toMatch(/@media \(max-width: 600px\)[\s\S]*?\.customer-notification-panel--viewport \{[\s\S]*?position: fixed;[\s\S]*?left: calc\(12px \+ env\(safe-area-inset-left\)\);[\s\S]*?width: calc\(100vw - 24px - env\(safe-area-inset-left\) - env\(safe-area-inset-right\)\);/);
    expect(responsiveStyles).toContain('max-height: calc(100dvh - var(--customer-header-height, 64px) - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom));');
    expect(responsiveStyles).toContain('overflow-y: auto;\n    overscroll-behavior: contain;');
    expect(customerLayoutSource).toContain("dispatchCustomerMenu({ type: 'close' }); setMenuOpenPath(isMenuOpen ? null : location.pathname);");
    expect(customerLayoutSource).toContain('menuOpenPath === location.pathname');
    expect(customerLayoutSource).toContain("setMenuOpenPath(null); dispatchCustomerMenu({ type: 'toggle-notifications' });");
    expect(customerHeaderMenuReducer(
      { accountOpen: false, notificationsOpen: true },
      { type: 'close' }
    )).toEqual(initialMenuState);
  });

  it('sets full-width mobile menu rows to 48px with 12px horizontal padding', () => {
    expect(responsiveStyles).toContain('width: 100%;\n    min-width: 0;\n    height: 48px;\n    min-height: 48px !important;');
    expect(responsiveStyles).toContain('padding: 0 12px;');
    expect(responsiveStyles).toContain('.customer-page .customer-nav .customer-account-menu-collapse {\n    width: 100%;');
  });

  it('keeps Services bookings as a 44px pill and restores tablet product columns', () => {
    expect(responsiveStyles).toContain('.customer-page .services-my-bookings {\n    display: inline-flex;');
    expect(responsiveStyles).toContain('min-height: 44px;');
    expect(responsiveStyles).toContain('@media (min-width: 600px) and (max-width: 900px)');
    expect(responsiveStyles).toContain('grid-template-columns: repeat(auto-fill, minmax(166px, 1fr));');
  });
});
