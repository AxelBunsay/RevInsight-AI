import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
const Service = require('../../models/service');
const ReservationSettings = require('../../models/reservationSettings');
const revenueUtils = require('../../utils/revenue');
const { getServicePaymentSummary } = require('../../utils/servicePayment');

const api = supertest(app);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=',
  'base64'
);

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nextSundayDate() {
  const daysUntilSunday = (7 - new Date().getDay()) % 7 || 7;
  return dateOffset(daysUntilSunday);
}

const serviceDate = dateOffset(1);

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

async function createPaidBooking(serviceId = fixtures.service._id, units = 1, reference = '9876543210') {
  const created = await createBookings(customerToken, [booking(serviceId, { units })]);
  expect(created.status).toBe(200);
  expect(created.body.results[0].ok).toBe(true);
  const requestId = created.body.results[0].serviceRequest._id;
  const payment = await api
    .post(`/api/service-requests/${requestId}/payment`)
    .set('Authorization', `Bearer ${customerToken}`)
    .field('reference', reference)
    .attach('proof', png, { filename: 'service-receipt.png', contentType: 'image/png' });
  expect(payment.status).toBe(200);
  const confirmed = await api
    .post(`/api/admin/service-requests/${requestId}/confirm-payment`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(confirmed.status).toBe(200);
  return requestId;
}

async function setServiceDownPaymentPercent(percent) {
  const settings = await ReservationSettings.getDefaults();
  settings.serviceDownPaymentPercent = percent;
  await settings.save();
}

describe('service booking business flow integration', () => {
  beforeAll(async () => {
    await startReplicaSet();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${dateOffset(0)}T20:00:00+08:00`));
  });

  afterAll(async () => {
    await stopReplicaSet();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await clearCollections();
    mockCloudinary();
    fixtures = await createFixtures();
    customerToken = signCustomer(fixtures.customer);
    secondCustomerToken = signCustomer(fixtures.secondCustomer);
    mechanicToken = signMechanic(fixtures.mechanic);
    adminToken = signAdmin(fixtures.admin);
  });

  it('uses the configured service price and mechanic fee instead of client-supplied values', async () => {
    const response = await createBookings(customerToken, [
      booking(fixtures.service._id, {
        estimatedPrice: 1,
        laborFee: 0,
        serviceType: 'Forged service',
        price: 1,
        mechanicFee: 0
      })
    ]);

    expect(response.status).toBe(200);
    expect(response.body.results[0].ok).toBe(true);
    const requestId = response.body.results[0].serviceRequest._id;
    const persisted = await ServiceRequest.findById(requestId).lean();
    expect(persisted).toMatchObject({
      serviceType: fixtures.service.name,
      unitPrice: fixtures.service.price,
      unitMechanicFee: fixtures.service.mechanicFee,
      servicePriceTotal: fixtures.service.price,
      mechanicFeeTotal: fixtures.service.mechanicFee,
      estimatedPrice: fixtures.service.price + fixtures.service.mechanicFee,
      totalAmount: fixtures.service.price + fixtures.service.mechanicFee,
      downPaymentPercent: 30,
      downPaymentAmount: Math.round((fixtures.service.price + fixtures.service.mechanicFee) * 0.3 * 100) / 100,
      balanceDue: Math.round((fixtures.service.price + fixtures.service.mechanicFee) * 0.7 * 100) / 100,
      laborFee: fixtures.service.mechanicFee
    });
  });

  it('creates zero-percent bookings without an upfront payment deadline', async () => {
    await setServiceDownPaymentPercent(0);
    const created = await createBookings(customerToken, [booking(fixtures.service._id)]);
    const request = created.body.results[0].serviceRequest;

    expect(request).toMatchObject({
      paymentStatus: 'Confirmed',
      totalAmount: fixtures.service.price + fixtures.service.mechanicFee,
      downPaymentPercent: 0,
      downPaymentAmount: 0,
      balanceDue: fixtures.service.price + fixtures.service.mechanicFee,
      amountPaid: 0,
      paymentDueAt: null
    });

    await ServiceRequest.updateOne(
      { _id: request._id },
      { $set: { paymentDueAt: new Date(Date.now() - 48 * 60 * 60 * 1000) } }
    );
    await require('../../controllers/serviceRequestController').expireServiceBookings();
    expect((await ServiceRequest.findById(request._id).lean()).status).toBe('pending');
  });

  it('does not request a refund decision when cancelling a zero-payment booking', async () => {
    await setServiceDownPaymentPercent(0);
    const created = await createBookings(customerToken, [booking(fixtures.service._id)]);
    const requestId = created.body.results[0].serviceRequest._id;

    const cancelled = await api.put('/api/service-requests/status/admin')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ requestId, status: 'cancelled' });

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.serviceRequest.refundDecision).toBeNull();
  });

  it('accepts a zero service setting and rejects values above 100', async () => {
    const settings = {
      downPaymentPercent: 30,
      serviceDownPaymentPercent: 0,
      pendingPaymentHours: 24,
      holdDays: 3,
      paymentInstructions: { methodName: 'GCash', accountName: 'Shop', accountNumber: '09171234567' },
      pickupAddress: '',
      pickupHours: '',
      contactNumber: ''
    };
    const valid = await api.put('/api/admin/reservations/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(settings);
    const invalid = await api.put('/api/admin/reservations/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...settings, serviceDownPaymentPercent: 101 });

    expect(valid.status).toBe(200);
    expect(valid.body.settings.serviceDownPaymentPercent).toBe(0);
    expect(invalid.status).toBe(400);
    expect(invalid.body.fieldErrors.serviceDownPaymentPercent).toContain('0 to 100');
  });

  it('uses the existing item percentage for legacy settings without a service percentage', async () => {
    await ReservationSettings.getDefaults();
    await ReservationSettings.updateOne(
      { key: 'reservation' },
      { $set: { downPaymentPercent: 45 }, $unset: { serviceDownPaymentPercent: 1 } }
    );

    const settings = await ReservationSettings.getDefaults();

    expect(settings.serviceDownPaymentPercent).toBe(45);
  });

  it('rounds a 50-percent down payment and keeps the booking snapshot immutable', async () => {
    await setServiceDownPaymentPercent(50);
    const service = await Service.create({
      name: 'Precision Service',
      price: 300,
      mechanicFee: 33,
      durationMinutes: 60
    });
    const created = await createBookings(customerToken, [booking(service._id)]);
    const requestId = created.body.results[0].serviceRequest._id;

    expect(created.body.results[0].serviceRequest).toMatchObject({
      totalAmount: 333,
      downPaymentPercent: 50,
      downPaymentAmount: 166.5,
      balanceDue: 166.5
    });
    await setServiceDownPaymentPercent(100);
    expect(await ServiceRequest.findById(requestId).lean()).toMatchObject({
      downPaymentPercent: 50,
      downPaymentAmount: 166.5,
      balanceDue: 166.5
    });
  });

  it('stores the server-computed down payment on submissions and ignores a client amount', async () => {
    await setServiceDownPaymentPercent(50);
    const service = await Service.create({
      name: 'Payment Snapshot Service',
      price: 300,
      mechanicFee: 33,
      durationMinutes: 60
    });
    const created = await createBookings(customerToken, [booking(service._id)]);
    const requestId = created.body.results[0].serviceRequest._id;
    const payment = await api
      .post(`/api/service-requests/${requestId}/payment`)
      .set('Authorization', `Bearer ${customerToken}`)
      .field('reference', '9876543210')
      .field('amount', '1')
      .attach('proof', png, { filename: 'service-receipt.png', contentType: 'image/png' });
    const saved = await ServiceRequest.findById(requestId).lean();

    expect(payment.status).toBe(200);
    expect(saved.paymentSubmissions[0].amount).toBe(166.5);
    expect(saved.amountPaid).toBe(0);
  });

  it('treats a legacy confirmed booking without payment snapshots as fully paid upfront', () => {
    expect(getServicePaymentSummary({
      estimatedPrice: 333,
      paymentStatus: 'Confirmed'
    })).toEqual({
      totalAmount: 333,
      downPaymentPercent: 100,
      downPaymentAmount: 333,
      balanceDue: 0,
      amountPaid: 333
    });
  });

  it.each([50, 100])('counts a %s-percent down payment as one full-total service revenue at completion', async (percent) => {
    await setServiceDownPaymentPercent(percent);
    const requestId = await createPaidBooking(fixtures.service._id, 1, percent === 50 ? '9876543210' : '9876543211');
    const request = await ServiceRequest.findById(requestId).lean();
    expect(request.downPaymentPercent).toBe(percent);
    expect(request.amountPaid).toBe(request.downPaymentAmount);

    const accepted = await api.post(`/api/mechanic/jobs/${requestId}/accept`)
      .set('Authorization', `Bearer ${mechanicToken}`);
    const started = await api.post(`/api/mechanic/jobs/${requestId}/start`)
      .set('Authorization', `Bearer ${mechanicToken}`);
    const completed = await api.post(`/api/mechanic/jobs/${requestId}/complete`)
      .set('Authorization', `Bearer ${mechanicToken}`);
    const revenue = await BusinessRecord.find({ recordType: 'service', sourceId: requestId }).lean();
    const entries = await revenueUtils.getRevenueEntries({
      Order: require('../../models/orderingModels/order'),
      Reservation: require('../../models/orderingModels/reservation'),
      ServiceRequest,
      Product
    });

    expect(accepted.status).toBe(200);
    expect(started.status).toBe(200);
    expect(completed.status).toBe(200);
    expect(revenue).toHaveLength(1);
    expect(revenue[0]).toMatchObject({
      amount: fixtures.service.price + fixtures.service.mechanicFee,
      laborFee: fixtures.service.mechanicFee
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].revenue).toBe(fixtures.service.price + fixtures.service.mechanicFee);
  });

  it('stores server-calculated one-unit and two-unit prices, fees, labels, and scaled durations', async () => {
      const service = await Service.create({
        name: 'Bearing Replacement',
        description: 'Each hub holds 2 bearings',
        price: 150,
        mechanicFee: 50,
        durationMinutes: 60,
        pricePerUnit: true,
        unitLabel: 'wheel hub',
        maxUnits: 2,
        scaleDuration: true
      });
      const oneUnit = await createBookings(customerToken, [
        booking(service._id, { units: 1, startTime: '10:00', price: 1, mechanicFee: 0 })
      ]);
      const twoUnits = await createBookings(secondCustomerToken, [
        booking(service._id, { units: 2, startTime: '12:00', price: 1, mechanicFee: 0 })
      ]);
      const first = oneUnit.body.results[0].serviceRequest;
      const second = twoUnits.body.results[0].serviceRequest;

      expect(oneUnit.body.results[0].ok).toBe(true);
      expect(twoUnits.body.results[0].ok).toBe(true);
      expect(first).toMatchObject({
        units: 1,
        unitLabel: 'wheel hub',
        unitPrice: 150,
        unitMechanicFee: 50,
        servicePriceTotal: 150,
        mechanicFeeTotal: 50,
        estimatedPrice: 200,
        laborFee: 50,
        durationMinutes: 60,
        endTime: '11:00'
      });
      expect(second).toMatchObject({
        units: 2,
        unitLabel: 'wheel hub',
        unitPrice: 150,
        unitMechanicFee: 50,
        servicePriceTotal: 300,
        mechanicFeeTotal: 100,
        estimatedPrice: 400,
        laborFee: 100,
        durationMinutes: 120,
        endTime: '14:00'
      });
  });

  it('rejects quantities above a service maximum and quantities for ordinary services', async () => {
    const unitService = await Service.create({
      name: 'Two Hub Service',
      price: 150,
      mechanicFee: 45,
      pricePerUnit: true,
      unitLabel: 'hub',
      maxUnits: 2,
      durationMinutes: 60
    });
    const aboveMaximum = await createBookings(customerToken, [
      booking(unitService._id, { units: 3 })
    ]);
    const notPerUnit = await createBookings(secondCustomerToken, [
      booking(fixtures.service._id, { units: 2 })
    ]);

    expect(aboveMaximum.body.results[0]).toMatchObject({ ok: false, status: 400 });
    expect(aboveMaximum.body.results[0].message).toContain('1 to 2');
    expect(notPerUnit.body.results[0]).toMatchObject({ ok: false, status: 400 });
    expect(notPerUnit.body.results[0].message).toContain('does not allow multiple units');
  });

  it('keeps the configured base duration when duration scaling is disabled', async () => {
    const service = await Service.create({
      name: 'Fixed Duration Hub Service',
      price: 150,
      mechanicFee: 45,
      durationMinutes: 45,
      pricePerUnit: true,
      unitLabel: 'hub',
      maxUnits: 2,
      scaleDuration: false
    });
    const slots = await api
      .get(`/api/services/${service._id}/slots?date=${serviceDate}&units=2`)
      .set('Authorization', `Bearer ${customerToken}`);
    const slot = slots.body.slots.find((entry) => entry.startTime === '10:00');
    const created = await createBookings(customerToken, [
      booking(service._id, { units: 2, startTime: '10:00' })
    ]);

    expect(slot).toMatchObject({ endTime: '10:45' });
    expect(created.body.results[0].serviceRequest).toMatchObject({
      servicePriceTotal: 300,
      mechanicFeeTotal: 90,
      estimatedPrice: 390,
      durationMinutes: 45,
      endTime: '10:45'
    });
  });

  it('uses scaled duration for slot availability and prevents overlapping capacity bookings', async () => {
      const service = await Service.create({
        name: 'Long Wheel Service',
        price: 150,
        mechanicFee: 45,
        durationMinutes: 60,
        pricePerUnit: true,
        unitLabel: 'wheel',
        maxUnits: 2,
        scaleDuration: true
      });
      const slots = await api
        .get(`/api/services/${service._id}/slots?date=${serviceDate}&units=2`)
        .set('Authorization', `Bearer ${customerToken}`);
      const slot = slots.body.slots.find((entry) => entry.startTime === '10:00');
      expect(slot).toMatchObject({ startTime: '10:00', endTime: '12:00', endLabel: '12:00 PM' });

      const first = await createBookings(customerToken, [
        booking(service._id, { units: 2, startTime: '10:00' })
      ]);
      const overlapping = await createBookings(secondCustomerToken, [
        booking(service._id, { units: 1, startTime: '11:00' })
      ]);

      expect(first.body.results[0].ok).toBe(true);
      expect(overlapping.body.results[0]).toMatchObject({ ok: false, status: 409 });
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
      booking(fixtures.service._id, { date: nextSundayDate(), startTime: '10:00' })
    ]);
    const pastTime = await createBookings(secondCustomerToken, [
      booking(fixtures.service._id, { date: dateOffset(0), startTime: '09:00' })
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
      amount: fixtures.service.price + fixtures.service.mechanicFee,
      laborFee: fixtures.service.mechanicFee
    });
  });

  it('completes a two-unit booking with one revenue record using scaled price and labor', async () => {
      const service = await Service.create({
        name: 'Two Hub Replacement',
        price: 500,
        mechanicFee: 120,
        durationMinutes: 45,
        pricePerUnit: true,
        unitLabel: 'wheel hub',
        maxUnits: 2,
        scaleDuration: true
      });
      const requestId = await createPaidBooking(service._id, 2, '9876543211');
      const accepted = await api.post(`/api/mechanic/jobs/${requestId}/accept`)
        .set('Authorization', `Bearer ${mechanicToken}`);
      expect(accepted.status).toBe(200);
      await api.post(`/api/mechanic/jobs/${requestId}/start`)
        .set('Authorization', `Bearer ${mechanicToken}`);
      const completed = await api.post(`/api/mechanic/jobs/${requestId}/complete`)
        .set('Authorization', `Bearer ${mechanicToken}`);
      const revenue = await BusinessRecord.find({ recordType: 'service', sourceId: requestId }).lean();

      expect(completed.status).toBe(200);
      expect(revenue).toHaveLength(1);
    expect(revenue[0]).toMatchObject({
      itemName: 'Two Hub Replacement x2 wheel hubs',
      amount: 1240,
      laborFee: 240
    });
    expect(await ServiceRequest.findById(requestId).lean()).toMatchObject({
      servicePriceTotal: 1000,
      mechanicFeeTotal: 240,
      estimatedPrice: 1240,
      laborFee: 240
    });

    const entries = await revenueUtils.getRevenueEntries({
      Order: require('../../models/orderingModels/order'),
      Reservation: require('../../models/orderingModels/reservation'),
      ServiceRequest,
      Product
    });
    expect(revenueUtils.summarizeRevenue(entries)).toMatchObject({
      totalSales: 1240,
      totalOrders: 1
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].revenue).toBe(1240);

    const [dashboard, quarterly, concentration, mechanics] = await Promise.all([
      api.get('/api/dashboard/dashboard').set('Authorization', `Bearer ${adminToken}`),
      api.get('/api/dashboard/dashboard/quarterly').set('Authorization', `Bearer ${adminToken}`),
      api.get('/api/dashboard/analytics/revenue-concentration').set('Authorization', `Bearer ${adminToken}`),
      api.get('/api/admin/mechanics/summary').set('Authorization', `Bearer ${adminToken}`)
    ]);
    expect(dashboard.body.data.totalRevenue).toBe(1240);
    expect(quarterly.body.data.reduce((sum, row) => sum + row.revenue, 0)).toBe(1240);
    expect(concentration.body.data.totalRevenue).toBe(1240);
    expect(mechanics.body.totalLaborToday).toBe(240);
  });

  it('does not recalculate amounts on an existing booking when service pricing changes', async () => {
    const historicalServiceRequest = await ServiceRequest.create({
    user: fixtures.customer._id,
    customerId: fixtures.customer._id,
    serviceId: fixtures.service._id,
    serviceType: fixtures.service.name,
    description: 'Historical service booking',
    estimatedPrice: 2500,
    laborFee: 900,
    paymentStatus: 'Confirmed',
    status: 'completed',
    completedAt: new Date('2026-10-20T10:00:00+08:00')
    });

    await Service.updateOne({ _id: fixtures.service._id }, {
    $set: { price: 5000, mechanicFee: 1500 }
    });

    const stored = await ServiceRequest.findById(historicalServiceRequest._id).lean();
    expect(stored.estimatedPrice).toBe(2500);
    expect(stored.laborFee).toBe(900);
    expect(stored.servicePriceTotal).toBeUndefined();
    expect(stored.mechanicFeeTotal).toBeUndefined();
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
    await ServiceRequest.updateOne(
      { _id: requestId },
      { $set: { paymentDueAt: new Date(Date.now() - 1) } }
    );

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
