import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Product = require('../models/product');

const makeProduct = (variants) => new Product({
  name: 'Variant validation part',
  price: 100,
  quantity: 0,
  category: 'Accessory',
  variants
});

describe('product variants', () => {
  it('generates labels from fitment, size, and color attributes', async () => {
    const product = makeProduct([
      { brand: 'Yamaha', model: 'YTX 125', color: 'Red', price: 1, stock: 2 },
      { color: 'Black', size: '70/90-17', price: 50, stock: 1 },
      { size: '1 L', price: 90, stock: 0 }
    ]);

    await expect(product.validate()).resolves.toBeUndefined();
    expect(product.variants.map((variant) => variant.label)).toEqual([
      'Yamaha YTX 125 - Red',
      'Black / 70/90-17',
      '1 L'
    ]);
    expect(product.quantity).toBe(3);
  });

  it('rejects duplicate attribute combinations regardless of case', async () => {
    const product = makeProduct([
      { brand: 'Honda', model: 'TMX 125', price: 100, stock: 1 },
      { brand: 'honda', model: 'tmx 125', price: 100, stock: 1 }
    ]);

    await expect(product.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        variants: expect.objectContaining({
          message: expect.stringContaining('must be unique')
        })
      })
    });
  });

  it('requires a variant attribute and nonnegative whole-number stock', async () => {
    const product = makeProduct([
      { price: 100, stock: 1.5 }
    ]);

    await expect(product.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        'variants.0.brand': expect.any(Object),
        'variants.0.stock': expect.any(Object)
      })
    });
  });

  it('rejects a variant price below 0.01', async () => {
    const product = makeProduct([
      { color: 'Black', price: 0, stock: 1 }
    ]);

    await expect(product.validate()).rejects.toMatchObject({
      errors: expect.objectContaining({
        'variants.0.price': expect.any(Object)
      })
    });
  });
});
