import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JobDialog } from './MechanicJobTable';

describe('mechanic job completion balance prompt', () => {
  it('shows the outstanding balance to collect when completing a job', () => {
    const markup = renderToStaticMarkup(
      <JobDialog
        job={{
          _id: 'booking-1',
          serviceType: 'Brake service',
          estimatedPrice: 333,
          totalAmount: 333,
          downPaymentPercent: 50,
          downPaymentAmount: 166.5,
          balanceDue: 166.5,
          paymentStatus: 'Confirmed',
          amountPaid: 166.5
        }}
        onClose={() => {}}
        actions={['complete']}
        onAction={() => {}}
        busy={false}
      />
    );

    expect(markup).toContain('Collect balance of ₱166.50 at the shop.');
  });
});
