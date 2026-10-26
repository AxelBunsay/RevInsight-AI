import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const ServiceRequest = require('../models/serviceRequest');
const ReservationSettings = require('../models/reservationSettings');
const BusinessRecord = require('../models/businessRecord');
const serviceRequests = require('../controllers/serviceRequestController');
const { ensureCustomerUnpaidBookingLimit } = require('../controllers/customerServiceController');

const requestId = '507f1f77bcf86cd799439011';
const mechanicId = '507f1f77bcf86cd799439012';

const mockSession = () => ({
  withTransaction: async (callback) => callback(),
  endSession: vi.fn().mockResolvedValue(undefined)
});

const makeResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis()
});

afterEach(() => vi.restoreAllMocks());

describe('service booking hardening', () => {
  it.each([
    { status: 'assigned', nextStatus: 'in-progress' },
    { status: 'in-progress', nextStatus: 'completed' }
  ])('blocks unpaid $nextStatus transitions', async ({ status, nextStatus }) => {
    const session = mockSession();
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    vi.spyOn(ServiceRequest, 'findById').mockReturnValue({
      session: async () => ({ _id: requestId, status, paymentStatus: 'Payment Pending', mechanic: mechanicId })
    });
    const update = vi.spyOn(ServiceRequest, 'findOneAndUpdate');

    await expect(serviceRequests.transitionServiceRequestStatus({
      requestId,
      mechanicId,
      status: nextStatus
    })).rejects.toMatchObject({ status: 409, message: 'Payment is not confirmed yet.' });

    expect(update).not.toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalledOnce();
  });

  it('blocks admin completion and reopening completed bookings', async () => {
    const completedResponse = makeResponse();
    await serviceRequests.updateBookingStatus({
      body: { requestId, status: 'completed' },
      admin: { id: mechanicId }
    }, completedResponse);
    expect(completedResponse.status).toHaveBeenCalledWith(400);
    expect(completedResponse.json).toHaveBeenCalledWith({
      message: 'Only the assigned mechanic can complete a booking.'
    });

    const session = mockSession();
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    vi.spyOn(ServiceRequest, 'findById').mockReturnValue({
      session: async () => ({ status: 'completed' })
    });
    const reopenResponse = makeResponse();
    await serviceRequests.updateBookingStatus({
      body: { requestId, status: 'accepted' },
      admin: { id: mechanicId }
    }, reopenResponse);
    expect(reopenResponse.status).toHaveBeenCalledWith(409);
    expect(reopenResponse.json).toHaveBeenCalledWith({
      message: 'A completed booking cannot be changed.'
    });
  });

  it('deletes a service BusinessRecord when the admin cancels a booking', async () => {
    const session = mockSession();
    const booking = {
      _id: requestId,
      status: 'accepted',
      paymentStatus: 'Payment Pending',
      save: vi.fn().mockResolvedValue(undefined)
    };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    vi.spyOn(ServiceRequest, 'findById').mockReturnValue({ session: async () => booking });
    const deleteRecord = vi.spyOn(BusinessRecord, 'deleteOne').mockResolvedValue({ deletedCount: 1 });
    const response = makeResponse();

    await serviceRequests.updateBookingStatus({
      body: { requestId, status: 'cancelled' },
      admin: { id: mechanicId }
    }, response);

    expect(booking.status).toBe('cancelled');
    expect(deleteRecord).toHaveBeenCalledWith(
      { recordType: 'service', sourceId: requestId },
      { session }
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('requires an admin refund decision before cancelling a confirmed service booking', async () => {
    const session = mockSession();
    const booking = {
      _id: requestId,
      status: 'accepted',
      paymentStatus: 'Confirmed',
      save: vi.fn()
    };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    vi.spyOn(ServiceRequest, 'findById').mockReturnValue({ session: async () => booking });
    const response = makeResponse();

    await serviceRequests.updateBookingStatus({
      body: { requestId, status: 'cancelled' },
      admin: { id: mechanicId },
      user: { id: mechanicId }
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Choose whether the service payment was refunded or forfeited.'
    });
    expect(booking.save).not.toHaveBeenCalled();
  });

  it('does not create service revenue for a completed booking without confirmed payment', async () => {
    const createRecord = vi.spyOn(BusinessRecord, 'findOneAndUpdate');
    await expect(serviceRequests.syncCompletedServiceBusinessRecord({
      status: 'completed',
      paymentStatus: 'Payment Pending'
    })).resolves.toBeNull();
    expect(createRecord).not.toHaveBeenCalled();
  });

  it('expires an unpaid pending booking past its deadline', async () => {
    const session = mockSession();
    const booking = {
      _id: requestId,
      status: 'pending',
      paymentStatus: 'Payment Pending',
      paymentDueAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 3_600_000),
      save: vi.fn().mockResolvedValue(undefined)
    };
    vi.spyOn(ReservationSettings, 'getDefaults').mockResolvedValue({ pendingPaymentHours: 24 });
    vi.spyOn(ServiceRequest, 'find').mockReturnValue({
      select: () => ({ limit: async () => [{ _id: requestId }] })
    });
    vi.spyOn(ServiceRequest, 'findOne').mockReturnValue({ session: async () => booking });
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session);
    const deleteRecord = vi.spyOn(BusinessRecord, 'deleteOne').mockResolvedValue({ deletedCount: 0 });

    await serviceRequests.expireServiceBookings();

    expect(booking.status).toBe('cancelled');
    expect(booking.cancelReason).toBe('The payment deadline passed.');
    expect(booking.save).toHaveBeenCalledWith({ session });
    expect(deleteRecord).toHaveBeenCalledWith(
      { recordType: 'service', sourceId: requestId },
      { session }
    );
  });

  it('rejects a fourth active unpaid booking for a customer', async () => {
    vi.spyOn(ServiceRequest, 'countDocuments').mockReturnValue({
      session: vi.fn().mockResolvedValue(3)
    });

    await expect(ensureCustomerUnpaidBookingLimit(requestId, mockSession()))
      .rejects.toMatchObject({
        status: 409,
        message: expect.stringContaining('up to 3 active unpaid service bookings')
      });
  });
});
