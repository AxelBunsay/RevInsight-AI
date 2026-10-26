const CUSTOMER_AUTH_ACTION_KEY = 'revinsightCustomerAuthAction';
const ACTION_MAX_AGE_MS = 30 * 60 * 1000;

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
