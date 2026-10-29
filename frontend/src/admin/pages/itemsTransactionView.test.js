import { describe, expect, it } from 'vitest';
import { getItemsPageData, getItemsRequest } from './itemsTransactionView';

describe('Items transactions view', () => {
  it('uses the filtered row count for the Items tab count', () => {
    const records = [
      { _id: 'sales-id', status: 'completed' },
      { _id: 'reservation-id', code: 'RES-100', isReservation: true, status: 'Payment Submitted' }
    ];
    const page = getItemsPageData({
      data: records,
      totalAmount: 1250,
      pagination: { totalRecords: 2, totalPages: 1 }
    }, (record) => record);

    expect(page.rows).toHaveLength(2);
    expect(page.totalRecords).toBe(page.rows.length);
  });

  it('requests submitted reservations when the Payment Submitted filter is selected', () => {
    const request = getItemsRequest({
      page: 1,
      limit: 10,
      statusFilter: 'Payment Submitted',
      search: '  09171234567  '
    });
    expect(request).toEqual({
      page: 1,
      limit: 10,
      type: 'item',
      itemView: 'reservations',
      status: 'Payment Submitted',
      search: '09171234567'
    });
    const page = getItemsPageData({
      data: [{ code: 'RES-SUBMITTED', isReservation: true, status: request.status }],
      pagination: { totalRecords: 1, totalPages: 1 }
    }, (record) => record);
    expect(page.rows).toMatchObject([{ isReservation: true, status: 'Payment Submitted' }]);
  });

  it('maps sales and all-reservation options to the matching server-side views', () => {
    expect(getItemsRequest({
      page: 1,
      statusFilter: 'Walk-in/Completed sales',
      search: ''
    })).toMatchObject({ type: 'item', itemView: 'sales', status: 'Completed' });
    expect(getItemsRequest({
      page: 1,
      statusFilter: 'Reservations (all)',
      search: ''
    })).toMatchObject({ type: 'item', itemView: 'reservations', status: '' });
  });
});
