import { describe, expect, it } from 'vitest';
import { hasCustomerFooterDetails } from './customerFooterSettings';

describe('customer footer pickup settings', () => {
  it('recognizes saved address, hours, or contact details', () => {
    expect(hasCustomerFooterDetails({ pickupAddress: '44 Main Street' })).toBe(true);
    expect(hasCustomerFooterDetails({ pickupHours: 'Mon-Sat 9-6' })).toBe(true);
    expect(hasCustomerFooterDetails({ contactNumber: '+63 917 123 4567' })).toBe(true);
  });

  it('treats missing or whitespace-only pickup details as empty', () => {
    expect(hasCustomerFooterDetails(null)).toBe(false);
    expect(hasCustomerFooterDetails({
      pickupAddress: ' ',
      pickupHours: '',
      contactNumber: '   '
    })).toBe(false);
  });
});
