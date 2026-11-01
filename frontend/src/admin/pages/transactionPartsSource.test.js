import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getPartsSourceExportValue, getPartsSourceQuery, SERVICE_TRANSACTION_EXPORT_HEADERS } from './transactionPartsSource';

const transactionsSource = readFileSync(new URL('./Transactions.jsx', import.meta.url), 'utf8');

describe('admin transaction parts source', () => {
  it('maps the Services filter to no filter, shop, or customer request values', () => {
    expect(getPartsSourceQuery('All')).toBe('');
    expect(getPartsSourceQuery('shop')).toBe('shop');
    expect(getPartsSourceQuery('customer')).toBe('customer');
  });

  it('exports a Parts source column and defaults legacy service rows to shop', () => {
    expect(SERVICE_TRANSACTION_EXPORT_HEADERS).toContain('Parts source');
    expect(getPartsSourceExportValue({ recordType: 'service', partsSource: 'customer' })).toBe('customer');
    expect(getPartsSourceExportValue({ recordType: 'service' })).toBe('shop');
    expect(getPartsSourceExportValue({ recordType: 'product' })).toBe('');
  });

  it('shows the Services-only filter, resets pagination, and passes its value to both service sources', () => {
    expect(transactionsSource).toContain('aria-label="Parts source"');
    expect(transactionsSource).toMatch(/setPartsSourceFilter\(event.target.value\);\s*setPage\(1\);/);
    expect(transactionsSource).toContain('partsSource,');
    expect(transactionsSource).toContain('activeOnly: true');
    expect(transactionsSource).toContain('getPartsSourceExportValue(transaction)');
  });
});