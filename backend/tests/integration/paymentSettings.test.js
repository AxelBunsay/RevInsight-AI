import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const {
  app,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  mockCloudinary,
  createFixtures,
  signCustomer,
  signMechanic,
  signAdmin,
  ReservationSettings
} = require('./helpers');
const cloudinary = require('../../config/cloudinary');
const api = supertest(app);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let customerToken;
let mechanicToken;
let adminToken;

const settingsRequest = (token, method = 'put') => api[method]('/api/admin/payment-settings')
  .set('Authorization', `Bearer ${token}`);

function withValidDetails(request) {
  return request
    .field('gcashAccountName', 'New Shop Account')
    .field('gcashAccountNumber', '+63 917 123 4567')
    .field('paymentInstructions', 'Send the exact amount and include your reference.');
}

describe('GCash payment settings integration', () => {
  beforeAll(async () => {
    await startReplicaSet();
  });

  afterAll(async () => {
    await stopReplicaSet();
  });

  beforeEach(async () => {
    await clearCollections();
    mockCloudinary();
    const fixtures = await createFixtures();
    customerToken = signCustomer(fixtures.customer);
    mechanicToken = signMechanic(fixtures.mechanic);
    adminToken = signAdmin(fixtures.admin);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets an admin upload a QR and returns the saved values publicly without private fields', async () => {
    const uploadStream = vi.spyOn(cloudinary.uploader, 'upload_stream');
    const upload = withValidDetails(settingsRequest(adminToken))
      .attach('qr', png, { filename: 'payment.png', contentType: 'image/png' });
    const saved = await upload;

    expect(saved.status).toBe(200);
    expect(uploadStream.mock.calls[0][0]).toMatchObject({
      folder: 'revinsight/payment-qr',
      resource_type: 'image'
    });
    expect(uploadStream.mock.calls[0][0].type).not.toBe('authenticated');
    expect(saved.body.settings).toMatchObject({
      gcashQrUrl: 'https://cloudinary.invalid/receipt-1.png',
      gcashAccountName: 'New Shop Account',
      gcashAccountNumber: '639171234567',
      paymentInstructions: 'Send the exact amount and include your reference.'
    });

    const response = await api.get('/api/payment-settings');
    expect(response.status).toBe(200);
    expect(response.body.settings).toEqual({
      gcashQrUrl: 'https://cloudinary.invalid/receipt-1.png',
      gcashAccountName: 'New Shop Account',
      gcashAccountNumber: '639171234567',
      paymentInstructions: 'Send the exact amount and include your reference.'
    });
    expect(JSON.stringify(response.body)).not.toContain('publicId');
    expect(JSON.stringify(response.body)).not.toContain('updatedAt');
  });

  it('uses the existing reservation payment details until new GCash details are saved', async () => {
    const response = await api.get('/api/payment-settings');
    expect(response.body.settings).toMatchObject({
      gcashAccountName: 'Integration Shop',
      gcashAccountNumber: '09170000000'
    });
    expect(Object.keys(response.body.settings).sort()).toEqual([
      'gcashAccountName',
      'gcashAccountNumber',
      'gcashQrUrl',
      'paymentInstructions'
    ]);
  });

  it('updates account settings without requiring a replacement QR image', async () => {
    const response = await withValidDetails(settingsRequest(adminToken));
    expect(response.status).toBe(200);
    expect(response.body.settings).toMatchObject({
      gcashQrUrl: '',
      gcashAccountName: 'New Shop Account',
      gcashAccountNumber: '639171234567'
    });
  });

  it.each([
    ['customer', () => customerToken],
    ['mechanic', () => mechanicToken]
  ])('denies %s access to the admin payment settings endpoints', async (_role, getToken) => {
    const token = getToken();
    const getResponse = await settingsRequest(token, 'get');
    const putResponse = await withValidDetails(settingsRequest(token));
    expect(getResponse.status).toBe(403);
    expect(putResponse.status).toBe(403);
  });

  it('deletes the previous Cloudinary QR when replacing it', async () => {
    const destroy = vi.spyOn(cloudinary.uploader, 'destroy');
    const first = await withValidDetails(settingsRequest(adminToken))
      .attach('qr', png, { filename: 'first.png', contentType: 'image/png' });
    expect(first.status).toBe(200);

    const second = await withValidDetails(settingsRequest(adminToken))
      .attach('qr', png, { filename: 'second.png', contentType: 'image/png' });
    expect(second.status).toBe(200);
    expect(destroy).toHaveBeenCalledWith('integration/receipt-1', { resource_type: 'image' });
  });

  it('restores the previous QR and cleans up the replacement if old-image removal fails', async () => {
    const first = await withValidDetails(settingsRequest(adminToken))
      .attach('qr', png, { filename: 'first.png', contentType: 'image/png' });
    expect(first.status).toBe(200);
    const destroy = vi.spyOn(cloudinary.uploader, 'destroy')
      .mockResolvedValueOnce({ result: 'error' })
      .mockResolvedValueOnce({ result: 'ok' });

    const second = await withValidDetails(settingsRequest(adminToken))
      .attach('qr', png, { filename: 'second.png', contentType: 'image/png' });
    expect(second.status).toBe(500);
    expect(destroy).toHaveBeenNthCalledWith(1, 'integration/receipt-1', { resource_type: 'image' });
    expect(destroy).toHaveBeenNthCalledWith(2, 'integration/receipt-2', { resource_type: 'image' });
    const publicResponse = await api.get('/api/payment-settings');
    expect(publicResponse.body.settings.gcashQrUrl).toBe('https://cloudinary.invalid/receipt-1.png');
  });

  it('rejects a QR larger than 2 MB', async () => {
    const response = await withValidDetails(settingsRequest(adminToken))
      .attach('qr', Buffer.alloc(3 * 1024 * 1024), { filename: 'large.png', contentType: 'image/png' });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/2 MB or smaller/);
  });

  it('rejects an uploaded file whose bytes are not a real image', async () => {
    const response = await withValidDetails(settingsRequest(adminToken))
      .attach('qr', Buffer.from('not an image'), { filename: 'fake.png', contentType: 'image/png' });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/real PNG, JPG, or WEBP/);
  });

  it('rejects an invalid account number', async () => {
    const response = await settingsRequest(adminToken)
      .field('gcashAccountName', 'New Shop Account')
      .field('gcashAccountNumber', '12345')
      .field('paymentInstructions', '');
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/10 to 13 digits/);
  });

  it('deletes a newly uploaded QR if saving the settings fails', async () => {
    const save = vi.spyOn(ReservationSettings.prototype, 'save').mockRejectedValue(new Error('database unavailable'));
    const destroy = vi.spyOn(cloudinary.uploader, 'destroy');
    const response = await withValidDetails(settingsRequest(adminToken))
      .attach('qr', png, { filename: 'failed-save.png', contentType: 'image/png' });

    expect(response.status).toBe(500);
    expect(save).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledWith('integration/receipt-1', { resource_type: 'image' });
  });

  it('rejects HTML in payment text fields', async () => {
    const response = await settingsRequest(adminToken)
      .field('gcashAccountName', '<b>Shop Name</b>')
      .field('gcashAccountNumber', '09171234567')
      .field('paymentInstructions', '');
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/HTML tags/);
  });

  it('rejects payment instructions longer than 300 characters', async () => {
    const response = await settingsRequest(adminToken)
      .field('gcashAccountName', 'New Shop Account')
      .field('gcashAccountNumber', '09171234567')
      .field('paymentInstructions', 'a'.repeat(301));
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/300 characters or fewer/);
  });
});
