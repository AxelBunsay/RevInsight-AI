import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const {
  app,
  BusinessRecord,
  Product,
  Reservation,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  mockCloudinary,
  createFixtures,
  signCustomer,
  signAdmin
} = require('./helpers');

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=',
  'base64'
);
const api = supertest(app);

let fixtures;
let customerToken;
let secondCustomerToken;
let adminToken;

async function makeReservation(token, productId, qty = 1) {
  return api
    .post('/api/reservations')
    .set('Authorization', `Bearer ${token}`)
    .send({ items: [{ productId: String(productId), qty }] });
}

async function submitPayment(token, reservationId, reference) {
  return api
    .post(`/api/reservations/${reservationId}/payment`)
    .set('Authorization', `Bearer ${token}`)
    .field('reference', reference)
    .attach('proof', png, { filename: 'receipt.png', contentType: 'image/png' });
}

async function createSubmittedReservation(token, qty = 1, reference = '1234567890') {
  const created = await makeReservation(token, fixtures.product._id, qty);
  expect(created.status).toBe(201);
  const submitted = await submitPayment(token, created.body.reservation._id, reference);
  expect(submitted.status).toBe(200);
  return submitted.body.reservation;
}

async function confirmReservation(reservationId) {
  return api
    .post(`/api/admin/reservations/${reservationId}/confirm`)
    .set('Authorization', `Bearer ${adminToken}`);
}

describe('reservation business flow integration', () => {
  beforeAll(async () => {
    await startReplicaSet();
  });

  afterAll(async () => {
    await stopReplicaSet();
  });

  beforeEach(async () => {
    await clearCollections();
    mockCloudinary();
    fixtures = await createFixtures();
    customerToken = signCustomer(fixtures.customer);
    secondCustomerToken = signCustomer(fixtures.secondCustomer);
    adminToken = signAdmin(fixtures.admin);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a reservation with computed total, down payment, and balance', async () => {
    const response = await makeReservation(customerToken, fixtures.product._id, 2);

    expect(response.status).toBe(201);
    expect(response.body.reservation).toMatchObject({
      total: 2000,
      downPaymentPercent: 30,
      downPaymentAmount: 600,
      balanceDue: 2000,
      status: 'Pending Down Payment'
    });
    const saved = await Reservation.findById(response.body.reservation._id).lean();
    expect(saved.total).toBe(2000);
    expect(saved.downPaymentAmount).toBe(600);
  });

  it('prevents a second customer from reserving more than remaining stock', async () => {
    const first = await createSubmittedReservation(customerToken, 4);
    const confirmed = await confirmReservation(first._id);
    expect(confirmed.status).toBe(200);

    const response = await makeReservation(secondCustomerToken, fixtures.product._id, 2);

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('Only 1');
  });

  it('moves a reservation to Payment Submitted with a reference and receipt', async () => {
    const created = await makeReservation(customerToken, fixtures.product._id);
    const response = await submitPayment(
      customerToken,
      created.body.reservation._id,
      '1234567890'
    );

    expect(response.status).toBe(200);
    expect(response.body.reservation).toMatchObject({
      status: 'Payment Submitted',
      paymentReference: '1234567890'
    });
    const saved = await Reservation.findById(created.body.reservation._id).lean();
    expect(saved.paymentProofPublicId).toBe('integration/receipt-1');
    expect(saved.paymentSubmissions).toHaveLength(1);
  });

  it('rejects a duplicate payment reference number', async () => {
    await createSubmittedReservation(customerToken, 1, '1234567890');
    const second = await makeReservation(secondCustomerToken, fixtures.product._id);

    const response = await submitPayment(
      secondCustomerToken,
      second.body.reservation._id,
      '1234567890'
    );

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('This reference number was already used.');
  });

  it('admin confirmation reserves the requested product stock', async () => {
    const submitted = await createSubmittedReservation(customerToken, 2);

    const response = await confirmReservation(submitted._id);

    expect(response.status).toBe(200);
    expect(response.body.reservation.status).toBe('Reserved');
    const product = await Product.findById(fixtures.product._id).lean();
    expect(product.reservedQty).toBe(2);
  });

  it('admin rejection returns the reservation to Pending Down Payment with a reason', async () => {
    const submitted = await createSubmittedReservation(customerToken);

    const response = await api
      .post(`/api/admin/reservations/${submitted._id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Receipt details are not legible.' });

    expect(response.status).toBe(200);
    expect(response.body.reservation).toMatchObject({
      status: 'Pending Down Payment',
      rejectionReason: 'Receipt details are not legible.'
    });
    const saved = await Reservation.findById(submitted._id).lean();
    expect(saved.paymentDueAt).toBeInstanceOf(Date);
  });

  it('completes pickup, lowers stock, clears balance, and creates one revenue record', async () => {
    const submitted = await createSubmittedReservation(customerToken, 2);
    const confirmed = await confirmReservation(submitted._id);
    expect(confirmed.status).toBe(200);

    const completed = await api
      .post(`/api/admin/reservations/${submitted._id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(completed.status).toBe(200);
    expect(completed.body.reservation).toMatchObject({ status: 'Completed', balanceDue: 0 });
    const product = await Product.findById(fixtures.product._id).lean();
    expect(product).toMatchObject({ quantity: 3, reservedQty: 0 });
    expect(await BusinessRecord.countDocuments({
      recordType: 'product',
      sourceId: submitted._id
    })).toBe(1);
  });

  it('expires an unpaid reservation after its payment deadline', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T09:00:00+08:00'));
    const created = await makeReservation(customerToken, fixtures.product._id);

    vi.advanceTimersByTime(60 * 60 * 1000 + 1);
    const response = await api
      .get('/api/reservations')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(response.status).toBe(200);
    const reservation = await Reservation.findById(created.body.reservation._id).lean();
    expect(reservation.status).toBe('Expired');
    expect(reservation.cancelReason).toBe('The down payment deadline passed.');
  });

  it('expires a Reserved reservation after hold days and releases its stock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T09:00:00+08:00'));
    const submitted = await createSubmittedReservation(customerToken, 2);
    expect((await confirmReservation(submitted._id)).status).toBe(200);

    vi.advanceTimersByTime(3 * 24 * 60 * 60 * 1000 + 1);
    const response = await api
      .get('/api/reservations')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(response.status).toBe(200);
    const reservation = await Reservation.findById(submitted._id).lean();
    const product = await Product.findById(fixtures.product._id).lean();
    expect(reservation.status).toBe('Expired');
    expect(product.reservedQty).toBe(0);
  });

  it('does not allow a customer to cancel while payment is submitted', async () => {
    const submitted = await createSubmittedReservation(customerToken);

    const response = await api
      .post(`/api/reservations/${submitted._id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Please cancel this.' });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      'The shop is reviewing your payment. Contact the shop to cancel.'
    );
    expect((await Reservation.findById(submitted._id).lean()).status).toBe('Payment Submitted');
  });

  it('does not allow a customer to read another customer reservation', async () => {
    const created = await makeReservation(customerToken, fixtures.product._id);

    const response = await api
      .get(`/api/reservations/${created.body.reservation._id}`)
      .set('Authorization', `Bearer ${secondCustomerToken}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Reservation not found.');
  });
});
