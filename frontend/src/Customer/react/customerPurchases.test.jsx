import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PurchaseRecordList } from './MyPurchases';
import {
  filterPurchaseRecords,
  getLegacyCustomerPurchaseLink,
  getLegacyProfilePurchaseRedirect,
  getPurchaseTab,
  recordsForPurchaseTab
} from './customerPurchases';

const purchaseRecords = [
  {
    type: 'item',
    reference: 'RSV-0001',
    status: 'Reserved',
    value: {
      _id: 'item-1',
      code: 'RSV-0001',
      status: 'Reserved',
      total: 250,
      amountPaid: 125,
      balanceDue: 125,
      items: [{ productId: 'product-1', name: 'Brake Cable', qty: 1 }]
    }
  },
  {
    type: 'service',
    reference: 'SRV-0001',
    status: 'Payment Pending',
    prototype: false,
    value: {
      _id: 'service-1',
      code: 'SRV-0001',
      serviceType: 'Oil Change',
      scheduledDate: '2026-10-30',
      status: 'pending',
      paymentStatus: 'Payment Pending',
      estimatedPrice: 500,
      servicePriceTotal: 400,
      mechanicFeeTotal: 100
    }
  }
];
const appRoutes = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const customerFlowStyles = readFileSync(new URL('../styles/customer-flow.css', import.meta.url), 'utf8');
const sharedStyles = readFileSync(new URL('../styles/shared.css', import.meta.url), 'utf8');

describe('customer purchases page data and cards', () => {
  it('reads supported tabs from the URL and sends legacy Account tabs to matching lists', () => {
    expect(getPurchaseTab('?tab=items')).toBe('items');
    expect(getPurchaseTab('?tab=services')).toBe('services');
    expect(getPurchaseTab('?tab=unknown')).toBe('all');
    expect(getLegacyProfilePurchaseRedirect('?tab=reservations')).toBe('/my-purchases?tab=items');
    expect(getLegacyProfilePurchaseRedirect('?tab=bookings')).toBe('/my-purchases?tab=services');
    expect(getLegacyProfilePurchaseRedirect('?tab=profile')).toBeNull();
    expect(getLegacyCustomerPurchaseLink('/customer/profile?tab=reservations')).toBe('/my-purchases?tab=items');
    expect(getLegacyCustomerPurchaseLink('/customer/profile?tab=bookings')).toBe('/my-purchases?tab=services');
    expect(getLegacyCustomerPurchaseLink('/customer/reservations/123')).toBeNull();
    expect(appRoutes).toContain('getLegacyProfilePurchaseRedirect(location.search)');
    expect(appRoutes).toContain('path="/my-purchases" element={<CustomerAuthGuard><MyPurchases /></CustomerAuthGuard>}');
  });

  it('selects the matching records and filters by status and reference', () => {
    expect(recordsForPurchaseTab(purchaseRecords, 'items').map((record) => record.reference)).toEqual(['RSV-0001']);
    expect(recordsForPurchaseTab(purchaseRecords, 'services').map((record) => record.reference)).toEqual(['SRV-0001']);
    expect(filterPurchaseRecords(purchaseRecords, 'active', 'srv-')).toEqual([purchaseRecords[1]]);
    expect(filterPurchaseRecords(purchaseRecords, 'completed', '')).toEqual([]);
    expect(filterPurchaseRecords([
      { reference: 'RSV-0002', status: 'Expired' },
      { reference: 'SRV-0002', status: 'Cancelled' }
    ], 'cancelled', '')).toHaveLength(2);
  });

  it('renders item and service lists with their type, reference, status, total, and details action', () => {
    const itemsMarkup = renderToStaticMarkup(
      <MemoryRouter><PurchaseRecordList records={recordsForPurchaseTab(purchaseRecords, 'items')} showType={false} /></MemoryRouter>
    );
    const servicesMarkup = renderToStaticMarkup(
      <MemoryRouter><PurchaseRecordList records={recordsForPurchaseTab(purchaseRecords, 'services')} showType={false} /></MemoryRouter>
    );
    const allMarkup = renderToStaticMarkup(
      <MemoryRouter><PurchaseRecordList records={purchaseRecords} showType /></MemoryRouter>
    );

    expect(itemsMarkup).toContain('RSV-0001');
    expect(itemsMarkup).toContain('View reservation');
    expect(servicesMarkup).toContain('SRV-0001');
    expect(servicesMarkup).toContain('View booking');
    expect(allMarkup).toContain('customer-purchase-type">Item');
    expect(allMarkup).toContain('customer-purchase-type">Service');
  });

  it('keeps the purchases layout and dropdown within the desktop and phone breakpoints', () => {
    expect(sharedStyles).toContain('.customer-page.orders-page');
    expect(customerFlowStyles).toContain('width: min(220px, calc(100vw - 24px));');
    expect(customerFlowStyles).toContain('min-width: min(180px, calc(100vw - 24px));');
    expect(customerFlowStyles).toContain('@media (max-width: 900px)');
    expect(customerFlowStyles).toContain('@media (max-width: 640px)');
    expect(customerFlowStyles).toContain('@media (max-width: 480px)');
    expect(customerFlowStyles).toContain('grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr));');
  });
});
