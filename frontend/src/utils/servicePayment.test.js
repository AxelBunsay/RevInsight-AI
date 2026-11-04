import { describe, expect, it } from 'vitest';
import { getServiceBookingStatus } from './servicePayment';

describe('labor-only quote status labels', () => {
  it('maps every quote state to the customer booking badge', () => {
    expect(['quote_requested', 'quoted', 'accepted', 'rejected', 'declined', 'cancelled'].map((quoteStatus) =>
      getServiceBookingStatus({ quoteStatus })
    )).toEqual([
      'Awaiting quote',
      'Quote ready',
      'Accepted',
      'Rejected',
      'Declined by mechanic',
      'Cancelled'
    ]);
  });
});