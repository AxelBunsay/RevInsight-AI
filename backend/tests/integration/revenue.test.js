import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const {
  app,
  Order,
  Reservation,
  ServiceRequest,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  mockCloudinary,
  createFixtures,
  signAdmin
} = require('./helpers');

const api = supertest(app);
const currentQuarterStart = new Date('2026-10-25T12:00:00+08:00');
let fixtures;
let adminToken;

describe('revenue integration', () => {
  beforeAll(async () => {
    await startReplicaSet();
    mockCloudinary();
  }, 180000);

  afterAll(async () => {
    vi.useRealTimers();
    await stopReplicaSet();
  }, 180000);

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(currentQuarterStart);
    await clearCollections();
    fixtures = await createFixtures();
    adminToken = signAdmin(fixtures.admin);
  });

  async function createSalesFixtures() {
    const orderDate = new Date('2026-10-12T11:00:00+08:00');
    const reservationDate = new Date('2026-10-14T14:00:00+08:00');
    const serviceDate = new Date('2026-10-20T10:00:00+08:00');
    const [order] = await Order.create([{
      customerName: 'Legacy customer',
      customerPhone: '09171234567',
      items: [{
        productId: fixtures.product._id,
        productName: fixtures.product.name,
        category: fixtures.product.category,
        price: 1000,
        quantity: 2
      }],
      totalPrice: 2000,
      status: 'completed',
      createdAt: orderDate
    }]);
    const [reservation] = await Reservation.create([{
      code: 'REV-INTEGRATION-COMPLETE',
      customerId: fixtures.customer._id,
      customerName: 'Casey Customer',
      customerPhone: '09171234567',
      items: [{
        productId: fixtures.product._id,
        name: fixtures.product.name,
        unitPrice: 1000,
        qty: 1,
        lineTotal: 1000
      }],
      status: 'Completed',
      total: 1000,
      downPaymentPercent: 30,
      downPaymentAmount: 300,
      amountPaid: 1000,
      balanceDue: 0,
      completedAt: reservationDate
    }]);
    const [service] = await ServiceRequest.create([{
      user: fixtures.customer._id,
      customerId: fixtures.customer._id,
      serviceId: fixtures.service._id,
      serviceType: fixtures.service.name,
      description: 'Completed integration service',
      estimatedPrice: 2500,
      laborFee: 900,
      paymentStatus: 'Confirmed',
      status: 'completed',
      completedAt: serviceDate
    }]);
    return { order, reservation, service };
  }

  it('keeps dashboard, quarterly, sales report, and concentration totals consistent', async () => {
    await createSalesFixtures();

    const [dashboard, quarterly, report, concentration] = await Promise.all([
      api.get('/api/dashboard/dashboard').set('Authorization', `Bearer ${adminToken}`),
      api.get('/api/dashboard/dashboard/quarterly').set('Authorization', `Bearer ${adminToken}`),
      api.get('/api/dashboard/reports/sales').set('Authorization', `Bearer ${adminToken}`),
      api.get('/api/dashboard/analytics/revenue-concentration').set('Authorization', `Bearer ${adminToken}`)
    ]);

    expect(dashboard.status).toBe(200);
    expect(quarterly.status).toBe(200);
    expect(report.status).toBe(200);
    expect(concentration.status).toBe(200);
    const expectedTotal = 5500;
    expect(dashboard.body.data.totalRevenue).toBe(expectedTotal);
    expect(quarterly.body.data).toEqual([
      { _id: { year: 2026, quarter: 4 }, revenue: expectedTotal, count: 3 }
    ]);
    expect(report.body.data.totalSales).toBe(expectedTotal);
    expect(report.body.data.totalOrders).toBe(3);
    expect(concentration.body.data.totalRevenue).toBe(expectedTotal);
  });

  it('groups an 11:30 PM Manila sale into the correct local date, month, and quarter', async () => {
    vi.setSystemTime(new Date('2026-04-01T00:30:00+08:00'));
    const saleAt = new Date('2026-03-31T23:30:00+08:00');
    await Order.create({
      customerName: 'Late customer',
      customerPhone: '09171234567',
      items: [{ productId: fixtures.product._id, productName: fixtures.product.name, category: 'Brakes', price: 750, quantity: 1 }],
      totalPrice: 750,
      status: 'Paid',
      createdAt: saleAt
    });

    const [daily, monthly, quarterly] = await Promise.all([
      api.get('/api/dashboard/dashboard/daily').set('Authorization', `Bearer ${adminToken}`),
      api.get('/api/dashboard/dashboard/revenue').set('Authorization', `Bearer ${adminToken}`),
      api.get('/api/dashboard/dashboard/quarterly').set('Authorization', `Bearer ${adminToken}`)
    ]);

    expect(daily.status).toBe(200);
    expect(monthly.status).toBe(200);
    expect(quarterly.status).toBe(200);
    expect(daily.body.data).toContainEqual({ _id: '2026-03-31', revenue: 750, count: 1 });
    expect(monthly.body.data).toContainEqual({ _id: { year: 2026, month: 3 }, revenue: 750, count: 1 });
    expect(quarterly.body.data).toContainEqual({ _id: { year: 2026, quarter: 1 }, revenue: 750, count: 1 });
  });

  it('reports forfeited down payments separately without counting them as sales', async () => {
    await createSalesFixtures();
    await Reservation.create({
      code: 'REV-INTEGRATION-FORFEIT',
      customerId: fixtures.secondCustomer._id,
      customerName: 'Taylor Second',
      customerPhone: '09181234567',
      items: [{
        productId: fixtures.product._id,
        name: fixtures.product.name,
        unitPrice: 1000,
        qty: 1,
        lineTotal: 1000
      }],
      status: 'Cancelled',
      total: 1000,
      downPaymentPercent: 30,
      downPaymentAmount: 300,
      amountPaid: 300,
      balanceDue: 700,
      refundDecision: 'forfeited',
      refundDecisionAt: new Date('2026-10-22T10:00:00+08:00')
    });

    const [dashboard, report] = await Promise.all([
      api.get('/api/dashboard/dashboard').set('Authorization', `Bearer ${adminToken}`),
      api.get('/api/dashboard/reports/sales').set('Authorization', `Bearer ${adminToken}`)
    ]);

    expect(dashboard.status).toBe(200);
    expect(report.status).toBe(200);
    expect(dashboard.body.data.totalRevenue).toBe(5500);
    expect(report.body.data).toMatchObject({ totalSales: 5500, totalOrders: 3, forfeitedDownPayments: 300 });
  });

  it('ignores the in-progress quarter and reports insufficient data below five completed quarters', async () => {
    const quarterlyRevenue = [
      [2025, 3, 1200],
      [2025, 4, 1400],
      [2026, 1, 1600],
      [2026, 2, 1800],
      [2026, 3, 2000]
    ];
    for (const [year, quarter, amount] of quarterlyRevenue) {
      const month = (quarter - 1) * 3 + 1;
      await Order.create({
        customerName: 'Quarterly customer',
        customerPhone: '09171234567',
        items: [],
        totalPrice: amount,
        status: 'completed',
        createdAt: new Date(`${year}-${String(month).padStart(2, '0')}-15T12:00:00+08:00`)
      });
    }
    await Order.create({
      customerName: 'Current quarter customer',
      customerPhone: '09171234567',
      items: [],
      totalPrice: 9900,
      status: 'completed',
      createdAt: new Date('2026-10-10T12:00:00+08:00')
    });

    const sufficient = await api.get('/api/dashboard/analytics/projected-revenue')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(sufficient.status).toBe(200);
    expect(sufficient.body.data.insufficientData).toBe(false);
    expect(sufficient.body.data.availableQuarters).toBe(5);
    expect(sufficient.body.data.projection[0]._id).toEqual({ year: 2026, quarter: 4 });
    expect(sufficient.body.data.projection[0].revenue).not.toBe(9900);
    expect(sufficient.body.data.projection[0]).toMatchObject({
      targetLabel: 'Forecast for 2026 Q4',
      baseRevenue: 2000,
      quarterToDate: { quarter: '2026 Q4', revenue: 9900 }
    });

    await Order.deleteOne({ customerName: 'Quarterly customer', createdAt: new Date('2025-07-15T04:00:00.000Z') });
    const insufficient = await api.get('/api/dashboard/analytics/projected-revenue')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(insufficient.status).toBe(200);
    expect(insufficient.body.data.insufficientData).toBe(true);
    expect(insufficient.body.data.availableQuarters).toBeLessThan(5);
    expect(insufficient.body.data.projection).toEqual([]);
  });
});
