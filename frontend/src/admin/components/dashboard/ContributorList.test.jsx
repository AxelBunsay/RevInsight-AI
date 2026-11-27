import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import ContributorList from './ContributorList';

it('shows identified products without a category and uses all eligible revenue for shares', () => {
  const html = renderToStaticMarkup(<ContributorList concentration={{
    totalRevenue: 600, salesMix: { products: [{ name: 'Oil', revenue: 300 }] },
    contributors: [{ name: 'Installation', revenue: 150, contributorType: 'Labor service' }]
  }} />);
  expect(html).toContain('Oil (Product)');
  expect(html).toContain('50.00%');
  expect(html).toContain('Installation (Labor service)');
  expect(html).toContain('25.00%');
});


it('provides a collapsible contributor search with a type filter and clear action', () => {
  const html = renderToStaticMarkup(<ContributorList concentration={{
    totalRevenue: 800,
    salesMix: { products: [{ name: 'Engine Oil', revenue: 250 }] },
    contributors: [{ name: 'Oil change', revenue: 150, contributorType: 'Labor service' }]
  }} />);
  expect(html).toContain('<details');
  expect(html).toContain('Search and filter contributors');
  expect(html).toContain('type="search"');
  expect(html).toContain('Search by product or service');
  expect(html).toContain('Contributor type');
  expect(html).toContain('All types');
  expect(html).toContain('Labor service');
  expect(html).toContain('Clear filters');
  expect(html).toContain('Revenue totals and concentration risk remain based on the selected scope');
});

it('renders an empty contributor state without changing the revenue scope total', () => {
  const html = renderToStaticMarkup(<ContributorList concentration={{
    totalRevenue: 900, contributors: []
  }} />);
  expect(html).toContain('₱900.00');
  expect(html).toContain('No matching contributors');
});
