import { describe, expect, it } from 'vitest';
import Service from '../models/service.js';
import validation from '../utils/inventoryValidation.js';

const { validateServiceInput } = validation;

describe('service schema fields', () => {
  it('stores category and durationMinutes as top-level fields with legacy defaults', () => {
    const service = new Service({ name: 'Brake check', price: 250, mechanicFee: 100 });

    expect(Service.schema.path('category')).toBeDefined();
    expect(Service.schema.path('durationMinutes')).toBeDefined();
    expect(Service.schema.path('mechanicFee').options.validate.validator).toBeTypeOf('function');
    expect(service.category).toBe('General');
    expect(service.durationMinutes).toBe(60);
    expect(service.laborOnlyPrice).toBeNull();
    expect(service.pricePerUnit).toBe(false);
    expect(service.maxUnits).toBe(2);
    expect(service.scaleDuration).toBe(true);
  });

  it('retains the mechanic fee cannot exceed service price validator', async () => {
    const service = new Service({ name: 'Brake check', price: 250, mechanicFee: 300 });

    await expect(service.validate()).rejects.toThrow('Mechanic fee cannot be greater than the service price.');
  });

  it('validates the configured category and duration values', () => {
    expect(validateServiceInput({
      name: 'Brake check',
      description: '',
      price: 250,
      mechanicFee: 100,
      category: 'Maintenance',
      durationMinutes: 45
    })).toEqual({});
    expect(validateServiceInput({
      name: 'Brake check',
      description: '',
      price: 250,
      mechanicFee: 100,
      category: '',
      durationMinutes: 1.5
    })).toMatchObject({
      category: expect.any(String),
      durationMinutes: expect.any(String)
    });
  });

  it('validates optional unit pricing configuration', () => {
    expect(validateServiceInput({
      name: 'Bearing replacement',
      description: '',
      price: 150,
      mechanicFee: 50,
      category: 'Maintenance',
      durationMinutes: 60,
      pricePerUnit: true,
      unitLabel: 'wheel hub',
      maxUnits: 2,
      scaleDuration: true
    })).toEqual({});

    expect(validateServiceInput({
      name: 'Bearing replacement',
      description: '',
      price: 150,
      mechanicFee: 50,
      category: 'Maintenance',
      durationMinutes: 60,
      pricePerUnit: true,
      unitLabel: '',
      maxUnits: 11,
      scaleDuration: true
    })).toMatchObject({
      unitLabel: expect.any(String),
      maxUnits: expect.any(String)
    });
  });

  it('accepts empty labor-only pricing, including zero, and rejects invalid values', async () => {
    const base = {
      name: 'Brake check',
      description: '',
      price: 250,
      mechanicFee: 100,
      category: 'Maintenance',
      durationMinutes: 45
    };

    expect(validateServiceInput({ ...base, laborOnlyPrice: '' })).toEqual({});
    expect(validateServiceInput({ ...base, laborOnlyPrice: null })).toEqual({});
    expect(validateServiceInput({ ...base, laborOnlyPrice: 0 })).toEqual({});
    expect(validateServiceInput({ ...base, laborOnlyPrice: '125.50' })).toEqual({});
    expect(validateServiceInput({ ...base, laborOnlyPrice: -1 })).toHaveProperty('laborOnlyPrice');
    expect(validateServiceInput({ ...base, laborOnlyPrice: 'not a price' })).toHaveProperty('laborOnlyPrice');
    expect(validateServiceInput({ ...base, laborOnlyPrice: 1000000 })).toHaveProperty('laborOnlyPrice');

    const service = new Service({ name: 'Labor option', price: 250, laborOnlyPrice: 0 });
    await expect(service.validate()).resolves.toBeUndefined();
  });
});
