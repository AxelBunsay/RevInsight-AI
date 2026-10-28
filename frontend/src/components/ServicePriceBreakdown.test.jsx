import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ServicePriceBreakdown from './ServicePriceBreakdown';

describe('ServicePriceBreakdown', () => {
  it('renders each label separately from its right-aligned amount', () => {
    const markup = renderToStaticMarkup(
      <ServicePriceBreakdown servicePriceTotal={300} mechanicFeeTotal={100} estimatedPrice={400} />
    );

    expect(markup).toContain('<p><span>Service</span><strong>₱300.00</strong></p>');
    expect(markup).toContain('<p><span>Mechanic fee</span><strong>₱100.00</strong></p>');
    expect(markup).toContain('<p><span>Total</span><strong>₱400.00</strong></p>');
  });
});
