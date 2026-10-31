import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildLoginPayload,
  getAuthSessionLoginPath,
  getAuthSessionKind,
  clearAuthSession,
  DEFAULT_REMEMBER_ME,
  getAuthToken,
  getRememberedIdentifier,
  getSessionRedirect,
  restoreAuthSession,
  storeAuthSession
} from './authSession';
import { api } from '../services/api';

function createStorage() {
  const values = new Map();
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn((key) => values.delete(key)),
    clear: vi.fn(() => values.clear())
  };
}

let local;
let session;

function setupStorage() {
  local = createStorage();
  session = createStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remember-me sessions', () => {
  it('keeps sign-out destinations within the signed-out role', () => {
    expect(getAuthSessionLoginPath('admin')).toBe('/admin/login');
    expect(getAuthSessionLoginPath('customer')).toBe('/customer/login');
    expect(getAuthSessionLoginPath('mechanic')).toBe('/mechanic/login');
  });

  it('defaults remember me to checked and sends a boolean in either login payload', () => {
    expect(DEFAULT_REMEMBER_ME).toBe(true);
    expect(buildLoginPayload('username', 'rider', 'never-store-this', DEFAULT_REMEMBER_ME))
      .toEqual({ username: 'rider', password: 'never-store-this', rememberMe: true });
    expect(buildLoginPayload('email', 'rider@example.com', 'secret', 'true').rememberMe).toBe(false);
  });

  it('sends the boolean rememberMe value in both login requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ token: 'test-token' })
    }));
    const customerPayload = buildLoginPayload('email', 'rider@example.com', 'password', true);
    const mechanicPayload = buildLoginPayload('username', 'rider', 'password', false);

    await api.loginCustomer(customerPayload);
    await api.loginMechanic(mechanicPayload);

    expect(JSON.parse(fetch.mock.calls[0][1].body).rememberMe).toBe(true);
    expect(JSON.parse(fetch.mock.calls[1][1].body).rememberMe).toBe(false);
  });

  it('stores remembered sessions persistently and unchecked sessions only for the browser session', () => {
    setupStorage();
    storeAuthSession('mechanic', {
      token: 'persistent-token',
      user: { username: 'rider' },
      rememberMe: true,
      identifier: 'rider'
    });
    expect(local.getItem('mechanicToken')).toBe('persistent-token');
    expect(session.getItem('mechanicToken')).toBeNull();
    expect(getRememberedIdentifier('mechanic')).toBe('rider');

    storeAuthSession('customer', {
      token: 'session-token',
      user: { email: 'rider@example.com' },
      rememberMe: false,
      identifier: 'rider@example.com'
    });
    expect(local.getItem('customerToken')).toBeNull();
    expect(session.getItem('customerToken')).toBe('session-token');
    expect(getRememberedIdentifier('customer')).toBe('');
    expect(getAuthToken('customer')).toBe('session-token');
  });

  it('validates and caches a valid session, but clears an invalid one', async () => {
    setupStorage();
    storeAuthSession('customer', {
      token: 'session-token',
      user: {},
      rememberMe: false,
      identifier: 'rider@example.com'
    });
    const restored = await restoreAuthSession('customer', async () => ({
      user: { email: 'rider@example.com' }
    }));
    expect(restored).toMatchObject({ valid: true, user: { email: 'rider@example.com' } });
    expect(session.getItem('customerUser')).toContain('rider@example.com');

    const invalid = await restoreAuthSession('customer', async () => {
      const error = new Error('Invalid token');
      error.status = 401;
      throw error;
    });
    expect(invalid).toMatchObject({ valid: false, invalid: true });
    expect(getAuthToken('customer')).toBeNull();
    expect(getSessionRedirect({
      pathname: '/customer/profile',
      customerInvalid: true
    })).toBe('/customer/login');
  });

  it('returns appropriate redirect destinations and clears both storage buckets on sign out', () => {
    setupStorage();
    storeAuthSession('mechanic', {
      token: 'token',
      user: { username: 'rider' },
      rememberMe: true,
      identifier: 'rider'
    });
    expect(getSessionRedirect({ pathname: '/mechanic/login', mechanicValid: true }))
      .toBe('/mechanic/dashboard');
    expect(getSessionRedirect({ pathname: '/customer/login', customerValid: true }))
      .toBe('/customer/shop');
    expect(getSessionRedirect({ pathname: '/admin/mechanics', mechanicValid: true })).toBeNull();
    expect(getSessionRedirect({ pathname: '/customer/services', mechanicValid: true })).toBeNull();

    session.setItem('mechanicToken', 'old-session');
    local.setItem('customerToken', 'customer-session');
    local.setItem('adminToken', 'admin-session');
    clearAuthSession('mechanic');
    expect(getAuthToken('mechanic')).toBeNull();
    expect(getRememberedIdentifier('mechanic')).toBe('');
    expect(local.getItem('customerToken')).toBe('customer-session');
    expect(local.getItem('adminToken')).toBe('admin-session');
  });

  it('keeps a mechanic session scoped to mechanic routes', () => {
    expect(getSessionRedirect({
      pathname: '/customer/shop',
      mechanicValid: true
    })).toBeNull();
    expect(getSessionRedirect({
      pathname: '/customer/shop',
      mechanicInvalid: true
    })).toBeNull();
    expect(getSessionRedirect({
      pathname: '/admin/login',
      mechanicValid: true
    })).toBeNull();
    expect(getSessionRedirect({
      pathname: '/mechanic/login',
      mechanicValid: true
    })).toBe('/mechanic/dashboard');
  });

  it.each([
    ['mechanic', '/admin/login', 'admin'],
    ['mechanic', '/admin/mechanics', 'admin'],
    ['mechanic', '/customer/services', 'customer'],
    ['customer', '/admin/login', 'admin'],
    ['customer', '/admin/mechanics', 'admin'],
    ['customer', '/mechanic/login', 'mechanic'],
    ['admin', '/mechanic/login', 'mechanic'],
    ['admin', '/customer/services', 'customer'],
    ['admin', '/customer/login', 'customer']
  ])('does not redirect a stored %s session away from %s', (storedKind, pathname, pageKind) => {
    const result = getSessionRedirect({
      pathname,
      customerValid: storedKind === 'customer',
      mechanicValid: storedKind === 'mechanic'
    });

    expect(getAuthSessionKind(pathname)).toBe(pageKind === 'admin' ? null : pageKind);
    expect(result).toBeNull();
  });
});
