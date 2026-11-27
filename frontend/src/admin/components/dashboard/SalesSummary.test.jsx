import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SalesChart from './SalesChart';
import SalesSummary from './SalesSummary';

describe('SalesSummary', () => {
  it.each([
    ['daily', 'Sales today', 'vs yesterday'],
    ['weekly', 'Sales this week', 'vs last week'],
    ['monthly', 'Sales this month', 'vs last month']
  ])('uses the %s heading and comparison for the selected period', (period, heading, comparison) => {
    const markup = renderToStaticMarkup(<SalesSummary period={period} series={[{ value: 120 }, { value: 180 }]} />);

    expect(markup).toContain(heading);
    expect(markup).toContain(comparison);
    expect(markup).toContain('<strong>₱180</strong>');
    expect(markup).not.toContain('₱300');
    expect(markup).toContain('+50.0%');
  });

  it.each(['daily', 'weekly', 'monthly'])('exposes the %s period and its series values in the chart', (period) => {
    const markup = renderToStaticMarkup(<SalesChart
      period={period}
      loading={false}
      series={[{ label: 'First bucket', value: 100 }, { label: 'Second bucket', value: 300 }]}
    />);

    expect(markup).toContain(`aria-label="Sales by ${period}: First bucket`);
    expect(markup).toContain('₱100');
    expect(markup).toContain('₱300');
  });
});