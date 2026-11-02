const CUSTOMER_AUTH_ACTION_KEY = 'revinsightCustomerAuthAction';
const ACTION_MAX_AGE_MS = 30 * 60 * 1000;

export function getSafeCustomerRedirectPath(path) {
  return typeof path === 'string' && path.startsWith('/customer') ? path : null;
}

export function hasCustomerSession(customerToken) {
  return Boolean(customerToken && customerToken !== 'prototype-guest');
}

export function getCustomerLandingRedirect(customerToken) {
  return hasCustomerSession(customerToken) ? '/customer/shop' : null;
}

export function getCustomerAuthRedirect(customerToken, location) {
  if (hasCustomerSession(customerToken)) return null;

  const requestedPath = location.pathname.startsWith('/my-purchases')
    ? `/customer/purchases${location.search || ''}${location.hash || ''}`
    : `${location.pathname}${location.search || ''}${location.hash || ''}`;
  const params = new URLSearchParams({ redirect: requestedPath, returnTo: requestedPath });
  return `/customer/login?${params.toString()}`;
}

export function readCustomerAuthAction() {
  const raw = sessionStorage.getItem(CUSTOMER_AUTH_ACTION_KEY);
  if (!raw) return null;
  try {
    const action = JSON.parse(raw);
    const age = Date.now() - Number(action?.createdAt);
    if (!action || !Number.isFinite(age) || age < 0 || age > ACTION_MAX_AGE_MS) {
      sessionStorage.removeItem(CUSTOMER_AUTH_ACTION_KEY);
      return null;
    }
    return action;
  } catch {
    sessionStorage.removeItem(CUSTOMER_AUTH_ACTION_KEY);
    return null;
  }
}

export function saveCustomerAuthAction(action) {
  sessionStorage.setItem(CUSTOMER_AUTH_ACTION_KEY, JSON.stringify({
    ...action,
    createdAt: Date.now()
  }));
}

export function clearCustomerAuthAction() {
  sessionStorage.removeItem(CUSTOMER_AUTH_ACTION_KEY);
}

export function customerActionSignInMessage(action) {
  if (action?.type === 'item') return 'Sign in or create an account to reserve items.';
  if (action?.type === 'service') return 'Sign in or create an account to book services.';
  return '';
}

export function customerActionReturnPath(action) {
  return action?.returnPath?.startsWith('/customer/')
    ? action.returnPath
    : '/customer/shop';
}
