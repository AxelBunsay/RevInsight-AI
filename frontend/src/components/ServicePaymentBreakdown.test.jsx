import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ServicePaymentBreakdown from './ServicePaymentBreakdown';

describe('service payment breakdown', () => {
  it('shows the saved total, percentage down payment, and shop balance', () => {
    const markup = renderToStaticMarkup(
      <ServicePaymentBreakdown booking={{
        totalAmount: 333,
        downPaymentPercent: 50,
        downPaymentAmount: 166.5,
        balanceDue: 166.5
      }} />
    );

    expect(markup).toContain('Total</span><strong>₱333.00');
    expect(markup).toContain('Down payment (50%)</span><strong>₱166.50');
    expect(markup).toContain('Balance due at the shop</span><strong>₱166.50');
  });

  it('treats a legacy booking without a snapshot as paid in full upfront', () => {
    const markup = renderToStaticMarkup(
      <ServicePaymentBreakdown booking={{ estimatedPrice: 2500 }} />
    );

    expect(markup).toContain('Down payment (100%)</span><strong>₱2,500.00');
    expect(markup).toContain('Balance due at the shop</span><strong>₱0.00');
  });
});
