import { useState } from 'react';

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const INITIAL_VISIBLE = 5;

export default function ContributorList({ concentration }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);

  if (!concentration) return null;

  const total = Number(concentration.totalRevenue) || 0;
  const classified = Array.isArray(concentration.contributors) ? concentration.contributors : [];
  const products = Array.isArray(concentration.salesMix?.products) ? concentration.salesMix.products : null;
  const contributors = products
    ? [
        ...products.map((row) => ({ ...row, contributorType: 'Product' })),
        ...classified.filter((row) => row.contributorType === 'Labor service')
      ]
    : classified;

  const types = [...new Set(contributors.map((row) => row.contributorType).filter(Boolean))].sort();
  const term = query.trim().toLocaleLowerCase();
  const hasFilters = Boolean(term) || typeFilter !== 'all';
  const rows = contributors
    .filter((row) => typeFilter === 'all' || row.contributorType === typeFilter)
    .filter((row) => String(row.name || '').toLocaleLowerCase().includes(term))
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0) || String(a.name || '').localeCompare(String(b.name || '')));
  const visible = hasFilters || showAll ? rows : rows.slice(0, INITIAL_VISIBLE);

  const clearFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setShowAll(false);
  };

  return <details className="ai-revenue-contributors">
    <summary>Search and filter contributors <span>({contributors.length})</span></summary>
    <div className="ai-revenue-contributors__body">
      <div className="ai-revenue-contributors__filters">
        <label>Search by product or service
          <input
            type="search"
            placeholder="e.g. Oil"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setShowAll(false); }}
          />
        </label>
        <label>Contributor type
          <select
            value={typeFilter}
            onChange={(event) => { setTypeFilter(event.target.value); setShowAll(false); }}
          >
            <option value="all">All types</option>
            {types.map((type) => <option value={type} key={type}>{type}</option>)}
          </select>
        </label>
        <button type="button" onClick={clearFilters} disabled={!hasFilters}>Clear filters</button>
      </div>
      <p>Share of recorded revenue in this scope · {money.format(total)}</p>
      {visible.length ? <ul>{visible.map((row, index) => <li key={row.contributorType + ':' + row.name + ':' + index}>
        {row.name} ({row.contributorType}) · {money.format(Number(row.revenue) || 0)} · {total ? (100 * Number(row.revenue || 0) / total).toFixed(2) : '0.00'}%
      </li>)}</ul> : <p role="status">No matching contributors. Clear filters or try another search.</p>}
      {!hasFilters && !showAll && rows.length > INITIAL_VISIBLE && <button type="button" onClick={() => setShowAll(true)}>
        Show all {rows.length} contributors
      </button>}
      {!hasFilters && showAll && rows.length > INITIAL_VISIBLE && <button type="button" onClick={() => setShowAll(false)}>
        Show top {INITIAL_VISIBLE} only
      </button>}
      <small>Search and type filters affect only this list. Revenue totals and concentration risk remain based on the selected scope.</small>
    </div>
  </details>;
}
