import { getCustomerPageRange, getCustomerPageNumbers } from './customerPagination';

export default function CustomerPagination({ page, pageCount, totalItems, pageSize, onPageChange, label = 'List' }) {
  const range = getCustomerPageRange(totalItems, page, pageSize);
  const pageNumbers = getCustomerPageNumbers(page, pageCount);

  return <div className="customer-pagination-region">
    <p className="customer-pagination-summary" aria-live="polite">
      Showing {range.start}-{range.end} of {totalItems}
    </p>
    {pageCount > 1 && <nav className="customer-pagination" aria-label={`${label} pagination`}>
      <div className="customer-pagination-desktop">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        {pageNumbers.map((number) => typeof number === 'number'
          ? <button
            type="button"
            key={number}
            aria-label={`Page ${number}`}
            aria-current={page === number ? 'page' : undefined}
            className={page === number ? 'is-active' : ''}
            onClick={() => onPageChange(number)}
          >{number}</button>
          : <span className="customer-pagination-ellipsis" key={number} aria-hidden="true">…</span>)}
        <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
      <div className="customer-pagination-compact">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
        <span aria-live="polite">Page {page} of {pageCount}</span>
        <button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</button>
      </div>
    </nav>}
  </div>;
}