import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const userController = require('../../controllers/userControllers/user');
const {
  app,
  PendingUser,
  User,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  createFixtures,
  signCustomer
} = require('./helpers');

const api = supertest(app);
let fixtures;

function registrationPayload(overrides = {}) {
  return {
    email: 'username.customer@example.com',
    username: 'rider_2026',
    password: 'RiderPassword1',
    firstName: 'Rider',
    lastName: 'Customer',
    phoneNumber: '09171234567',
    ...overrides
  };
}

describe('customer username authentication', () => {
  beforeAll(async () => {
    await startReplicaSet();
    await User.init();
    await PendingUser.init();
  }, 180000);

  afterAll(async () => {
    await stopReplicaSet();
  }, 180000);

  beforeEach(async () => {
    await clearCollections();
    fixtures = await createFixtures();
  });

  it('registers, verifies, and signs in with a valid username', async () => {
    const sendMail = vi.spyOn(userController.transporter, 'sendMail').mockResolvedValue({ accepted: [] });
    try {
      const registration = await api.post('/api/users/register-request').send(registrationPayload());
      expect(registration.status).toBe(202);

      const pending = await PendingUser.findOne({ email: registrationPayload().email }).select('+password');
      expect(pending.username).toBe('rider_2026');
      expect(pending.usernameLower).toBe('rider_2026');

      const verification = await api.post('/api/users/verify-otp').send({
        email: pending.email,
        otp: pending.otp.code
      });
      expect(verification.status).toBe(200);
      expect(verification.body.user.username).toBe('rider_2026');

      const login = await api.post('/api/users/login').send({
        identifier: 'RIDER_2026',
        password: 'RiderPassword1'
      });
      expect(login.status).toBe(200);
      expect(login.body.user.username).toBe('rider_2026');
    } finally {
      sendMail.mockRestore();
    }
  });

  it('rejects a username already used with different casing', async () => {
    await User.create({
      email: 'existing.username@example.com',
      username: 'RoadRider',
      password: 'ExistingPassword1',
      firstName: 'Existing',
      lastName: 'Rider',
      phoneNumber: '09171234567',
      isEmailVerified: true
    });

    const response = await api.post('/api/users/register-request')
      .send(registrationPayload({ username: 'ROADRIDER' }));
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Username is already taken');
  });

  it.each(['rider@name', 'abc', 'administrator'])(
    'rejects invalid username %s',
    async (username) => {
      const response = await api.post('/api/users/register-request')
        .send(registrationPayload({ username }));
      expect(response.status).toBe(400);
    }
  );

  it('supports username login, legacy email login, and a generic wrong-password response', async () => {
    await User.updateOne(
      { _id: fixtures.customer._id },
      {
        $set: {
          username: 'casey_rider',
          usernameLower: 'casey_rider',
          password: await bcrypt.hash('CustomerPass1', 10)
        }
      }
    );

    const usernameLogin = await api.post('/api/users/login').send({
      identifier: 'Casey_Rider',
      password: 'CustomerPass1'
    });
    const emailLogin = await api.post('/api/users/login').send({
      email: fixtures.customer.email,
      password: 'CustomerPass1'
    });
    const wrongPassword = await api.post('/api/users/login').send({
      identifier: 'casey_rider',
      password: 'WrongPassword1'
    });
    const wrongIdentifier = await api.post('/api/users/login').send({
      identifier: 'unknown_rider',
      password: 'WrongPassword1'
    });

    expect(usernameLogin.status).toBe(200);
    expect(usernameLogin.body.user.username).toBe('casey_rider');
    expect(emailLogin.status).toBe(200);
    expect(wrongPassword.status).toBe(401);
    expect(wrongIdentifier.status).toBe(401);
    expect(wrongPassword.body.message).toBe('Invalid credentials');
    expect(wrongIdentifier.body.message).toBe(wrongPassword.body.message);
  });

  it('returns username in the customer profile and does not allow profile updates to change it', async () => {
    await User.updateOne(
      { _id: fixtures.customer._id },
      { $set: { username: 'casey_rider', usernameLower: 'casey_rider' } }
    );
    const token = signCustomer(fixtures.customer);
    const profile = await api.get('/api/users/profile').set('Authorization', `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(profile.body.user.username).toBe('casey_rider');

    const update = await api.put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'changed_rider' });
    expect(update.status).toBe(200);
    expect(update.body.user.username).toBe('casey_rider');
    expect((await User.findById(fixtures.customer._id)).username).toBe('casey_rider');
  });
});