import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const layoutStyles = readSource('./layout.css');
const managementStyles = readSource('./management.css');
const dashboardStyles = readSource('./dashboard.css');
const transactionsPage = readSource('../pages/Transactions.jsx');

describe('admin responsive layout styles', () => {
  it('lets shared admin pages fill the main area with responsive side padding', () => {
    expect(layoutStyles).toContain('padding: 24px clamp(16px, 2.5vw, 40px)');
    expect(layoutStyles).toContain('max-width: 1800px');
    expect(layoutStyles).toContain('.admin-root .admin-page,\n.admin-root .admin-management-page {');
  });

  it('keeps the transactions table inside a dedicated small-screen scroller', () => {
    expect(transactionsPage).toContain('className="transactions-table-scroll"');
    expect(managementStyles).toContain('@media (max-width: 1099px)');
    expect(managementStyles).toContain('.admin-root .admin-management-page .transactions-table-scroll {\n      overflow-x: auto');
    expect(managementStyles).toContain('.transactions-container {\n  overflow-x: visible');
  });

  it('assigns wrapping and non-wrapping transaction columns explicitly', () => {
    expect(managementStyles).toContain('.transactions-table .transaction-col-id,');
    expect(managementStyles).toContain('min-width: 180px;\n  white-space: nowrap;');
    expect(managementStyles).toContain('min-width: 100px;\n  white-space: normal;');
  });

  it('allows dashboard panels to grow into available width', () => {
    expect(dashboardStyles).toContain('repeat(auto-fit, minmax(min(100%, 320px), 1fr))');
    expect(dashboardStyles).toContain('repeat(auto-fit, minmax(min(100%, 350px), 1fr))');
    expect(dashboardStyles).toContain('.admin-sales-chart__canvas');
  });
});
