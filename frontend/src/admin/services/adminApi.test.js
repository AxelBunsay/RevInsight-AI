import { describe, expect, it } from 'vitest';
import { makeDashboardData, mapRevenueCardInsights } from './adminApi';

describe('admin inventory health', () => {
  it('uses available stock and the shared low-stock threshold', () => {
    const result = makeDashboardData({}, [], [
      { _id: 'low', name: 'Low', quantity: 15, reservedQty: 6 },
      { _id: 'healthy', name: 'Healthy', quantity: 20, reservedQty: 1 },
      { _id: 'out', name: 'Out', quantity: 4, reservedQty: 4 }
    ]);

    expect(result.inventoryHealth).toEqual({
      inStock: 1,
      low: 1,
      out: 1,
      lowItems: [
        { id: 'low', name: 'Low', quantity: 9 },
        { id: 'out', name: 'Out', quantity: 0 }
      ]
    });
    expect(result.badges.lowStock).toBe(2);
  });
});

describe('admin revenue card insight mapping', () => {
  it('maps all four server insight fields for every card key', () => {
    const card = {
      summary: 'Revenue changed.',
      recommendation: 'Review promotions.',
      ifFollowed: 'Stability may improve.',
      ifIgnored: 'Weakness may persist.'
    };
    const response = mapRevenueCardInsights({
      source: 'ai',
      insights: Object.fromEntries(['trend', 'risk', 'concentration', 'service', 'forecast'].map((key) => [key, card]))
    });

    expect(response.insights.trend).toEqual(card);
    expect(response.insights.forecast).toEqual(card);
    expect(response.source).toBe('ai');
  });
});
