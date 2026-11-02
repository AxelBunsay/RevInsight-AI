export const MOBILE_NUMBER_ERROR = 'Enter a valid mobile number (11 digits, starts with 09)';

export function cleanAndValidateMobileNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  const canonicalDigits = digits.startsWith('63') && digits.length === 12
    ? `0${digits.slice(2)}`
    : digits.startsWith('9') && digits.length === 10
      ? `0${digits}`
      : digits;
  return { digits, canonicalDigits, isValid: /^09\d{9}$/.test(digits) };
}