import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PendingUser = require('../models/pendingUser');
const Order = require('../models/orderingModels/order');
const Admin = require('../models/adminModels/admin');
const { chat } = require('../controllers/aichatController/chatController');
const { login } = require('../controllers/adminControllers/adminController');
const { updateTransaction } = require('../controllers/adminControllers/dashboardController');

const makeResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis()
});

describe('security hardening', () => {
  afterEach(() => vi.restoreAllMocks());

  it('defaults pending OTP attempt tracking', () => {
    const pendingUser = new PendingUser({
      email: 'customer@example.test',
      password: 'hashed',
      firstName: 'Customer',
      lastName: 'Test',
      phoneNumber: '09123456789',
      otp: { code: '123456', expiresAt: new Date(Date.now() + 60_000) }
    });

    expect(pendingUser.otp.attempts).toBe(0);
    expect(pendingUser.otp.lastSentAt).toBeInstanceOf(Date);
  });

  it('rejects oversized AI chat messages before calling Gemini', async () => {
    const res = makeResponse();

    await chat({ body: { message: 'm'.repeat(501) } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Message must be 500 characters or fewer.' });
  });

  it('returns 401 for invalid admin credentials', async () => {
    vi.spyOn(Admin, 'findOne').mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
    const res = makeResponse();

    await login({ body: { username: 'unknown', password: 'wrong' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid credentials' });
  });

  it('updates only a valid transaction status and ignores revenue fields', async () => {
    vi.spyOn(Order, 'findOneAndUpdate').mockResolvedValue({ _id: 'order-id', status: 'completed' });
    const res = makeResponse();

    await updateTransaction({
      params: { id: 'order-id' },
      body: { status: 'completed', totalPrice: 999999, items: [{ quantity: 999 }] }
    }, res);

    expect(Order.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'order-id', code: { $exists: false } },
      { $set: { status: 'completed' } },
      { new: true, runValidators: true }
    );
    expect(res.status).not.toHaveBeenCalledWith(500);
  });
});
