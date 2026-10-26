import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const {
  app,
  BusinessRecord,
  Product,
  ServiceRequest,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  mockCloudinary,
  createFixtures,
  signCustomer,
  signMechanic,
  signAdmin
} = require('./helpers');
const reservationController = require('../../controllers/reservationController');

const api = supertest(app);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=',
  'base64'
);
const serviceDate = '2026-10-27';

let fixtures;
let customerToken;
let secondCustomerToken;
let mechanicToken;
let adminToken;

function booking(serviceId, { date = serviceDate, startTime = '10:00', ...overrides } = {}) {
  return {
    serviceId: String(serviceId),
    date,
    startTime,
    vehicle: 'Integration motorcycle',
    notes: 'Integration booking',
    cartKey: `${date}-${startTime}`,
    ...overrides
  };
}

async function createBookings(token, bookings) {
  return api
    .post('/api/services/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ bookings });
}

async function createPaidBooking() {
  const created = await createBookings(customerToken, [booking(fixtures.service._id)]);
  expect(created.status).toBe(200);
  expect(created.body.results[0].ok).toBe(true);
  const requestId = created.body.results[0].serviceRequest._id;
  const payment = await api
    .post(`/api/service-requests/${requestId}/payment`)
    .set('Authorization', `Bearer ${customerToken}`)
    .field('reference', '9876543210')
    .attach('proof', png, { filename: 'service-receipt.png', contentType: 'image/png' });
  expect(payment.status).toBe(200);
  const confirmed = await api
    .post(`/api/admin/service-requests/${requestId}/confirm-payment`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(confirmed.status).toBe(200);
  return requestId;
}

describe('service booking business flow integration', () => {
  beforeAll(async () => {
    await startReplicaSet();
  });

  afterAll(async () => {
    await stopReplicaSet();
  });

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T09:00:00+08:00'));
    await clearCollections();
    mockCloudinary();
    fixtures = await createFixtures();
    customerToken = signCustomer(fixtures.customer);
    secondCustomerToken = signCustomer(fixtures.secondCustomer);
    mechanicToken = signMechanic(fixtures.mechanic);
    adminToken = signAdmin(fixtures.admin);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the configured service price and mechanic fee instead of client-supplied values', async () => {
    const response = await createBookings(customerToken, [
      booking(fixtures.service._id, { estimatedPrice: 1, laborFee: 0, serviceType: 'Forged service' })
    ]);

    expect(response.status).toBe(200);
    expect(response.body.results[0].ok).toBe(true);
    const requestId = response.body.results[0].serviceRequest._id;
    const persisted = await ServiceRequest.findById(requestId).lean();
    expect(persisted).toMatchObject({
      serviceType: fixtures.service.name,
      estimatedPrice: fixtures.service.price,
      laborFee: fixtures.service.mechanicFee
    });
  });

  it('rejects a second booking when the selected slot is at capacity', async () => {
    const first = await createBookings(customerToken, [booking(fixtures.service._id)]);
    expect(first.body.results[0].ok).toBe(true);

    const second = await createBookings(secondCustomerToken, [booking(fixtures.service._id)]);

    expect(second.status).toBe(200);
    expect(second.body.results[0]).toMatchObject({
      ok: false,
      status: 409,
      message: 'That time was just booked. Please choose another.'
    });
  });

  it('rejects a closed day and a time that has already passed', async () => {
    const closedDay = await createBookings(customerToken, [
      booking(fixtures.service._id, { date: '2026-11-01', startTime: '10:00' })
    ]);
    const pastTime = await createBookings(secondCustomerToken, [
      booking(fixtures.service._id, { date: '2026-10-26', startTime: '09:00' })
    ]);

    expect(closedDay.body.results[0]).toMatchObject({ ok: false, status: 400 });
    expect(closedDay.body.results[0].message).toContain('closed');
    expect(pastTime.body.results[0]).toMatchObject({ ok: false, status: 400 });
    expect(pastTime.body.results[0].message).toContain('available booking time');
  });

  it('does not allow an unpaid booking to start or complete', async () => {
    const created = await createBookings(customerToken, [booking(fixtures.service._id)]);
    const requestId = created.body.results[0].serviceRequest._id;
    await ServiceRequest.updateOne(
      { _id: requestId },
      { $set: { status: 'assigned', mechanic: fixtures.mechanic._id, mechanicId: fixtures.mechanic._id } }
    );

    const started = await api
      .post(`/api/mechanic/jobs/${requestId}/start`)
      .set('Authorization', `Bearer ${mechanicToken}`);
    const completed = await api
      .post(`/api/mechanic/jobs/${requestId}/complete`)
      .set('Authorization', `Bearer ${mechanicToken}`);

    expect(started.status).toBe(409);
    expect(started.body.message).toBe('Payment is not confirmed yet.');
    expect(completed.status).toBe(409);
    expect(completed.body.message).toBe('Payment is not confirmed yet.');
    expect((await ServiceRequest.findById(requestId).lean()).status).toBe('assigned');
  });

  it('mechanic accept, start, and complete creates one revenue record with the configured labor fee', async () => {
    const requestId = await createPaidBooking();

    const accepted = await api
      .post(`/api/mechanic/jobs/${requestId}/accept`)
      .set('Authorization', `Bearer ${mechanicToken}`);
    expect(accepted.status).toBe(200);
    const started = await api
      .post(`/api/mechanic/jobs/${requestId}/start`)
      .set('Authorization', `Bearer ${mechanicToken}`);
    expect(started.status).toBe(200);
    const completed = await api
      .post(`/api/mechanic/jobs/${requestId}/complete`)
      .set('Authorization', `Bearer ${mechanicToken}`);

    expect(completed.status).toBe(200);
    expect(completed.body.job.status).toBe('completed');
    expect((await ServiceRequest.findById(requestId).lean()).completedAt).toBeInstanceOf(Date);
    const revenue = await BusinessRecord.find({ recordType: 'service', sourceId: requestId }).lean();
    expect(revenue).toHaveLength(1);
    expect(revenue[0]).toMatchObject({
      amount: fixtures.service.price,
      laborFee: fixtures.service.mechanicFee
    });
  });

  it('does not allow admin completion or reopening a completed booking', async () => {
    const created = await createBookings(customerToken, [booking(fixtures.service._id)]);
    const requestId = created.body.results[0].serviceRequest._id;
    const directCompletion = await api
      .put('/api/service-requests/status/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestId, status: 'completed' });
    expect(directCompletion.status).toBe(400);

    await ServiceRequest.updateOne({ _id: requestId }, { $set: { status: 'completed' } });
    const reopen = await api
      .put('/api/service-requests/status/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestId, status: 'accepted' });

    expect(reopen.status).toBe(409);
    expect((await ServiceRequest.findById(requestId).lean()).status).toBe('completed');
  });

  it('removes the service revenue record when an admin cancels the booking', async () => {
    const created = await createBookings(customerToken, [booking(fixtures.service._id)]);
    const requestId = created.body.results[0].serviceRequest._id;
    await ServiceRequest.updateOne(
      { _id: requestId },
      { $set: { status: 'accepted', mechanic: fixtures.mechanic._id, mechanicId: fixtures.mechanic._id } }
    );
    await BusinessRecord.create({
      recordType: 'service',
      sourceId: requestId,
      customer: 'Casey Customer',
      itemName: fixtures.service.name,
      amount: fixtures.service.price,
      laborFee: fixtures.service.mechanicFee,
      status: 'completed'
    });

    const cancelled = await api
      .put('/api/service-requests/status/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestId, status: 'cancelled' });

    expect(cancelled.status).toBe(200);
    expect(await BusinessRecord.countDocuments({ recordType: 'service', sourceId: requestId })).toBe(0);
  });

  it('expires an unpaid booking and makes its slot available again', async () => {
    const created = await createBookings(customerToken, [booking(fixtures.service._id)]);
    const requestId = created.body.results[0].serviceRequest._id;
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    await reservationController.expireReservations();

    const expired = await ServiceRequest.findById(requestId).lean();
    expect(expired).toMatchObject({
      status: 'cancelled',
      cancelReason: 'The payment deadline passed.'
    });
    const secondBooking = await createBookings(secondCustomerToken, [booking(fixtures.service._id)]);
    expect(secondBooking.body.results[0].ok).toBe(true);
  });

  it('limits each customer to three active unpaid bookings', async () => {
    const firstThree = await createBookings(customerToken, [
      booking(fixtures.service._id, { startTime: '10:00' }),
      booking(fixtures.service._id, { startTime: '11:00' }),
      booking(fixtures.service._id, { startTime: '12:00' })
    ]);
    expect(firstThree.body.results.map((result) => result.ok)).toEqual([true, true, true]);

    const fourth = await createBookings(customerToken, [
      booking(fixtures.service._id, { startTime: '13:00' })
    ]);

    expect(fourth.body.results[0]).toMatchObject({
      ok: false,
      status: 409
    });
    expect(fourth.body.results[0].message).toContain('up to 3 active unpaid');
    expect(await ServiceRequest.countDocuments({
      customerId: fixtures.customer._id,
      paymentStatus: 'Payment Pending',
      status: { $in: ['pending', 'assigned', 'confirmed', 'accepted', 'in-progress'] }
    })).toBe(3);
  });
});
