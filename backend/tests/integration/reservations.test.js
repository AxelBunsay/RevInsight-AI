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

async function makeReservation(token, productId, qty = 1, itemFields = {}) {
  return api
    .post('/api/reservations')
    .set('Authorization', `Bearer ${token}`)
    .send({ items: [{ productId: String(productId), qty, ...itemFields }] });
}

const adminPost = (path) => api.post(path).set('Authorization', 'Bearer ' + adminToken);
const adminPut = (path) => api.put(path).set('Authorization', 'Bearer ' + adminToken);
const customerGet = (path) => api.get(path).set('Authorization', 'Bearer ' + customerToken);

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

async function createVariantProduct(variants) {
  return Product.create({
    name: 'Integration Variant Part',
    price: 100,
    quantity: 0,
    category: 'Electrical',
    variants
  });
}

async function createConfirmedVariantReservation(product, variant, reference = '1234567890') {
  const created = await makeReservation(customerToken, product._id, 1, {
    variantId: String(variant._id)
  });
  expect(created.status).toBe(201);
  const submitted = await submitPayment(customerToken, created.body.reservation._id, reference);
  expect(submitted.status).toBe(200);
  expect((await confirmReservation(created.body.reservation._id)).status).toBe(200);
  return created.body.reservation;
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

  it('reserves only the selected variant and uses its server price', async () => {
    const product = await createVariantProduct([
      { brand: 'Honda', model: 'TMX 125', price: 250, stock: 3 },
      { brand: 'Yamaha', model: 'YTX 125', price: 400, stock: 4 }
    ]);
    const [variantA, variantB] = product.variants;
    const created = await makeReservation(customerToken, product._id, 1, {
      variantId: String(variantA._id),
      price: 0
    });

    expect(created.status).toBe(201);
    expect(created.body.reservation).toMatchObject({
      total: 250,
      items: [{
        variantId: String(variantA._id),
        variantLabel: 'Honda TMX 125',
        name: 'Integration Variant Part - Honda TMX 125',
        unitPrice: 250
      }]
    });
    const submitted = await submitPayment(customerToken, created.body.reservation._id, '1234567890');
    expect(submitted.status).toBe(200);
    expect((await confirmReservation(created.body.reservation._id)).status).toBe(200);

    const savedProduct = await Product.findById(product._id);
    expect(savedProduct.variants.id(variantA._id).reservedQty).toBe(1);
    expect(savedProduct.variants.id(variantB._id).reservedQty).toBe(0);
    expect(savedProduct).toMatchObject({ quantity: 7, reservedQty: 1 });
  });

  it('rejects a reservation for an out-of-stock variant with 409', async () => {
    const product = await createVariantProduct([
      { size: '70/90-17', price: 500, stock: 0 }
    ]);
    const response = await makeReservation(customerToken, product._id, 1, {
      variantId: String(product.variants[0]._id)
    });

    expect(response.status).toBe(409);
  });

  it('requires a variant ID when reserving a product with variants', async () => {
    const product = await createVariantProduct([
      { color: 'Black', price: 300, stock: 2 }
    ]);
    const response = await makeReservation(customerToken, product._id);

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Choose a variant');
  });

  it('continues to reserve products without variants using server price and stock', async () => {
    const response = await makeReservation(customerToken, fixtures.product._id, 1, { price: 1 });

    expect(response.status).toBe(201);
    expect(response.body.reservation).toMatchObject({
      total: 1000,
      items: [{ unitPrice: 1000, name: 'Integration Brake Pad' }]
    });
  });

  it('returns available variant stock and filters by case-insensitive fitment', async () => {
    const product = await createVariantProduct([
      { brand: 'Honda', model: 'TMX 125', price: 250, stock: 3 },
      { size: '1 L', price: 90, stock: 2 }
    ]);
    product.variants[0].reservedQty = 1;
    await product.save();

    const response = await api.get('/api/products?brand=honda&model=tmx%20125');

    expect(response.status).toBe(200);
    expect(response.body.products).toHaveLength(1);
    expect(response.body.products[0].variants[0]).toMatchObject({
      brand: 'Honda',
      model: 'TMX 125',
      label: 'Honda TMX 125',
      price: 250,
      stock: 2,
      availableStock: 2
    });
    expect(response.body.products[0].variants[0]).not.toHaveProperty('reservedQty');
  });

  it('creates inventory variants with computed labels and ignores client labels and reserved stock', async () => {
    const response = await adminPost('/api/products').send({
      name: 'New Variant Product',
      category: 'Tires & Wheels',
      variants: [
        {
          brand: 'Honda',
          model: 'TMX 125',
          price: 0,
          stock: 4,
          reservedQty: 3,
          label: 'Client supplied label'
        }
      ]
    });

    expect(response.status).toBe(201);
    expect(response.body.product).toMatchObject({
      price: 0,
      quantity: 4,
      variants: [{
        brand: 'Honda',
        model: 'TMX 125',
        label: 'Honda TMX 125',
        stock: 4,
      }]
    });
    const savedProduct = await Product.findById(response.body.product._id);
    expect(savedProduct.reservedQty).toBe(0);
    expect(savedProduct.variants[0].reservedQty).toBe(0);
  });

  it('uploads variant photos through the existing Cloudinary product-image handling', async () => {
    const response = await adminPost('/api/products')
      .field('name', 'Variant Image Product')
      .field('category', 'Accessory')
      .field('variants', JSON.stringify([{ color: 'Red', price: 50, stock: 1 }]))
      .attach('variantImage_0', png, { filename: 'variant.png', contentType: 'image/png' });

    expect(response.status).toBe(201);
    expect(response.body.product.variants[0]).toMatchObject({
      imageUrl: 'https://cloudinary.invalid/receipt-1.png'
    });
    const product = await Product.findById(response.body.product._id);
    expect(product.variants[0].imagePublicId).toBe('integration/receipt-1');
  });

  it('updates variant inventory through the admin inventory endpoint', async () => {
    const product = await createVariantProduct([
      { brand: 'Honda', model: 'TMX 125', price: 250, stock: 3 }
    ]);
    const variant = product.variants[0];
    const response = await adminPut(`/api/dashboard/inventory/${product._id}`).send({
      name: product.name,
      category: product.category,
      price: 9999,
      quantity: 999,
      variants: [{
        _id: String(variant._id),
        brand: 'Yamaha',
        model: 'YTX 125',
        price: 400,
        stock: 5,
        reservedQty: 4,
        label: 'Untrusted label'
      }]
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      price: 400,
      quantity: 5,
      reservedQty: 0,
      variants: [{
        brand: 'Yamaha',
        model: 'YTX 125',
        price: 400,
        stock: 5,
        reservedQty: 0,
        label: 'Yamaha YTX 125'
      }]
    });
  });

  it('decrements only the selected variant stock when pickup is completed', async () => {
    const product = await createVariantProduct([
      { brand: 'Honda', model: 'TMX 125', price: 250, stock: 3 },
      { brand: 'Yamaha', model: 'YTX 125', price: 400, stock: 4 }
    ]);
    const [variantA, variantB] = product.variants;
    const reservation = await createConfirmedVariantReservation(product, variantA);

    const response = await adminPost(`/api/admin/reservations/${reservation._id}/complete`);

    expect(response.status).toBe(200);
    const savedProduct = await Product.findById(product._id);
    expect(savedProduct.variants.id(variantA._id).toObject()).toMatchObject({ stock: 2, reservedQty: 0 });
    expect(savedProduct.variants.id(variantB._id).toObject()).toMatchObject({ stock: 4, reservedQty: 0 });
    expect(await BusinessRecord.findOne({ sourceId: reservation._id })).toMatchObject({
      category: 'Electrical',
      itemName: 'Integration Variant Part - Honda TMX 125'
    });
  });

  it('releases the selected variant hold when a confirmed reservation is cancelled', async () => {
    const product = await createVariantProduct([
      { size: '1 L', price: 90, stock: 5 },
      { color: 'Black', price: 300, stock: 2 }
    ]);
    const [variantA, variantB] = product.variants;
    const reservation = await createConfirmedVariantReservation(product, variantA);

    const response = await adminPost(`/api/admin/reservations/${reservation._id}/cancel`)
      .send({ reason: 'Customer changed their mind.', refundDecision: 'refunded' });

    expect(response.status).toBe(200);
    const savedProduct = await Product.findById(product._id);
    expect(savedProduct.variants.id(variantA._id).reservedQty).toBe(0);
    expect(savedProduct.variants.id(variantB._id).reservedQty).toBe(0);
  });

  it('releases the selected variant hold when its reservation expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-26T09:00:00+08:00'));
    const product = await createVariantProduct([
      { size: '1 L', price: 90, stock: 5 },
      { color: 'Black', price: 300, stock: 2 }
    ]);
    const [variantA] = product.variants;
    const reservation = await createConfirmedVariantReservation(product, variantA);

    vi.advanceTimersByTime(3 * 24 * 60 * 60 * 1000 + 1);
    const response = await customerGet('/api/reservations');

    expect(response.status).toBe(200);
    expect((await Reservation.findById(reservation._id)).status).toBe('Expired');
    const savedProduct = await Product.findById(product._id);
    expect(savedProduct.variants.id(variantA._id).reservedQty).toBe(0);
    expect(savedProduct.variants.id(variantA._id).stock).toBe(5);
  });

  it('does not hold variant stock when a submitted payment is rejected', async () => {
    const product = await createVariantProduct([
      { color: 'Red', price: 100, stock: 2 }
    ]);
    const variant = product.variants[0];
    const created = await makeReservation(customerToken, product._id, 1, {
      variantId: String(variant._id)
    });
    const submitted = await submitPayment(customerToken, created.body.reservation._id, '1234567890');
    expect(submitted.status).toBe(200);

    const response = await adminPost(`/api/admin/reservations/${created.body.reservation._id}/reject`)
      .send({ reason: 'Receipt details are not legible.' });

    expect(response.status).toBe(200);
    expect((await Product.findById(product._id)).variants[0].reservedQty).toBe(0);
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
