import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharedInventory = require('../../shared/inventory.json');
const {
  PRODUCT_CATEGORIES,
  normalizeProductCategory
} = require('../utils/productCategories');
const { validateProductInput } = require('../utils/inventoryValidation');
const { canonicalMatch, main } = require('../scripts/normalizeCategories');

describe('product categories', () => {
  it('uses the shared canonical category list', () => {
    expect(PRODUCT_CATEGORIES).toEqual([
      'Accessory',
      'Brakes',
      'Cables',
      'Electrical',
      'Engine Parts',
      'Oil & Fluids',
      'Seat Works',
      'Tires & Wheels'
    ]);
    expect(PRODUCT_CATEGORIES).toBe(sharedInventory.PRODUCT_CATEGORIES);
  });

  it('normalizes category matching without changing canonical spelling', () => {
    expect(normalizeProductCategory('  bRAkEs ')).toBe('Brakes');
    expect(normalizeProductCategory('oil & FLUIDS')).toBe('Oil & Fluids');
    expect(normalizeProductCategory('Accessories')).toBeNull();
  });

  it('rejects unknown categories with a category field error', () => {
    expect(validateProductInput({
      name: 'Brake part',
      price: 100,
      quantity: 1,
      category: 'Parts'
    })).toMatchObject({
      category: expect.stringContaining('Choose a category from: Accessory, Brakes')
    });
  });

  it('reports the migration match for a known legacy alias without applying it', () => {
    expect(canonicalMatch('Accessories')).toBe('Accessory');
    expect(canonicalMatch('BrAkEs')).toBe('Brakes');
    expect(canonicalMatch('Parts')).toBeNull();
  });

  it('refuses production migration runs unless both confirmation flags are present', async () => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(main([])).rejects.toThrow('Production requires both --apply and --yes.');
      await expect(main(['--apply'])).rejects.toThrow('Production requires both --apply and --yes.');
      await expect(main(['--yes'])).rejects.toThrow('Production requires both --apply and --yes.');
    } finally {
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
    }
  });
});
