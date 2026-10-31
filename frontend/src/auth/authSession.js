export const DEFAULT_REMEMBER_ME = true;

const SESSION_KEYS = {
  customer: {
    token: 'customerToken',
    user: 'customerUser',
    identifier: 'customerRememberedEmail'
  },
  mechanic: {
    token: 'mechanicToken',
    user: 'mechanicUser',
    identifier: 'mechanicRememberedUsername'
  }
};

export const AUTH_SESSION_LOGIN_PATHS = Object.freeze({
  admin: '/admin/login',
  customer: '/customer/login',
  mechanic: '/mechanic/login'
});

export function getAuthSessionLoginPath(kind) {
  const path = AUTH_SESSION_LOGIN_PATHS[kind];
  if (!path) throw new Error(`Unknown auth session: ${kind}`);
  return path;
}

function getStores() {
  return [globalThis.localStorage, globalThis.sessionStorage].filter(Boolean);
}

function getKeys(kind) {
  const keys = SESSION_KEYS[kind];
  if (!keys) throw new Error(`Unknown auth session: ${kind}`);
  return keys;
}

export function getAuthToken(kind) {
  const { token } = getKeys(kind);
  for (const storage of getStores()) {
    const value = storage.getItem(token);
    if (value) return value;
  }
  return null;
}

export function getAuthUser(kind) {
  const { user, token } = getKeys(kind);
  for (const storage of getStores()) {
    if (storage.getItem(token)) {
      try {
        return JSON.parse(storage.getItem(user) || 'null');
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function getRememberedIdentifier(kind) {
  return getStores()[0]?.getItem(getKeys(kind).identifier) || '';
}

export function getAuthSessionKind(pathname) {
  if (pathname === '/' || pathname.startsWith('/customer/') || pathname.startsWith('/my-purchases')) {
    return 'customer';
  }
  if (pathname.startsWith('/mechanic/')) return 'mechanic';
  return null;
}

export function storeAuthUser(kind, value) {
  const keys = getKeys(kind);
  const storage = globalThis.localStorage.getItem(keys.token)
    ? globalThis.localStorage
    : globalThis.sessionStorage;
  storage.setItem(keys.user, JSON.stringify(value || {}));
}

export function storeAuthSession(kind, { token, user, rememberMe, identifier }) {
  const keys = getKeys(kind);
  clearAuthSession(kind);
  const persistent = rememberMe === true;
  const storage = persistent ? globalThis.localStorage : globalThis.sessionStorage;
  storage.setItem(keys.token, token);
  storage.setItem(keys.user, JSON.stringify(user || {}));
  if (persistent && identifier) {
    globalThis.localStorage.setItem(keys.identifier, identifier);
  }
}

export function clearAuthSession(kind) {
  const keys = getKeys(kind);
  for (const storage of getStores()) {
    storage.removeItem(keys.token);
    storage.removeItem(keys.user);
    storage.removeItem(keys.identifier);
  }
}

export function buildLoginPayload(identifierField, identifier, password, rememberMe) {
  return {
    [identifierField]: identifier,
    password,
    rememberMe: rememberMe === true
  };
}

export function resolveSessionDestination(kind, {
  pathname,
  fromPath,
  returnTo,
  pendingActionPath
}) {
  if (kind === 'mechanic') return '/mechanic/dashboard';
  if (kind !== 'customer' || pathname !== '/customer/login') return null;

  const safePath = (path) => typeof path === 'string'
    && (path.startsWith('/customer/') || path.startsWith('/my-purchases'))
    && !path.startsWith('//')
    ? path
    : null;
  return safePath(pendingActionPath) || safePath(fromPath) || safePath(returnTo) || '/customer/shop';
}

export function getSessionRedirect({
  pathname,
  customerValid = false,
  mechanicValid = false,
  customerInvalid = false,
  mechanicInvalid = false,
  fromPath,
  returnTo,
  pendingActionPath
}) {
  const isCustomerArea = pathname.startsWith('/customer/') || pathname.startsWith('/my-purchases');
  const isMechanicArea = pathname.startsWith('/mechanic/');

  if (isCustomerArea) {
    if (customerInvalid && pathname !== '/customer/login') return '/customer/login';
    if (customerValid) {
      return resolveSessionDestination('customer', {
        pathname,
        fromPath,
        returnTo,
        pendingActionPath
      });
    }
    return null;
  }

  if (isMechanicArea) {
    if (mechanicInvalid && pathname !== '/mechanic/login') return '/mechanic/login';
    if (mechanicValid && pathname === '/mechanic/login') return '/mechanic/dashboard';
  }
  return null;
}

export async function restoreAuthSession(kind, fetchProfile) {
  try {
    const response = await fetchProfile();
    const user = kind === 'customer' ? response.user : response.mechanic;
    storeAuthUser(kind, user);
    return { valid: true, user };
  } catch (error) {
    if (error?.status === 401 || error?.status === 404) {
      clearAuthSession(kind);
      return { valid: false, invalid: true };
    }
    return { valid: false, error };
  }
}
