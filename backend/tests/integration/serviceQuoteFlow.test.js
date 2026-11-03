import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const {
  app,
  BusinessRecord,
  Mechanic,
  Notification,
  Service,
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

const api = supertest(app);
const receipt = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=',
  'base64'
);
let fixtures;
let customerToken;
let secondCustomerToken;
let mechanicToken;
let adminToken;

function nextOpenDate() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 2);
  while (date.getDay() === 0) date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function createQuoteRequest(startTime = '10:00') {
  const response = await api.post('/api/services/bookings')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ bookings: [{
      serviceId: String(fixtures.service._id),
      partsSource: 'customer',
      date: nextOpenDate(),
      startTime,
      vehicle: 'Integration motorcycle',
      notes: 'Customer will provide the replacement parts.',
      customerPartsNote: 'Customer will provide the replacement parts.'
    }] });
  expect(response.status).toBe(200);
  expect(response.body.results[0].ok).toBe(true);
  const request = response.body.results[0].serviceRequest;
  const assigned = await api.put('/api/service-requests/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ requestId: request._id, mechanicId: String(fixtures.mechanic._id) });
  expect(assigned.status).toBe(200);
  return ServiceRequest.findById(request._id);
}

async function submitQuote(requestId, price = 425) {
  return api.post(`/api/service-requests/${requestId}/quote`)
    .set('Authorization', `Bearer ${mechanicToken}`)
    .send({ price, note: 'Parts inspection and labor estimate.' });
}

async function createCompletedBooking(customer = fixtures.customer) {
  return ServiceRequest.create({
    user: customer._id,
    customerId: customer._id,
    serviceId: fixtures.service._id,
    mechanic: fixtures.mechanic._id,
    mechanicId: fixtures.mechanic._id,
    serviceType: fixtures.service.name,
    description: 'Completed service for rating test.',
    status: 'completed',
    completedAt: new Date()
  });
}

