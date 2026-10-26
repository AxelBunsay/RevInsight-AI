import { describe, expect, it, vi } from 'vitest';
import validation from '../middleware/validate.js';

const { validateCustomerProfile, validateRegister, validateCreateMechanic } = validation;

function validateProfile(body) {
  const req = { body };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  };
  const next = vi.fn();
  validateCustomerProfile(req, res, next);
  return { res, next };
}

describe('customer profile phone validation', () => {
  it.each(['+63 947 188 6228', '09471886228', '9471886228'])(
    'accepts a Philippine mobile number in %s format',
    (phoneNumber) => {
      const { res, next } = validateProfile({ firstName: 'Alex', lastName: 'Rider', phoneNumber });
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-mobile phone number', () => {
    const { res, next } = validateProfile({ firstName: 'Alex', lastName: 'Rider', phoneNumber: '02 8123 4567' });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Enter a valid Philippine mobile number.' });
    expect(next).not.toHaveBeenCalled();
  });

  function runValidation(validator, body) {
    const req = { body };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();
    validator(req, res, next);
    return { res, next };
  }

  describe('registration credential validation', () => {
    it('requires a strong password and Philippine mobile number for registration', () => {
      const body = {
        email: 'rider@example.com',
        password: 'Password1',
        firstName: 'Alex',
        lastName: 'Rider',
        phoneNumber: '09171234567'
      };
      expect(runValidation(validateRegister, body).next).toHaveBeenCalledOnce();

      const invalidPhone = runValidation(validateRegister, { ...body, phoneNumber: '02 8123 4567' });
      expect(invalidPhone.res.status).toHaveBeenCalledWith(400);
      expect(invalidPhone.res.json).toHaveBeenCalledWith({
        message: 'Enter a valid Philippine mobile number.'
      });
    });

    it('requires an eight-character password with a letter and number for mechanic creation', () => {
      const body = {
        email: 'mechanic@example.com',
        password: 'short1',
        firstName: 'Alex',
        lastName: 'Rider',
        phoneNumber: '09171234567',
        specialization: 'general',
        yearsOfExperience: 1
      };
      const { res, next } = runValidation(validateCreateMechanic, body);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Password must be at least 8 characters and include a letter and a number.'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
