import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const {
  app,
  BusinessRecord,
  Order,
  Reservation,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  mockCloudinary,
  createFixtures,
  signAdmin
} = require('./helpers');
const api = supertest(app);

let fixtures;
let adminToken;

describe('admin item transactions integration', () => {
  beforeAll(async () => {
    await startReplicaSet();
  });

  afterAll(async () => {
    await stopReplicaSet();
  });

  beforeEach(async () => {
    await clearCollections();
    mockCloudinary();
    fixtures = await createFixtures();
    adminToken = signAdmin(fixtures.admin);
  });

  it('returns imported sales and one row per reservation with matching counts', async () => {
    const [order] = await Order.create([{
      customerName: 'Walk-in Customer',
      customerPhone: '09221234567',
      items: [{
        productId: fixtures.product._id,
        productName: 'Walk-in Brake Pad',
        category: 'Brakes',
        price: 500,
        quantity: 2
      }],
      totalPrice: 1000,
      status: 'completed'
    }]);
    const [reservation] = await Reservation.create([{
      code: 'ITEM-VIEW-COMPLETED',
      customerId: fixtures.customer._id,
      customerName: 'Casey Customer',
      customerPhone: '09171234567',
      items: [
        { productId: fixtures.product._id, name: 'Brake Cable', category: 'Cables', unitPrice: 100, qty: 1, lineTotal: 100 },
        { productId: fixtures.product._id, name: 'Brake Pad', category: 'Brakes', unitPrice: 200, qty: 1, lineTotal: 200 }
      ],
      status: 'Completed',
      total: 300,
      downPaymentPercent: 30,
      downPaymentAmount: 90,
      amountPaid: 300,
      balanceDue: 0
    }]);
    await BusinessRecord.create([
      {
        recordType: 'product',
        sourceId: order._id,
        customer: 'Walk-in Customer',
        customerPhone: '09221234567',
        itemName: 'Walk-in Brake Pad',
        amount: 1000,
        status: 'completed'
      },
      {
        recordType: 'product',
        sourceId: reservation._id,
        categoryKey: 'Cables',
        customer: 'Casey Customer',
        itemName: 'Brake Cable',
        amount: 100,
        status: 'completed'
      },
      {
        recordType: 'product',
        sourceId: reservation._id,
        categoryKey: 'Brakes',
        customer: 'Casey Customer',
        itemName: 'Brake Pad',
        amount: 200,
        status: 'completed'
      }
    ]);

    const response = await api.get('/api/dashboard/business-records?type=item&page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.filter((row) => row.isReservation)).toHaveLength(1);
    expect(response.body.data.find((row) => row.isReservation).code).toBe('ITEM-VIEW-COMPLETED');
    expect(response.body.data.some((row) => row.customer === 'Walk-in Customer')).toBe(true);
    expect(response.body.counts.items).toBe(response.body.data.length);
    expect(response.body.pagination.totalRecords).toBe(response.body.data.length);
    expect(response.body.totalAmount).toBe(1300);

    const sales = await api.get('/api/dashboard/business-records?type=item&itemView=sales&status=Completed')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sales.body.pagination.totalRecords).toBe(1);
    expect(sales.body.data[0].customer).toBe('Walk-in Customer');

    const reservations = await api.get('/api/dashboard/business-records?type=item&itemView=reservations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(reservations.body.pagination.totalRecords).toBe(1);
    expect(reservations.body.data[0].code).toBe('ITEM-VIEW-COMPLETED');
  });

  it('filters submitted reservations by payment status and customer phone', async () => {
    const [reservation] = await Reservation.create([{
      code: 'ITEM-VIEW-SUBMITTED',
      customerId: fixtures.customer._id,
      customerName: 'Casey Customer',
      customerPhone: '09171234567',
      items: [{ productId: fixtures.product._id, name: 'Brake Cable', category: 'Cables', unitPrice: 100, qty: 1, lineTotal: 100 }],
      status: 'Payment Submitted',
      total: 100,
      downPaymentPercent: 30,
      downPaymentAmount: 30,
      amountPaid: 0,
      balanceDue: 100,
      paymentReference: '123456789012'
    }]);

    const response = await api.get('/api/dashboard/business-records?type=item&itemView=reservations&status=Payment%20Submitted&search=09171234567')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]._id).toBe(String(reservation._id));
    expect(response.body.data[0].status).toBe('Payment Submitted');
    expect(response.body.pagination.totalRecords).toBe(1);
  });
});