describe('labor-only service quote flow', () => {
  beforeAll(async () => {
    await startReplicaSet();
    await Promise.all([Service.init(), ServiceRequest.init(), Notification.init(), BusinessRecord.init()]);
  }, 180000);

  afterAll(async () => {
    await stopReplicaSet();
  }, 180000);

  beforeEach(async () => {
    await clearCollections();
    mockCloudinary();
    fixtures = await createFixtures();
    customerToken = signCustomer(fixtures.customer);
    secondCustomerToken = signCustomer(fixtures.secondCustomer);
    mechanicToken = signMechanic(fixtures.mechanic);
    adminToken = signAdmin(fixtures.admin);
    await Service.updateOne({ _id: fixtures.service._id }, {
      $set: { laborOnlyPrice: null, laborPriceMin: 250, laborPriceMax: 700 }
    });
  });

  it('creates a quote request, submits a quote, accepts it, and exposes one assigned mechanic job', async () => {
    const request = await createQuoteRequest();
    expect(request).toMatchObject({
      partsSource: 'customer',
      quoteStatus: 'quote_requested',
      laborPriceMinSnapshot: 250,
      laborPriceMaxSnapshot: 700,
      customerPartsNote: 'Customer will provide the replacement parts.',
      estimatedPrice: 0,
      downPaymentAmount: 0,
      paymentStatus: 'Payment Pending'
    });
    expect(await Notification.exists({ audience: 'mechanic', mechanicId: fixtures.mechanic._id, type: 'service_quote_requested', recordId: request._id })).not.toBeNull();

    const quote = await submitQuote(request._id);
    expect(quote.status).toBe(200);
    expect(quote.body.serviceRequest).toMatchObject({ quoteStatus: 'quoted', quotedPrice: 425 });
    expect(await Notification.exists({ audience: 'customer', customerId: fixtures.customer._id, type: 'service_quote_ready', recordId: request._id })).not.toBeNull();

    const accepted = await api.post(`/api/service-requests/${request._id}/quote/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.serviceRequest).toMatchObject({
      quoteStatus: 'accepted',
      totalAmount: 425,
      estimatedPrice: 425,
      servicePriceTotal: 0,
      mechanicFeeTotal: 425,
      status: 'assigned'
    });

    const jobs = await api.get('/api/service-requests/mechanic')
      .set('Authorization', `Bearer ${mechanicToken}`);
    expect(jobs.status).toBe(200);
    expect(jobs.body.jobs.filter((job) => String(job._id) === String(request._id))).toHaveLength(1);
  });

  it('closes the request when the customer rejects a quote', async () => {
    const request = await createQuoteRequest();
    expect((await submitQuote(request._id)).status).toBe(200);

    const rejected = await api.post(`/api/service-requests/${request._id}/quote/reject`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(rejected.status).toBe(200);
    expect(rejected.body.serviceRequest).toMatchObject({ quoteStatus: 'rejected', status: 'cancelled' });
    expect(await BusinessRecord.countDocuments({ recordType: 'service', sourceId: request._id })).toBe(0);
    expect(await Notification.exists({ audience: 'mechanic', mechanicId: fixtures.mechanic._id, type: 'service_quote_rejected', recordId: request._id })).not.toBeNull();
  });

  it('refuses quote actions from a different mechanic or customer', async () => {
    const request = await createQuoteRequest();
    const otherMechanic = await Mechanic.create({
      username: 'other.mechanic',
      email: 'other.mechanic@example.com',
      password: 'MechanicPass1',
      firstName: 'Other',
      lastName: 'Mechanic',
      phoneNumber: '09181234567',
      specialization: 'general',
      yearsOfExperience: 2,
      createdBy: fixtures.admin._id
    });
    const otherMechanicToken = signMechanic(otherMechanic);
    const wrongMechanic = await api.post(`/api/service-requests/${request._id}/quote`)
      .set('Authorization', `Bearer ${otherMechanicToken}`)
      .send({ price: 425, note: 'Wrong mechanic.' });
    const wrongCustomer = await api.post(`/api/service-requests/${request._id}/quote/cancel`)
      .set('Authorization', `Bearer ${secondCustomerToken}`);

    expect(wrongMechanic.status).toBe(403);
    expect(wrongCustomer.status).toBe(404);
    expect((await ServiceRequest.findById(request._id)).quoteStatus).toBe('quote_requested');
  });

  it('allows only one successful accept when the customer submits twice concurrently', async () => {
    const request = await createQuoteRequest();
    expect((await submitQuote(request._id)).status).toBe(200);

    const accepts = await Promise.all([
      api.post(`/api/service-requests/${request._id}/quote/accept`).set('Authorization', `Bearer ${customerToken}`),
      api.post(`/api/service-requests/${request._id}/quote/accept`).set('Authorization', `Bearer ${customerToken}`)
    ]);
    expect(accepts.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await ServiceRequest.countDocuments({ _id: request._id })).toBe(1);
    expect(await Notification.countDocuments({ audience: 'mechanic', mechanicId: fixtures.mechanic._id, type: 'service_quote_accepted', recordId: request._id })).toBe(1);
  });

  it('records quoted labor once on completion and includes it in mechanic KPIs', async () => {
    const request = await createQuoteRequest();
    expect((await submitQuote(request._id, 425)).status).toBe(200);
    const accepted = await api.post(`/api/service-requests/${request._id}/quote/accept`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(accepted.status).toBe(200);

    const payment = await api.post(`/api/service-requests/${request._id}/payment`)
      .set('Authorization', `Bearer ${customerToken}`)
      .field('reference', '4250000001')
      .attach('proof', receipt, { filename: 'quote-receipt.png', contentType: 'image/png' });
    expect(payment.status).toBe(200);
    const confirmed = await api.post(`/api/admin/service-requests/${request._id}/confirm-payment`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(confirmed.status).toBe(200);

    const started = await api.put('/api/service-requests/status')
      .set('Authorization', `Bearer ${mechanicToken}`)
      .send({ requestId: request._id, status: 'in-progress' });
    expect(started.status).toBe(200);
    const completed = await api.put('/api/service-requests/status')
      .set('Authorization', `Bearer ${mechanicToken}`)
      .send({ requestId: request._id, status: 'completed' });
    expect(completed.status).toBe(200);
    expect((await BusinessRecord.find({ recordType: 'service', sourceId: request._id })).map((record) => ({
      amount: record.amount,
      laborFee: record.laborFee
    }))).toEqual([{ amount: 425, laborFee: 425 }]);

    const duplicateCompletion = await api.put('/api/service-requests/status')
      .set('Authorization', `Bearer ${mechanicToken}`)
      .send({ requestId: request._id, status: 'completed' });
    expect(duplicateCompletion.status).toBe(400);
    expect(await BusinessRecord.countDocuments({ recordType: 'service', sourceId: request._id })).toBe(1);

    const summary = await api.get('/api/admin/mechanics/summary')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(summary.body.totalLaborToday).toBe(425);
    expect(summary.body.mechanics.find((mechanic) => mechanic.mechanicId === String(fixtures.mechanic._id)))
      .toMatchObject({ totalRepairs: 1, totalLabor: 425 });
  });

  it('lets the owning customer rate a completed booking and recomputes the mechanic average', async () => {
    const first = await createCompletedBooking();
    const second = await createCompletedBooking();
    const firstRating = await api.post(`/api/services/bookings/${first._id}/rating`)
      .set('Authorization', 'Bearer ' + customerToken)
      .send({ rating: 5, comment: 'Great work, thank you.' });
    const secondRating = await api.post(`/api/services/bookings/${second._id}/rating`)
      .set('Authorization', 'Bearer ' + customerToken)
      .send({ rating: 4 });

    expect(firstRating.status).toBe(200);
    expect(firstRating.body.serviceRequest).toMatchObject({
      mechanicRating: 5,
      mechanicRatingComment: 'Great work, thank you.'
    });
    expect(firstRating.body.serviceRequest.mechanicRatedAt).toBeTruthy();
    expect(secondRating.status).toBe(200);
    expect(await Mechanic.findById(fixtures.mechanic._id).lean())
      .toMatchObject({ averageRating: 4.5, ratingCount: 2 });
    expect(await Notification.exists({
      audience: 'mechanic',
      mechanicId: fixtures.mechanic._id,
      type: 'mechanic_rating_received',
      recordId: first._id,
      message: 'You received a new rating: 5/5 stars.',
      link: '/mechanic/profile#performance'
    })).not.toBeNull();

    const customerBookings = await api.get('/api/service-requests/my')
      .set('Authorization', 'Bearer ' + customerToken);
    expect(customerBookings.status).toBe(200);
    expect(customerBookings.body.requests.find((item) => item._id === String(first._id)))
      .toMatchObject({ mechanicRating: 5, mechanicRatingComment: 'Great work, thank you.' });
  });

  it('rejects rating a booking before completion', async () => {
    const booking = await createCompletedBooking();
    booking.status = 'in-progress';
    await booking.save();

    const response = await api.post(`/api/services/bookings/${booking._id}/rating`)
      .set('Authorization', 'Bearer ' + customerToken)
      .send({ rating: 5 });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/only after the service is completed/i);
  });

  it('rejects a second rating for the same booking', async () => {
    const booking = await createCompletedBooking();
    const url = `/api/services/bookings/${booking._id}/rating`;
    const first = await api.post(url).set('Authorization', 'Bearer ' + customerToken).send({ rating: 5 });
    const second = await api.post(url).set('Authorization', 'Bearer ' + customerToken).send({ rating: 4 });

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already rated/i);
  });

  it('prevents another customer from rating the booking', async () => {
    const booking = await createCompletedBooking();
    const response = await api.post(`/api/services/bookings/${booking._id}/rating`)
      .set('Authorization', 'Bearer ' + secondCustomerToken)
      .send({ rating: 5 });

    expect(response.status).toBe(404);
    expect((await ServiceRequest.findById(booking._id)).mechanicRating).toBeUndefined();
  });

  it.each([0, 6, 2.5, '5', null])('rejects invalid rating value %s', async (rating) => {
    const booking = await createCompletedBooking();
    const response = await api.post(`/api/services/bookings/${booking._id}/rating`)
      .set('Authorization', 'Bearer ' + customerToken)
      .send({ rating });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/whole number from 1 to 5/i);
  });
});