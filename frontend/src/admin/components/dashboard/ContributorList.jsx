import { useState } from 'react';

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

export default function ContributorList({ concentration }) {
  const [query, setQuery] = useState('');
  if (!concentration) return null;
  const total = concentration.totalRevenue;
  const term = query.trim().toLowerCase();
  const classified = concentration.contributors || [];
  const products = concentration.salesMix?.products;
  const contributors = products ? [
    ...products.map(row => ({ ...row, contributorType: 'Product' })),
    ...classified.filter(row => row.contributorType === 'Labor service')
  ] : classified;
  const rows = contributors.filter(row => row.name.toLowerCase().includes(term))
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  return <section className="ai-revenue-product-summary">
    <label>Search revenue contributors <input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <p>Share of recorded revenue in this period · {money.format(total)}</p>
    {rows.length ? <ul>{rows.map((row, index) => <li key={row.contributorType + ':' + row.name + ':' + index}>
      {row.name} ({row.contributorType}) · {money.format(row.revenue)} · {total ? (100 * row.revenue / total).toFixed(2) : '0.00'}%
    </li>)}</ul> : <p>No matching contributors.</p>}
  </section>;
}
