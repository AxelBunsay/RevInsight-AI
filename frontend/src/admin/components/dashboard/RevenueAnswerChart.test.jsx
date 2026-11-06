import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RevenueAnswerChart from './RevenueAnswerChart';

describe('RevenueAnswerChart', () => {
  it('renders an accessible chart alternative and recorded-data caption', () => {
    const html = renderToStaticMarkup(<RevenueAnswerChart chart={{
      type: 'quarterly_trend',
      title: 'Revenue across the last completed quarters',
      labels: ['2026 Q1'],
      datasets: [{ label: 'Revenue', data: [1250] }]
    }} />);

    expect(html).toContain('role="img"');
    expect(html).toContain('Line chart showing revenue across completed quarters.');
    expect(html).toContain('Chart built from your recorded data');
    expect(html).toContain('<canvas');
  });
});
