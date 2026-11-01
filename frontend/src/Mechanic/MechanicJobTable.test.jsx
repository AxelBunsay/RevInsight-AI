import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JobDialog, JobTable } from './MechanicJobTable';

const exampleJob = {
  _id: '6ae25d269de2b06335b2fe68',
  code: 'SRV-B2FE68',
  customerName: 'Alex Rider',
  vehicle: '2024 Honda TMX 125',
  serviceType: 'Bearing Replacement',
  units: 2,
  unitLabel: 'wheel hub',
  pricePerUnit: true,
  servicePriceTotal: 300,
  mechanicFeeTotal: 100,
  estimatedPrice: 400,
  partsSource: 'customer',
  scheduledDate: '2026-10-30T00:00:00.000Z',
  startTime: '09:00',
  endTime: '10:00',
  priority: 'High',
  status: 'assigned'
};

describe('mechanic job cards', () => {
  it('uses the saved customer-facing booking code or the existing short-code format', () => {
    const markup = renderToStaticMarkup(
      <JobTable jobs={[{ _id: exampleJob._id }]} onSelect={() => {}} />
    );

    expect(markup).toContain('SRV-B2FE68');
  });

  it('renders a keyboard-operable card with job details and a single-line price breakdown', () => {
    const markup = renderToStaticMarkup(<JobTable jobs={[exampleJob]} onSelect={() => {}} />);

    expect(markup).toContain('aria-label="Open booking SRV-B2FE68"');
    expect(markup).toContain('Alex Rider');
    expect(markup).toContain('2024 Honda TMX 125');
    expect(markup).toContain('Bearing Replacement x2 wheel hubs');
    expect(markup).toContain('Service ₱300.00 + Mechanic fee ₱100.00 = Total ₱400.00');
    expect(markup).toContain('Customer brings own parts');
    expect(markup).not.toContain('6ae25d269de2b06335b2fe68');
  });
});

describe('mechanic job completion balance prompt', () => {
  it('renders the accept, start, and complete actions with their expected labels', () => {
    const markup = renderToStaticMarkup(
      <JobDialog
        job={{ _id: exampleJob._id, code: exampleJob.code, serviceType: 'Brake service' }}
        onClose={() => {}}
        actions={['accept', 'start', 'complete']}
        onAction={() => {}}
        busy={false}
      />
    );

    expect(markup).toContain('Accept job');
    expect(markup).toContain('Start work');
    expect(markup).toContain('Mark complete');
  });

  it('shows the outstanding balance to collect when completing a job', () => {
    const markup = renderToStaticMarkup(
      <JobDialog
        job={{
          _id: '6ae25d269de2b06335b2fe68',
          code: 'SRV-B2FE68',
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
    expect(markup).toContain('SRV-B2FE68');
    expect(markup).not.toContain('6ae25d269de2b06335b2fe68');
  });
});
