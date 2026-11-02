import { describe, expect, it } from 'vitest';
import { cleanAndValidateMobileNumber } from '../../../shared/mobileNumber.mjs';

describe('cleanAndValidateMobileNumber', () => {
  it('cleans pasted characters and validates only 11-digit 09 numbers', () => {
    const cleaned = cleanAndValidateMobileNumber('0919abc8191181');
    expect(cleaned.digits).toBe('09198191181');
    expect(cleaned.isValid).toBe(true);
    expect(cleanAndValidateMobileNumber('12345').isValid).toBe(false);
  });
});