import { describe, expect, it, vi } from 'vitest';
import validation from '../middleware/validate.js';

const { validateCustomerProfile, validateRegister, validateCreateMechanic } = validation;

async function validateProfile(body) {
  const req = { body };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  };
  const next = vi.fn();
  await validateCustomerProfile(req, res, next);
  return { res, next };
}

describe('customer profile phone validation', () => {
  it('accepts an 11-digit mobile number starting with 09', async () => {
    const { res, next } = await validateProfile({ firstName: 'Alex', lastName: 'Rider', phoneNumber: '09171234567' });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a number that does not start with 09', async () => {
    const { res, next } = await validateProfile({ firstName: 'Alex', lastName: 'Rider', phoneNumber: '12345' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Enter a valid mobile number (11 digits, starts with 09)' });
    expect(next).not.toHaveBeenCalled();
  });

  async function runValidation(validator, body) {
    const req = { body };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();
    await validator(req, res, next);
    return { res, next };
  }

  describe('registration credential validation', () => {
    it('requires a strong password and valid mobile number for registration', async () => {
      const body = {
        email: 'rider@example.com',
        username: 'alex_rider',
        password: 'Password1',
        firstName: 'Alex',
        lastName: 'Rider',
        phoneNumber: '09171234567'
      };
      expect((await runValidation(validateRegister, body)).next).toHaveBeenCalledOnce();

      const invalidPhone = await runValidation(validateRegister, { ...body, phoneNumber: '12345' });
      expect(invalidPhone.res.status).toHaveBeenCalledWith(400);
      expect(invalidPhone.res.json).toHaveBeenCalledWith({
        message: 'Enter a valid mobile number (11 digits, starts with 09)'
      });
    });

    it('requires an eight-character password with a letter and number for mechanic creation', async () => {
      const body = {
        username: 'mechanic.alex',
        email: 'mechanic@example.com',
        password: 'short1',
        firstName: 'Alex',
        lastName: 'Rider',
        phoneNumber: '09171234567',
        specialization: 'general',
        yearsOfExperience: 1
      };
      const { res, next } = await runValidation(validateCreateMechanic, body);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Password must be at least 8 characters and include a letter and a number.'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
