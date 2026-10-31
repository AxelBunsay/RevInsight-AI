import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import TransactionCards from './TransactionCards';
import { getShortTransactionId } from './transactionCardData';

describe('transaction cards', () => {
  it('renders the same customer, amount, status, payment method, and service details as the table data', () => {
    const records = [
      {
        id: 'RSV-0001',
        _id: 'reservation-full-id-0001',
        customer: 'A very long customer name that can wrap safely',
        date: '10/31/2026',
        items: 'Brake pads × 2',
        amount: 1250,
        paid: 375,
        balance: 875,
        status: 'Payment Submitted',
        paymentMethod: 'GCash',
        mechanic: 'N/A',
        recordType: 'product'
      },
      {
        id: 'service-request-long-identifier-12345678',
        _id: 'service-request-long-identifier-12345678',
        customer: 'Customer Two',
        date: '10/30/2026',
        items: 'Tune-up · 2 motorcycles',
        amount: 3000,
        paid: 900,
        balance: 2100,
        status: 'Confirmed',
        mechanic: 'Alex Mechanic',
        recordType: 'service'
      }
    ];
    const markup = renderToStaticMarkup(createElement(TransactionCards, {
      transactions: records,
      activeTab: 'items',
      isLoading: false,
      emptyMessage: 'No transactions.',
      onView: vi.fn()
    }));

    expect(markup).toContain('A very long customer name that can wrap safely');
    expect(markup).toContain('₱1,250.00');
    expect(markup).toContain('Payment Submitted');
    expect(markup).toContain('GCash');
    expect(markup).toContain('Brake pads × 2');
    expect(markup).toContain('Tune-up · 2 motorcycles');
    expect(markup).toContain('Mechanic: Alex Mechanic');
    expect(markup).toContain('RSV-0001');
    expect(markup).toContain('ID 12345678');
    expect(markup).toContain('aria-label="View details for A very long customer name that can wrap safely"');
    expect(markup).toContain('Full record ID: reservation-full-id-0001');
  });

  it('uses the short code when available and otherwise keeps the tail of a long id', () => {
    expect(getShortTransactionId({ code: 'RSV-0001', id: 'reservation-id' })).toBe('RSV-0001');
    expect(getShortTransactionId({ id: 'record-with-a-long-id-12345678' })).toBe('12345678');
  });

  it('distinguishes item and service records on the All tab and matches service payment placeholders', () => {
    const markup = renderToStaticMarkup(createElement(TransactionCards, {
      transactions: [
        { id: 'item-1', customer: 'Item customer', items: 'Oil filter × 1', amount: 25, paid: 25, balance: 0, status: 'completed', recordType: 'product' },
        { id: 'service-1', customer: 'Service customer', items: 'Tune-up · 2 motorcycles', amount: 1800, paid: 500, balance: 1300, status: 'Confirmed', recordType: 'service', mechanic: 'Alex' }
      ],
      activeTab: 'all',
      isLoading: false,
      emptyMessage: 'No transactions.',
      onView: vi.fn()
    }));

    expect(markup).toContain('>Item</span>');
    expect(markup).toContain('>Service</span>');
    expect(markup).toContain('Mechanic: Alex');
    expect(markup).toContain('Down payment paid</span><strong>—');
    expect(markup).toContain('Balance to collect</span><strong>—');
  });

  it('shows service quantity, mechanic, payment status, and item payment reference in their tabs', () => {
    const serviceMarkup = renderToStaticMarkup(createElement(TransactionCards, {
      transactions: [{
        id: 'service-1', customer: 'Service customer', items: 'Tune-up · 2 motorcycles', amount: 1800,
        paid: 500, balance: 1300, status: 'Confirmed', paymentStatus: 'Payment Submitted',
        paymentReference: 'PAY-12345', mechanic: 'Morgan', recordType: 'service', isServiceRequest: true,
        servicePriceTotal: 1500, mechanicFeeTotal: 300, estimatedPrice: 1800
      }],
      activeTab: 'services', isLoading: false, emptyMessage: 'No services.', onView: vi.fn()
    }));
    const itemMarkup = renderToStaticMarkup(createElement(TransactionCards, {
      transactions: [{
        id: 'RSV-0002', customer: 'Item customer', items: 'Battery × 1', amount: 950,
        paid: 285, balance: 665, status: 'Reserved', paymentMethod: 'GCash',
        paymentReference: 'GCASH-123', bookingStatus: 'Reserved', recordType: 'product'
      }],
      activeTab: 'items', isLoading: false, emptyMessage: 'No items.', onView: vi.fn()
    }));

    expect(serviceMarkup).toContain('Tune-up · 2 motorcycles');
    expect(serviceMarkup).toContain('Mechanic: Morgan');
    expect(serviceMarkup).toContain('Payment: Payment Submitted');
    expect(serviceMarkup).toContain('Ref PAY-12345');
    expect(serviceMarkup).toContain('Amount</span><strong>₱1,800.00');
    expect(itemMarkup).toContain('Payment: GCash');
    expect(itemMarkup).toContain('Ref GCASH-123');
    expect(itemMarkup).toContain('Reservation status: Reserved');
  });
});