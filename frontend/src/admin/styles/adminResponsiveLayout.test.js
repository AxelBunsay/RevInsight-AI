import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const layoutStyles = readSource('./layout.css');
const managementStyles = readSource('./management.css');
const dashboardStyles = readSource('./dashboard.css');
const transactionsPage = readSource('../pages/Transactions.jsx');
const inventoryPage = readSource('../pages/Inventory.jsx');
const aiRevenueAnalysis = readSource('../components/dashboard/AIRevenueAnalysis.jsx');
const transactionsComponent = readSource('../pages/Transactions.jsx');
const adminLayout = readSource('../layouts/AdminLayout.jsx');
const dashboardPage = readSource('../pages/Dashboard.jsx');

describe('admin responsive layout styles', () => {
  it('lets shared admin pages fill the main area with responsive side padding', () => {
    expect(layoutStyles).toContain('padding: 24px clamp(16px, 2.5vw, 40px)');
    expect(layoutStyles).toContain('max-width: 1800px');
    expect(layoutStyles).toContain('.admin-root .admin-page,\n.admin-root .admin-management-page {');
  });

  it('uses transaction cards through tablet widths while preserving the desktop table', () => {
    expect(transactionsPage).toContain('className="transactions-table-scroll"');
    expect(transactionsPage).toContain('<TransactionCards');
    expect(managementStyles).toContain('.admin-root .admin-management-page .transaction-card-list {\n  display: none;');
    expect(managementStyles).toContain('@media (max-width: 1024px) {');
    expect(managementStyles).toContain('.admin-root .admin-management-page .transactions-table-scroll {\n    display: none;');
    expect(managementStyles).toContain('.admin-root .admin-management-page .transaction-card-list {\n    display: grid;');
    expect(managementStyles).toContain('.admin-root .admin-management-page .transactions-table-scroll {\n  width: 100%;');
    expect(managementStyles).not.toContain('min-width: 1050px;');
    expect(managementStyles).toContain('.transactions-container {\n  overflow-x: visible');
    expect(managementStyles).toContain('html:has(.admin-root.admin-root--drawer-layout)');
    expect(managementStyles).toContain('min-height: 44px;');
  });

  it('feeds the same filtered, paginated rows to the transaction cards and table', () => {
    expect(transactionsPage).toContain('transactions={transactions}');
    expect(transactionsPage).toContain('[activeTab, page, partsSourceFilter, refreshKey, search, statusFilter]');
    expect(transactionsPage).toContain('setSearch(event.target.value)');
    expect(transactionsPage).toContain('setStatusFilter(event.target.value)');
    expect(transactionsPage).toContain('transactions.map((transaction) => (');
    expect(transactionsComponent).toContain('selectedTransaction.partsSource === "customer" ? "Customer brings own parts" : "From the shop"');
    expect(transactionsComponent).toContain('selectedTransaction.partsSource === "customer" ? " (labor only)" : ""');
    expect(transactionsComponent).toContain('<p><strong>Mechanic fee:</strong> {formatMoney(selectedMechanicFee)}</p>');
    expect(transactionsComponent).toContain('<p><strong>Down payment paid:</strong> {formatMoney(selectedTransaction.paid)}</p>');
    expect(transactionsComponent).toContain('<p><strong>Balance to collect:</strong> {formatMoney(selectedTransaction.balance)}</p>');
  });

  it('switches inventory item and service tables to matching responsive cards', () => {
    expect(inventoryPage).toContain('aria-label="Inventory item cards"');
    expect(inventoryPage).toContain('aria-label="Service cards"');
    expect(inventoryPage).toContain('filteredItems.map((item) => (');
    expect(inventoryPage).toContain('visibleServiceRows.map((service) => (');
    expect(inventoryPage).toContain('className="inventory-table inventory-service-table"');
    expect(managementStyles).toContain('.admin-root .admin-management-page .inventory-container .inventory-table-scroll,');
  });

  it('shows dashboard report cards at tablet widths with 20-row pagination', () => {
    expect(aiRevenueAnalysis).toContain('reportRows.slice((reportCardPage - 1) * reportCardPageSize, reportCardPage * reportCardPageSize)');
    expect(aiRevenueAnalysis).toContain('const reportCardPageSize = 20;');
    expect(aiRevenueAnalysis).toContain('className="ai-revenue-report-card-list"');
    expect(dashboardStyles).toContain('@media (max-width: 1024px) {');
    expect(dashboardStyles).toContain('.admin-root .ai-revenue-report__table-wrap {\n    display: none;');
    expect(dashboardStyles).toContain('.admin-root .ai-revenue-report-card-list {\n    display: grid;');
    expect(dashboardStyles).toContain('.admin-root .ai-revenue-modal-layer .ai-revenue-modal {');
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
