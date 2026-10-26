import { describe, expect, it } from 'vitest';
import { makeDashboardData } from './adminApi';

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
      lowItems: [{ id: 'low', name: 'Low', quantity: 9 }]
    });
    expect(result.badges.lowStock).toBe(1);
  });
});
