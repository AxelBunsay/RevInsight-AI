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
