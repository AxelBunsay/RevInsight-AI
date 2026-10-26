import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Product = require('../models/product');
const dashboardController = require('../controllers/adminControllers/dashboardController');

describe('inventory report', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses available stock for low-stock counts and values active products only', async () => {
    vi.spyOn(Product, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { _id: 'low', name: 'Low stock', quantity: 15, reservedQty: 6 },
        { _id: 'healthy', name: 'Healthy', quantity: 25, reservedQty: 2 },
        { _id: 'out', name: 'Reserved out', quantity: 4, reservedQty: 4 }
      ])
    });
    const aggregate = vi.spyOn(Product, 'aggregate').mockResolvedValue([{ totalValue: 1200 }]);
    const response = { json: vi.fn(), status: vi.fn().mockReturnThis() };

    await dashboardController.getInventoryReport({}, response);

    expect(aggregate.mock.calls[0][0][0]).toEqual({ $match: { isActive: { $ne: false } } });
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: {
        lowStockItems: [{ _id: 'low', name: 'Low stock', quantity: 15, reservedQty: 6, available: 9 }],
        totalItems: 3,
        totalInventoryValue: 1200
      }
    });
  });
});
