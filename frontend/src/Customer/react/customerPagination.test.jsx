import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import CustomerPagination from './CustomerPagination.jsx';
import {
  CUSTOMER_PAGE_SIZES,
  getCustomerPageItems,
  getCustomerPageNumbers,
  getCustomerPageRange,
  getCustomerPageSize,
  withCustomerPage
} from './customerPagination';

const shopSource = readFileSync(new URL('./Shop.jsx', import.meta.url), 'utf8');
const servicesSource = readFileSync(new URL('./Services.jsx', import.meta.url), 'utf8');
const purchasesSource = readFileSync(new URL('./MyPurchases.jsx', import.meta.url), 'utf8');
const paginationStyles = readFileSync(new URL('../styles/customer-flow.css', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const paginationHookSource = readFileSync(new URL('./useCustomerPagination.js', import.meta.url), 'utf8');

const renderPagination = (page, pageCount, totalItems = 48, pageSize = 12) => renderToStaticMarkup(
  <CustomerPagination
    page={page}
    pageCount={pageCount}
    totalItems={totalItems}
    pageSize={pageSize}
    onPageChange={() => {}}
    label="Products"
  />
);

describe('customer pagination', () => {
  it('disables previous and next at the first and last pages', () => {
    const firstPage = renderPagination(1, 4);
    const lastPage = renderPagination(4, 4);

    expect(firstPage).toContain('aria-label="Previous page" disabled=""');
    expect(firstPage).toContain('aria-current="page"');
    expect(lastPage).toContain('aria-label="Next page" disabled=""');
    expect(lastPage).toContain('Showing 37-48 of 48');
  });

  it('shows ellipses in the wide page-number control and a compact mobile label', () => {
    const markup = renderPagination(5, 10);
    expect(getCustomerPageNumbers(5, 10)).toEqual([1, 'ellipsis-1-4', 4, 5, 6, 'ellipsis-6-10', 10]);
    expect(markup).toContain('customer-pagination-ellipsis');
    expect(markup).toContain('Page 5 of 10');
  });

  it('keeps the single-page summary while hiding page controls', () => {
    const markup = renderPagination(1, 1, 6, 10);
    expect(markup).toContain('Showing 1-6 of 6');
    expect(markup).not.toContain('<nav class="customer-pagination"');
  });

  it('uses ten items per page for Shop, Services, and purchases at every width', () => {
    expect(CUSTOMER_PAGE_SIZES).toEqual({
      shop: 10,
      services: 10,
      purchases: 10
    });
    for (const width of [320, 360, 390, 600, 768, 1024, 1920]) {
      expect(getCustomerPageSize('shop', width)).toBe(10);
      expect(getCustomerPageSize('services', width)).toBe(10);
      expect(getCustomerPageSize('purchases', width)).toBe(10);
    }
  });

  it('slices one page while preserving full result totals and ranges', () => {
    const items = Array.from({ length: 48 }, (_, index) => index + 1);
    expect(getCustomerPageItems(items, 2, 12)).toEqual(items.slice(12, 24));
    expect(getCustomerPageRange(48, 2, 12)).toEqual({ start: 13, end: 24 });
    expect(getCustomerPageRange(0, 1, 12)).toEqual({ start: 0, end: 0 });
  });

  it('updates the page query parameter without dropping tabs or product-modal state', () => {
    const next = withCustomerPage(new URLSearchParams('tab=services&product=abc&page=4'), 2);
    expect(next.toString()).toBe('tab=services&product=abc&page=2');
    expect(withCustomerPage(new URLSearchParams('page=5'), 1).get('page')).toBe('1');
  });

  it('resets each filtered list to page one and keeps category and tab totals unpaginated', () => {
    expect(shopSource).toContain('setSearch(event.target.value); resetPage();');
    expect(shopSource).toContain('setSort(event.target.value); resetPage();');
    expect(shopSource).toContain("item === 'All' ? products.length");
    expect(servicesSource).toContain('setSearch(event.target.value); resetPage();');
    expect(servicesSource).toContain('modeServices.length');
    expect(purchasesSource).toContain('setStatusFilter(event.target.value); resetPage();');
    expect(purchasesSource).toContain('recordsForPurchaseTab(records, tab).length');
    expect(purchasesSource).toContain('totalItems={visibleRecords.length}');
  });

  it('renders the shared bar after each corresponding customer list', () => {
    expect(shopSource.indexOf('className="product-grid" ref={productsListRef}'))
      .toBeLessThan(shopSource.indexOf('label="Products"'));
    expect(servicesSource.indexOf('className="service-card-grid" ref={servicesListRef}'))
      .toBeLessThan(servicesSource.indexOf('label="Services"'));
    expect(purchasesSource.indexOf('records={pageRecords}'))
      .toBeLessThan(purchasesSource.indexOf('label="Purchases and bookings"'));
  });

  it('aligns the bar responsively and scrolls page changes with reduced-motion support', () => {
    expect(paginationStyles).toContain('width: 100%;\n  box-sizing: border-box;');
    expect(paginationStyles).toContain('margin: 24px 0;');
    expect(paginationStyles).toContain('.customer-pagination-region {\n    align-items: center;\n    flex-direction: column;');
    expect(paginationStyles).toContain('.customer-pagination-compact {\n    display: flex;\n    width: min(100%, 360px);\n    justify-content: center;');
    expect(paginationHookSource).toContain("behavior: reducedMotion ? 'auto' : 'smooth'");
    expect(paginationHookSource).toContain("block: 'start'");
  });
});