import { describe, expect, it } from 'vitest';
import revenue from '../utils/revenue.js';

const {
  REVENUE_TIMEZONE,
  buildRevenuePipelines,
  getManilaDateParts,
  normalizeRevenueSources,
  groupRevenueByPeriod,
  summarizeRevenue,
  groupRevenueByCategory,
  groupRevenueContributors,
  projectNextQuarter
} = revenue;

const fixtures = {
  orders: [{
    _id: 'order-1',
    createdAt: new Date('2026-01-01T15:59:00.000Z'),
    totalPrice: 120,
    items: [
      { productId: 'product-brake', productName: 'Brake pads', category: 'Parts', price: 100, quantity: 1 },
      { productId: 'product-oil', productName: 'Engine oil', category: 'Fluids', price: 20, quantity: 1 }
    ]
  }],
  reservations: [{
    _id: 'reservation-1',
    completedAt: new Date('2026-01-01T16:30:00.000Z'),
    total: 60,
    items: [{
      productId: 'product-brake',
      name: 'Brake pads',
      category: 'Historical category',
      lineTotal: 60,
      unitPrice: 30,
      qty: 2
    }]
  }],
  services: [{
    _id: 'service-1',
    completedAt: new Date('2026-02-15T04:00:00.000Z'),
    estimatedPrice: 200,
    laborFee: 70,
    serviceType: 'Brake service'
  }],
  productCategories: { 'product-brake': 'Parts' }
};

describe('shared revenue helpers', () => {
  it('normalizes completed orders, reservations, and services using the shared amounts', () => {
    const entries = normalizeRevenueSources(fixtures);
    const summary = summarizeRevenue(entries);

    expect(summary).toEqual({
      totalSales: 380,
      totalOrders: 3,
      avgOrderValue: 380 / 3
    });
    expect(groupRevenueByCategory(entries)).toEqual([
      { _id: 'Services', revenue: 200, percentage: 0 },
      { _id: 'Parts', revenue: 160, percentage: 0 },
      { _id: 'Fluids', revenue: 20, percentage: 0 }
    ]);
    expect(groupRevenueContributors(entries)).toContainEqual({
      name: 'Brake service',
      revenue: 200,
      contributorType: 'Labor service'
    });
    expect(entries.find((entry) => entry.source === 'service').revenue).toBe(200);
    expect(entries.find((entry) => entry.source === 'reservation').category).toBe('Parts');
  });

  it('groups dates and quarters in Asia/Manila for sales around local midnight', () => {
    const entries = normalizeRevenueSources(fixtures);
    const daily = groupRevenueByPeriod(entries, 'date');
    const quarterly = groupRevenueByPeriod(entries, 'quarter');

    expect(REVENUE_TIMEZONE).toBe('Asia/Manila');
    expect(getManilaDateParts(fixtures.orders[0].createdAt)).toMatchObject({
      year: 2026,
      month: 1,
      day: 1,
      dateLabel: '2026-01-01'
    });
    expect(daily.find((row) => row._id === '2026-01-01')).toMatchObject({
      revenue: 120,
      count: 1
    });
    expect(daily.find((row) => row._id === '2026-01-02')).toMatchObject({
      revenue: 60,
      count: 1
    });
    expect(quarterly).toEqual([{ _id: { year: 2026, quarter: 1 }, revenue: 380, count: 3 }]);
  });

  it('uses Manila timezone operators and the specified date fields in source pipelines', () => {
    const pipelines = buildRevenuePipelines();
    const serialized = JSON.stringify(pipelines);

    expect(serialized).toContain('"timezone":"Asia/Manila"');
    expect(pipelines.orders[0].$match).toMatchObject({
      status: { $in: ['completed', 'Paid'] },
      code: { $exists: false }
    });
    expect(pipelines.reservations[0].$match).toMatchObject({
      status: 'Completed',
      code: { $exists: true }
    });
    expect(pipelines.services[0].$match).toMatchObject({ status: 'completed' });
    expect(pipelines.services[1].$project).toHaveProperty('revenue', '$estimatedPrice');
  });

  it('projects the next quarter from average historical quarter growth', () => {
    expect(projectNextQuarter([
      { _id: { year: 2025, quarter: 3 }, revenue: 100 },
      { _id: { year: 2025, quarter: 4 }, revenue: 200 }
    ])).toEqual([{
      _id: { year: 2026, quarter: 1 },
      revenue: 400,
      isProjection: true
    }]);
    expect(projectNextQuarter([])).toEqual([]);
  });
});
