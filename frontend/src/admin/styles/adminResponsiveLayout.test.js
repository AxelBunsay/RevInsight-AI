import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const layoutStyles = readSource('./layout.css');
const managementStyles = readSource('./management.css');
const dashboardStyles = readSource('./dashboard.css');
const transactionsPage = readSource('../pages/Transactions.jsx');
const adminLayout = readSource('../layouts/AdminLayout.jsx');
const dashboardPage = readSource('../pages/Dashboard.jsx');

describe('admin responsive layout styles', () => {
  it('lets shared admin pages fill the main area with responsive side padding', () => {
    expect(layoutStyles).toContain('padding: 24px clamp(16px, 2.5vw, 40px)');
    expect(layoutStyles).toContain('max-width: 1800px');
    expect(layoutStyles).toContain('.admin-root .admin-page,\n.admin-root .admin-management-page {');
  });

  it('keeps the transactions table inside a dedicated small-screen scroller', () => {
    expect(transactionsPage).toContain('className="transactions-table-scroll"');
    expect(managementStyles).toContain('@media (max-width: 1024px) {\n  .admin-root .admin-management-page .transactions-table-scroll {\n    overflow-x: auto;');
    expect(managementStyles).toContain('-webkit-overflow-scrolling: touch;');
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

  it('places the dashboard heading and notification controls in one top row', () => {
    expect(adminLayout).toContain("pathname === '/admin/dashboard'");
    expect(adminLayout).toContain('admin-topbar--dashboard');
    expect(adminLayout).toContain('admin-page-heading admin-topbar-heading');
    expect(dashboardPage).not.toContain('admin-page-heading');
    expect(layoutStyles).toContain('.admin-root .admin-topbar--dashboard {\n  justify-content: space-between;');
    expect(layoutStyles).toContain('.admin-root .admin-topbar-heading {\n  flex: 1 1 auto;\n  align-self: center;');
    expect(layoutStyles).toContain('.admin-root .admin-topbar-heading p {\n  white-space: nowrap;');
    expect(layoutStyles).toContain('.admin-root .admin-topbar--dashboard .admin-topbar-label {\n    display: none;');
  });
});
