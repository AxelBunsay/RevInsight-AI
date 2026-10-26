import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const Reservation = require('../models/orderingModels/reservation');
const ReservationSettings = require('../models/reservationSettings');
const ServiceRequest = require('../models/serviceRequest');
const controller = require('../controllers/reservationController');
const { cancelCustomerReservation, expireReservations } = controller;

const makeResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis()
});

function mockExpiryQuery(candidates = []) {
  vi.spyOn(Reservation, 'find').mockReturnValue({
    select: () => ({ limit: async () => candidates })
  });
  vi.spyOn(ReservationSettings, 'getDefaults').mockResolvedValue({ pendingPaymentHours: 24 });
  vi.spyOn(ServiceRequest, 'find').mockReturnValue({
    select: () => ({ limit: async () => [] })
  });
}

function mockSession() {
  return {
    withTransaction: async (callback) => callback(),
    endSession: vi.fn().mockResolvedValue(undefined)
  };
}

afterEach(() => vi.restoreAllMocks());

describe('reservation hardening', () => {
  it('continues expiring candidates when one candidate transaction fails', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const expiredReservation = {
      status: 'Pending Down Payment',
      paymentDueAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 3_600_000),
      save
    };
    vi.spyOn(Reservation, 'find').mockReturnValue({
      select: () => ({ limit: async () => [{ _id: 'bad-candidate' }, { _id: 'good-candidate' }] })
    });
    vi.spyOn(ReservationSettings, 'getDefaults').mockResolvedValue({ pendingPaymentHours: 24 });
    vi.spyOn(ServiceRequest, 'find').mockReturnValue({
      select: () => ({ limit: async () => [] })
    });
    vi.spyOn(Reservation, 'findOne').mockImplementation((query) => ({
      session: async () => query._id === 'good-candidate' ? expiredReservation : null
    }));
    vi.spyOn(mongoose, 'startSession')
      .mockResolvedValueOnce({
        withTransaction: async () => { throw new Error('candidate failed'); },
        endSession: vi.fn().mockResolvedValue(undefined)
      })
      .mockResolvedValueOnce(mockSession());
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(expireReservations()).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('failed to expire reservation bad-candidate'),
      expect.any(Error)
    );
    expect(save).toHaveBeenCalledOnce();
    expect(expiredReservation.status).toBe('Expired');
  });

  it('returns the specific conflict message when payment is under review', async () => {
    mockExpiryQuery();
    const current = { status: 'Payment Submitted' };
    const session = mockSession();
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    vi.spyOn(Reservation, 'findOneAndUpdate').mockResolvedValue(null);
    vi.spyOn(Reservation, 'findOne').mockReturnValue({ session: async () => current });
    const res = makeResponse();

    await cancelCustomerReservation({
      params: { id: '507f1f77bcf86cd799439011' },
      user: { userId: '507f1f77bcf86cd799439012' },
      body: {}
    }, res);

    expect(Reservation.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'Pending Down Payment' }),
      expect.any(Object),
      expect.objectContaining({ session })
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'The shop is reviewing your payment. Contact the shop to cancel.'
    });
  });

  it('cancels pending down payment with an expected-status conditional update', async () => {
    mockExpiryQuery();
    const cancelled = {
      toObject: () => ({ status: 'Cancelled', paymentSubmissions: [] })
    };
    const session = mockSession();
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    const findOneAndUpdate = vi.spyOn(Reservation, 'findOneAndUpdate').mockResolvedValue(cancelled);
    const res = makeResponse();

    await cancelCustomerReservation({
      params: { id: '507f1f77bcf86cd799439011' },
      user: { userId: '507f1f77bcf86cd799439012' },
      body: { reason: 'Changed my mind' }
    }, res);

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: '507f1f77bcf86cd799439011',
        customerId: '507f1f77bcf86cd799439012',
        status: 'Pending Down Payment'
      }),
      { $set: expect.objectContaining({ status: 'Cancelled', cancelReason: 'Changed my mind' }) },
      expect.objectContaining({ new: true, session })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, reservation: { status: 'Cancelled' } });
  });
});
