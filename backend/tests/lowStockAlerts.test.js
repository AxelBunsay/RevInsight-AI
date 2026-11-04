import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Product = require('../models/product');
const Notification = require('../models/notification');
const { evaluateLowStockAlert } = require('../utils/lowStockAlerts');

const productId = '507f1f77bcf86cd799439011';
let product;
let notifications;

beforeEach(() => {
  product = {
    _id: productId,
    name: 'Handle grip',
    quantity: 20,
    reservedQty: 0,
    lowStockAlertState: 'ok'
  };
  notifications = [];
  vi.spyOn(Product, 'findById').mockImplementation(() => ({
    lean: async () => ({ ...product })
  }));
  vi.spyOn(Product, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
    const stateMatches = filter.$or
      ? filter.$or.some((condition) => {
        if (condition.lowStockAlertState === 'ok') return product.lowStockAlertState === 'ok';
        if (condition.lowStockAlertState === null) {
          return product.lowStockAlertState === null || product.lowStockAlertState === undefined;
        }
        return condition.lowStockAlertState.$exists === false && product.lowStockAlertState === undefined;
      })
      : product.lowStockAlertState === filter.lowStockAlertState;
    if (String(filter._id) !== String(product._id)
      || filter.quantity !== product.quantity
      || filter.reservedQty !== product.reservedQty
      || !stateMatches) return null;
    product.lowStockAlertState = update.$set.lowStockAlertState;
    return { ...product };
  });
  vi.spyOn(Notification, 'create').mockImplementation(async (notification) => {
    notifications.push(notification);
    return notification;
  });
});

afterEach(() => vi.restoreAllMocks());

describe('low stock alert evaluation', () => {
  it('creates one admin low-stock notification when available stock crosses the threshold', async () => {
    product.quantity = 9;
    await evaluateLowStockAlert(productId);

    expect(product.lowStockAlertState).toBe('low');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      audience: 'admin',
      type: 'low_stock',
      message: 'Handle grip is low on stock (9 left).',
      link: '/admin/inventory',
      recordId: productId,
      recordType: 'item'
    });
  });

  it('does not duplicate a low-stock notification while the product remains low', async () => {
    product.quantity = 9;
    await evaluateLowStockAlert(productId);
    product.quantity = 7;
    await evaluateLowStockAlert(productId);

    expect(notifications.filter((item) => item.type === 'low_stock')).toHaveLength(1);
  });

  it('creates an out-of-stock notification when available stock reaches zero', async () => {
    product.quantity = 9;
    await evaluateLowStockAlert(productId);
    product.quantity = 0;
    await evaluateLowStockAlert(productId);

    expect(product.lowStockAlertState).toBe('out');
    expect(notifications.map((item) => item.type)).toEqual(['low_stock', 'out_of_stock']);
    expect(notifications[1].message).toBe('Handle grip is out of stock.');
  });

  it('resets after restocking so a later low-stock drop alerts again', async () => {
    product.quantity = 9;
    await evaluateLowStockAlert(productId);
    product.quantity = 11;
    await evaluateLowStockAlert(productId);
    expect(product.lowStockAlertState).toBe('ok');
    product.quantity = 8;
    await evaluateLowStockAlert(productId);

    expect(notifications.map((item) => item.type)).toEqual(['low_stock', 'low_stock']);
    expect(product.lowStockAlertState).toBe('low');
  });
});
