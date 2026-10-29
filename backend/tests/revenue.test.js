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
  projectNextQuarter,
  REVENUE_RISK_THRESHOLDS,
  getRevenueRiskLevel,
  calculateDashboardForecast,
  getCompletedQuarterRows,
  calculateRevenueRisk
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
      { _id: 'Parts', revenue: 100, percentage: 0 },
      { _id: 'Historical category', revenue: 60, percentage: 0 },
      { _id: 'Fluids', revenue: 20, percentage: 0 }
    ]);
    expect(groupRevenueContributors(entries)).toContainEqual({
      name: 'Brake service',
      revenue: 200,
      contributorType: 'Labor service'
    });
    expect(entries.find((entry) => entry.source === 'service').revenue).toBe(200);
    expect(entries.find((entry) => entry.source === 'reservation').category).toBe('Historical category');
  });

  it('groups completed reservation revenue by each item category without changing its total', () => {
    const entries = normalizeRevenueSources({
      reservations: [{
        _id: 'reservation-categories',
        completedAt: new Date('2026-03-01T04:00:00.000Z'),
        total: 150,
        items: [
          { productId: 'brake-pad', name: 'Brake pad', category: 'Brakes', lineTotal: 100, qty: 1 },
          { productId: 'spark-plug', name: 'Spark plug', category: 'Electrical', lineTotal: 50, qty: 1 }
        ]
      }],
      productCategories: {
        'brake-pad': 'Changed category',
        'spark-plug': 'Changed category'
      }
    });

    expect(groupRevenueByCategory(entries)).toEqual([
      { _id: 'Brakes', revenue: 100, percentage: 0 },
      { _id: 'Electrical', revenue: 50, percentage: 0 }
    ]);
    expect(entries.reduce((sum, entry) => sum + entry.revenue, 0)).toBe(150);
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

  it('classifies every risk threshold boundary consistently', () => {
    expect(getRevenueRiskLevel('qoqChange', -5)).toBe('Normal');
    expect(getRevenueRiskLevel('qoqChange', -5.001)).toBe('Moderate');
    expect(getRevenueRiskLevel('qoqChange', -15)).toBe('Moderate');
    expect(getRevenueRiskLevel('qoqChange', -15.001)).toBe('High');
    expect(getRevenueRiskLevel('concentrationHhi', 0.1499)).toBe('Normal');
    expect(getRevenueRiskLevel('concentrationHhi', 0.15)).toBe('Moderate');
    expect(getRevenueRiskLevel('concentrationHhi', 0.25)).toBe('Moderate');
    expect(getRevenueRiskLevel('concentrationHhi', 0.2501)).toBe('High');
    expect(getRevenueRiskLevel('topContributorShare', 39.99)).toBe('Normal');
    expect(getRevenueRiskLevel('topContributorShare', 40)).toBe('Moderate');
    expect(getRevenueRiskLevel('topContributorShare', 60)).toBe('Moderate');
    expect(getRevenueRiskLevel('topContributorShare', 60.01)).toBe('High');
    expect(getRevenueRiskLevel('forecastVsFourQuarterAverage', -10)).toBe('Normal');
    expect(getRevenueRiskLevel('forecastVsFourQuarterAverage', -10.001)).toBe('Moderate');
    expect(getRevenueRiskLevel('forecastVsFourQuarterAverage', -25)).toBe('Moderate');
    expect(getRevenueRiskLevel('forecastVsFourQuarterAverage', -25.001)).toBe('High');
    expect(REVENUE_RISK_THRESHOLDS).toMatchObject({
      minimumCompletedQuarters: 5,
      qoqChange: { normalMin: -5, moderateMin: -15 },
      concentrationHhi: { normalMaxExclusive: 0.15, moderateMaxInclusive: 0.25 },
      topContributorShare: { normalMaxExclusive: 40, moderateMaxInclusive: 60 },
      forecastVsFourQuarterAverage: { normalMin: -10, moderateMin: -25 }
    });
  });

  it('excludes uncategorized historical revenue from risk concentration and reports its overall share', () => {
    const entries = [
      { source: 'order', name: 'Historic sales', category: 'Uncategorized', contributorType: 'Uncategorized', revenue: 900 },
      { source: 'order', name: 'Pads', category: 'Brakes', contributorType: 'Brakes', revenue: 50 },
      { source: 'order', name: 'Oil', category: 'Fluids', contributorType: 'Fluids', revenue: 30 },
      { source: 'service', name: 'Tune-up', category: null, contributorType: 'Labor service', revenue: 20 }
    ];
    const quarters = Array.from({ length: 5 }, (_, index) => ({
      _id: { year: 2025 + Math.floor(index / 4), quarter: index % 4 + 1 },
      revenue: 1000
    }));
    const result = calculateRevenueRisk(entries, quarters, new Date('2027-01-15T00:00:00+08:00'));

    expect(result.totalRevenue).toBe(1000);
    expect(result.uncategorized).toEqual({ revenue: 900, share: 90 });
    expect(result.indicators.concentrationHhi.value).toBe(0.38);
    expect(result.indicators.topContributorShare.value).toBe(50);
    expect(result.riskByCategory.some((category) => category._id === 'Uncategorized')).toBe(false);
    expect(result.byCategory.some((category) => category._id === 'Uncategorized')).toBe(true);
    expect(result.overallRisk.level).toBe('High');
    expect(result.overallRisk.reason).toBe('revenue concentration (HHI)');
  });

  it('returns Not enough data before five completed quarters', () => {
    const result = calculateRevenueRisk([], [
      { _id: { year: 2026, quarter: 1 }, revenue: 100 },
      { _id: { year: 2026, quarter: 2 }, revenue: 120 },
      { _id: { year: 2026, quarter: 3 }, revenue: 90 },
      { _id: { year: 2026, quarter: 4 }, revenue: 110 }
    ], new Date('2027-01-15T00:00:00+08:00'));

    expect(result.completedQuarterCount).toBe(4);
    expect(result.overallRisk).toMatchObject({ level: 'Not enough data' });
    expect(Object.values(result.indicators).map((indicator) => indicator.level))
      .toEqual(['Not enough data', 'Not enough data', 'Not enough data', 'Not enough data']);
  });

  it('does not zero-fill missing completed quarters in the risk quarter series', () => {
    const quarters = getCompletedQuarterRows([
      { _id: { year: 2026, quarter: 1 }, revenue: 100 },
      { _id: { year: 2026, quarter: 3 }, revenue: 50 },
      { _id: { year: 2026, quarter: 4 }, revenue: 200 }
    ], new Date('2026-10-15T00:00:00+08:00'));

    expect(quarters.map((row) => [row._id.year, row._id.quarter, row.revenue]))
      .toEqual([[2026, 1, 100], [2026, 3, 50]]);
  });

  it('marks QoQ n/a across a quarter gap without treating the gap as a -100% drop', () => {
    const quarters = [
      { _id: { year: 2025, quarter: 1 }, revenue: 100 },
      { _id: { year: 2025, quarter: 2 }, revenue: 100 },
      { _id: { year: 2025, quarter: 3 }, revenue: 100 },
      { _id: { year: 2025, quarter: 4 }, revenue: 100 },
      { _id: { year: 2026, quarter: 1 }, revenue: 100 },
      { _id: { year: 2026, quarter: 3 }, revenue: 50 }
    ];
    const result = calculateRevenueRisk([
      { source: 'order', name: 'Parts', category: 'Brakes', contributorType: 'Brakes', revenue: 100 }
    ], quarters, new Date('2027-01-15T00:00:00+08:00'));

    expect(result.indicators.qoqChange).toMatchObject({
      value: null,
      level: 'Not enough data',
      reason: 'QoQ is n/a because the latest completed quarters are not consecutive.'
    });
    expect(result.indicators.qoqChange.value).not.toBe(-100);
    expect(result.overallRisk.reason).toBe('revenue concentration (HHI)');
  });

  it('excludes the in-progress quarter from forecast base, growth rates, and range', () => {
    const rows = [
      { _id: { year: 2025, quarter: 1 }, revenue: 100 },
      { _id: { year: 2025, quarter: 2 }, revenue: 110 },
      { _id: { year: 2025, quarter: 3 }, revenue: 121 },
      { _id: { year: 2025, quarter: 4 }, revenue: 133 },
      { _id: { year: 2026, quarter: 1 }, revenue: 146 },
      { _id: { year: 2026, quarter: 2 }, revenue: 1 }
    ];
    const now = new Date('2026-04-15T00:00:00+08:00');
    const withPartialQuarter = calculateDashboardForecast(rows, now);
    const withoutPartialQuarter = calculateDashboardForecast(rows.slice(0, -1), now);

    expect(withPartialQuarter).toEqual({
      ...withoutPartialQuarter,
      quarterToDate: { quarter: '2026 Q2', revenue: 1, percentElapsed: 15 }
    });
    expect(withPartialQuarter).toMatchObject({
      target: '2026 Q2',
      targetLabel: 'Forecast for 2026 Q2',
      baseRevenue: 146,
      expected: 160,
      low: 160,
      high: 160,
      growthRates: expect.arrayContaining([0.1]),
      quarterToDate: { quarter: '2026 Q2', revenue: 1, percentElapsed: 15 }
    });
    expect(withPartialQuarter.growthRates).toHaveLength(4);
    expect(withPartialQuarter.averageGrowthRate).toBeCloseTo(0.099229478, 7);
    expect(withPartialQuarter).not.toMatchObject({
      baseRevenue: 1,
      target: '2026 Q3'
    });
  });

  it('moves the forecast target forward when the in-progress quarter completes', () => {
    const quarters = [
      { _id: { year: 2025, quarter: 1 }, revenue: 100 },
      { _id: { year: 2025, quarter: 2 }, revenue: 110 },
      { _id: { year: 2025, quarter: 3 }, revenue: 121 },
      { _id: { year: 2025, quarter: 4 }, revenue: 133 },
      { _id: { year: 2026, quarter: 1 }, revenue: 146 },
      { _id: { year: 2026, quarter: 2 }, revenue: 160 },
      { _id: { year: 2026, quarter: 3 }, revenue: 176 }
    ];

    expect(calculateDashboardForecast(quarters, new Date('2026-07-15T00:00:00+08:00')))
      .toMatchObject({
        target: '2026 Q3',
        targetLabel: 'Forecast for 2026 Q3',
        baseRevenue: 160,
        quarterToDate: { quarter: '2026 Q3' }
      });
  });

  it('uses the corrected completed-quarter forecast in the forecast risk indicator', () => {
    const quarters = [
      { _id: { year: 2025, quarter: 1 }, revenue: 100 },
      { _id: { year: 2025, quarter: 2 }, revenue: 110 },
      { _id: { year: 2025, quarter: 3 }, revenue: 121 },
      { _id: { year: 2025, quarter: 4 }, revenue: 133 },
      { _id: { year: 2026, quarter: 1 }, revenue: 146 },
      { _id: { year: 2026, quarter: 2 }, revenue: 1 }
    ];
    const now = new Date('2026-04-15T00:00:00+08:00');
    const risk = calculateRevenueRisk([
      { source: 'order', name: 'Brake pads', category: 'Brakes', contributorType: 'Brakes', revenue: 100 }
    ], quarters, now);
    const forecast = calculateDashboardForecast(quarters, now);
    const expectedFourQuarterAverage = (110 + 121 + 133 + 146) / 4;

    expect(risk.officialForecast.expected).toBe(forecast.expected);
    expect(risk.indicators.forecastVsFourQuarterAverage.forecast).toBe(forecast.expected);
    expect(risk.indicators.forecastVsFourQuarterAverage.average).toBe(expectedFourQuarterAverage);
    expect(risk.indicators.forecastVsFourQuarterAverage.value)
      .toBeCloseTo((forecast.expected - expectedFourQuarterAverage) / expectedFourQuarterAverage * 100, 8);
  });
});
