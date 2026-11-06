import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const cloudinary = require('../../config/cloudinary');
const {
  app,
  User,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  mockCloudinary,
  createFixtures,
  signCustomer
} = require('./helpers');

const api = supertest(app);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);
let customer;
let customerToken;

describe('customer profile image integration', () => {
  beforeAll(async () => {
    await startReplicaSet();
  }, 180000);

  afterAll(async () => {
    await stopReplicaSet();
  }, 180000);

  beforeEach(async () => {
    await clearCollections();
    mockCloudinary();
    const fixtures = await createFixtures();
    customer = fixtures.customer;
    customerToken = signCustomer(customer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads a profile image to Cloudinary and includes it in profile responses', async () => {
    const uploadStream = vi.spyOn(cloudinary.uploader, 'upload_stream');
    const response = await api.post('/api/customers/me/profile-image')
      .set('Authorization', 'Bearer ' + customerToken)
      .attach('image', jpg, { filename: 'profile.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      profileImage: 'https://cloudinary.invalid/receipt-1.png'
    });
    expect(uploadStream.mock.calls[0][0]).toMatchObject({
      folder: 'revinsight/profile-images',
      resource_type: 'image',
      transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' }]
    });

    const savedCustomer = await User.findById(customer._id).select('+profileImagePublicId');
    expect(savedCustomer.profileImage).toBe(response.body.profileImage);
    expect(savedCustomer.profileImagePublicId).toBe('integration/receipt-1');

    const profile = await api.get('/api/users/profile')
      .set('Authorization', 'Bearer ' + customerToken);
    expect(profile.status).toBe(200);
    expect(profile.body.user.profileImage).toBe(response.body.profileImage);

    const updated = await api.put('/api/customers/me')
      .set('Authorization', 'Bearer ' + customerToken)
      .send({ firstName: 'Casey', lastName: 'Updated' });
    expect(updated.status).toBe(200);
    expect(updated.body.user.profileImage).toBe(response.body.profileImage);
  });

  it('rejects invalid file types with a clean 400 response', async () => {
    const response = await api.post('/api/customers/me/profile-image')
      .set('Authorization', 'Bearer ' + customerToken)
      .attach('image', Buffer.from('not an image'), { filename: 'profile.gif', contentType: 'image/gif' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Only JPG or PNG profile images up to 5 MB are allowed.'
    });
  });

  it('rejects files larger than 5 MB with a clean 400 response', async () => {
    const response = await api.post('/api/customers/me/profile-image')
      .set('Authorization', 'Bearer ' + customerToken)
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'profile.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Profile image must be 5 MB or smaller.'
    });
  });

  it('requires customer authentication', async () => {
    const response = await api.post('/api/customers/me/profile-image')
      .attach('image', jpg, { filename: 'profile.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(401);
  });

  it('removes the stored image from Cloudinary and clears the profile field', async () => {
    await User.updateOne(
      { _id: customer._id },
      {
        profileImage: 'https://res.cloudinary.com/test/image/upload/v1/revinsight/profile-images/customer.jpg',
        profileImagePublicId: 'revinsight/profile-images/customer'
      }
    );
    const destroy = vi.spyOn(cloudinary.uploader, 'destroy');

    const response = await api.delete('/api/customers/me/profile-image')
      .set('Authorization', 'Bearer ' + customerToken);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, profileImage: null });
    expect(destroy).toHaveBeenCalledWith('revinsight/profile-images/customer', { resource_type: 'image' });
    const savedCustomer = await User.findById(customer._id).select('+profileImagePublicId');
    expect(savedCustomer.profileImage).toBeNull();
    expect(savedCustomer.profileImagePublicId).toBeNull();
  });
});
