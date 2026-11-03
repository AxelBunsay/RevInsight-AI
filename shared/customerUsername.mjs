const RESERVED_CUSTOMER_USERNAMES = new Set([
  'admin',
  'administrator',
  'mechanic',
  'support',
  'manoy',
  'manoys',
  'owner',
  'staff',
  'root'
]);

export const CUSTOMER_USERNAME_HINT = '4-20 letters, numbers or underscore';

export function normalizeCustomerUsername(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeCustomerUsername(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20);
}

export function validateCustomerUsername(value) {
  const username = normalizeCustomerUsername(value);
  if (!username) return { isValid: false, message: 'Username is required.' };
  if (!/^[A-Za-z0-9_]{4,20}$/.test(username)) {
    return { isValid: false, message: 'Username must be 4-20 letters, numbers or underscore.' };
  }
  if (RESERVED_CUSTOMER_USERNAMES.has(username.toLowerCase())) {
    return { isValid: false, message: 'This username is reserved.' };
  }
  return { isValid: true, message: '' };
}