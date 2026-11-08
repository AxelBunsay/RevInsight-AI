import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const emailSender = require('../../utils/sendEmail');
const {
  app,
  Mechanic,
  PendingUser,
  User,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  createFixtures,
  signAdmin,
  signCustomer,
  signMechanic
} = require('./helpers');

const api = supertest(app);
let fixtures;
let adminToken;

function mechanicPayload(overrides = {}) {
  return {
    username: 'new.mechanic',
    password: 'MechanicPass1',
    firstName: 'New',
    lastName: 'Mechanic',
    phoneNumber: '09171234567',
    specialization: 'general',
    yearsOfExperience: 3,
    ...overrides
  };
}

function createAsAdmin(payload) {
  return api.post('/api/mechanics/create')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(payload);
}

describe('mechanic username authentication', () => {
  beforeAll(async () => {
    await startReplicaSet();
    await Mechanic.init();
  }, 180000);

  afterAll(async () => {
    await stopReplicaSet();
  }, 180000);

  beforeEach(async () => {
    await clearCollections();
    fixtures = await createFixtures();
    adminToken = signAdmin(fixtures.admin);
  });

  it('creates mechanics without email and signs in with case-insensitive usernames', async () => {
    const created = await createAsAdmin(mechanicPayload());
    expect(created.status).toBe(201);
    expect(created.body.mechanic.username).toBe('new.mechanic');
    expect(created.body.mechanic.email).toBeUndefined();

    const login = await api.post('/api/mechanics/login')
      .send({ username: 'NEW.Mechanic', password: 'MechanicPass1', rememberMe: true });
    expect(login.status).toBe(200);
    expect(login.body.mechanic.username).toBe('new.mechanic');
  });

  it('authenticates a legacy customer document with the remembered frontend request payload', async () => {
    const password = 'LegacyCustomer1';
    const email = 'Legacy.Customer@example.com';
    await User.collection.insertOne({
      email,
      password: await bcrypt.hash(password, 10),
      firstName: 'Legacy',
      lastName: 'Customer',
      phoneNumber: '09171234567',
      isEmailVerified: true,
      role: 'customer'
    });

    const login = await api.post('/api/users/login')
      .send({ email: ` ${email.toLowerCase()} `, password, rememberMe: true });

    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(email);
    expect(jwt.decode(login.body.token).exp - jwt.decode(login.body.token).iat)
      .toBe(30 * 24 * 60 * 60);
  });

  it('registers a customer through OTP and authenticates the same password afterwards', async () => {
    const sendMail = vi.spyOn(emailSender, 'sendEmail')
      .mockResolvedValue({ accepted: [] });
    const email = 'otp.customer@example.com';
    const password = 'OtpCustomer1';
    try {
      const registration = await api.post('/api/users/register-request').send({
        email,
        username: 'otp_customer',
        password,
        firstName: 'Otp',
        lastName: 'Customer',
        phoneNumber: '09171234567'
      });
      expect(registration.status).toBe(202);

      const pending = await PendingUser.findOne({ email }).select('+password');
      expect(pending).not.toBeNull();
      expect(await bcrypt.compare(password, pending.password)).toBe(true);

      const verification = await api.post('/api/users/verify-otp').send({
        email,
        otp: pending.otp.code
      });
      expect(verification.status).toBe(200);
      expect(await bcrypt.compare(password, (await User.findOne({ email }).select('+password')).password))
        .toBe(true);

      const login = await api.post('/api/users/login')
        .send({ email: email.toUpperCase(), password, rememberMe: true });
      expect(login.status).toBe(200);
      expect(login.body.user.email).toBe(email);
    } finally {
      sendMail.mockRestore();
    }
  });

  it('returns the same generic failure for wrong password, unknown username, inactive mechanic and email login', async () => {
    const created = await createAsAdmin(mechanicPayload());
    const id = created.body.mechanic.id;

    const activeAttempts = await Promise.all([
      api.post('/api/mechanics/login').send({ username: 'new.mechanic', password: 'WrongPass1' }),
      api.post('/api/mechanics/login').send({ username: 'unknown.user', password: 'WrongPass1' }),
      api.post('/api/mechanics/login').send({ email: 'new.mechanic@example.com', password: 'MechanicPass1' })
    ]);

    for (const response of activeAttempts) {
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid username or password');
    }

    await Mechanic.findByIdAndUpdate(id, { isActive: false });
    const inactive = await api.post('/api/mechanics/login')
      .send({ username: 'new.mechanic', password: 'MechanicPass1' });
    expect(inactive.status).toBe(401);
    expect(inactive.body.message).toBe(activeAttempts[0].body.message);
  });

  it('rejects duplicate usernames case-insensitively and requires username and phone', async () => {
    expect((await createAsAdmin(mechanicPayload())).status).toBe(201);
    const duplicate = await createAsAdmin(mechanicPayload({ username: 'NEW.MECHANIC' }));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toBe('Username is already taken');

    const missingUsername = await createAsAdmin(mechanicPayload({ username: undefined }));
    expect(missingUsername.status).toBe(400);
    const missingPhone = await createAsAdmin(mechanicPayload({ username: 'another.mechanic', phoneNumber: undefined }));
    expect(missingPhone.status).toBe(400);
    const invalidPhone = await createAsAdmin(mechanicPayload({ username: 'invalid.phone', phoneNumber: '12345' }));
    expect(invalidPhone.status).toBe(400);
  });

  it('allows multiple mechanics without email while preserving customer and admin email logins', async () => {
    const first = await createAsAdmin(mechanicPayload({ username: 'first.mechanic' }));
    const second = await createAsAdmin(mechanicPayload({ username: 'second.mechanic' }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.mechanic.email).toBeUndefined();
    expect(second.body.mechanic.email).toBeUndefined();

    await User.updateOne(
      { _id: fixtures.customer._id },
      { $set: { password: await bcrypt.hash('CustomerPass1', 10) } }
    );
    const customer = await api.post('/api/users/login').send({
      email: fixtures.customer.email,
      password: 'CustomerPass1'
    });
    const admin = await api.post('/api/admin/login').send({
      username: 'integration_admin',
      password: 'IntegrationPass1'
    });
    expect(customer.status).toBe(200);
    expect(admin.status).toBe(200);
  });

  it('sets the requested session lifetime only when rememberMe is boolean true', async () => {
    const created = await createAsAdmin(mechanicPayload());
    const mechanicRemembered = await api.post('/api/mechanics/login')
      .send({ username: 'new.mechanic', password: 'MechanicPass1', rememberMe: true });
    const mechanicSession = await api.post('/api/mechanics/login')
      .send({ username: 'new.mechanic', password: 'MechanicPass1', rememberMe: false });
    const mechanicString = await api.post('/api/mechanics/login')
      .send({ username: 'new.mechanic', password: 'MechanicPass1', rememberMe: 'true' });

    expect(created.status).toBe(201);
    expect(mechanicRemembered.status).toBe(200);
    expect(mechanicSession.status).toBe(200);
    expect(mechanicString.status).toBe(200);
    expect(jwt.decode(mechanicRemembered.body.token).exp - jwt.decode(mechanicRemembered.body.token).iat)
      .toBe(30 * 24 * 60 * 60);
    expect(jwt.decode(mechanicSession.body.token).exp - jwt.decode(mechanicSession.body.token).iat)
      .toBe(12 * 60 * 60);
    expect(jwt.decode(mechanicString.body.token).exp - jwt.decode(mechanicString.body.token).iat)
      .toBe(12 * 60 * 60);

    await User.updateOne(
      { _id: fixtures.customer._id },
      { $set: { password: await bcrypt.hash('CustomerPass1', 10) } }
    );
    const customerRemembered = await api.post('/api/users/login')
      .send({ email: fixtures.customer.email, password: 'CustomerPass1', rememberMe: true });
    const customerSession = await api.post('/api/users/login')
      .send({ email: fixtures.customer.email, password: 'CustomerPass1', rememberMe: false });
    const customerString = await api.post('/api/users/login')
      .send({ email: fixtures.customer.email, password: 'CustomerPass1', rememberMe: 'true' });

    expect(customerRemembered.status).toBe(200);
    expect(customerSession.status).toBe(200);
    expect(customerString.status).toBe(200);
    expect(jwt.decode(customerRemembered.body.token).exp - jwt.decode(customerRemembered.body.token).iat)
      .toBe(30 * 24 * 60 * 60);
    expect(jwt.decode(customerSession.body.token).exp - jwt.decode(customerSession.body.token).iat)
      .toBe(24 * 60 * 60);
    expect(jwt.decode(customerString.body.token).exp - jwt.decode(customerString.body.token).iat)
      .toBe(24 * 60 * 60);
  });

  it('rejects existing tokens after a customer or mechanic account is deactivated', async () => {
    await User.updateOne({ _id: fixtures.customer._id }, { $set: { isActive: false } });
    await Mechanic.updateOne({ _id: fixtures.mechanic._id }, { $set: { isActive: false } });

    const customerProfile = await api.get('/api/users/profile')
      .set('Authorization', `Bearer ${signCustomer(fixtures.customer)}`);
    const mechanicProfile = await api.get('/api/mechanics/profile')
      .set('Authorization', `Bearer ${signMechanic(fixtures.mechanic)}`);

    expect(customerProfile.status).toBe(401);
    expect(mechanicProfile.status).toBe(401);
  });
});
