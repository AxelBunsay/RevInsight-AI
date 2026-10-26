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
});
