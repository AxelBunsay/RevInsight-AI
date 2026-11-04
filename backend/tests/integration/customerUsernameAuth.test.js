import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

async function prepareCustomerLogin(twoFactorEnabled = true) {
  await User.updateOne(
    { _id: fixtures.customer._id },
    {
      $set: {
        password: await bcrypt.hash('CustomerPass1', 10),
        twoFactorEnabled
      }
    }
  );
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
    expect(usernameLogin.body.user.twoFactorEnabled).toBe(false);
    expect(usernameLogin.body.requiresOtp).toBeUndefined();
    expect(emailLogin.status).toBe(200);
    expect(wrongPassword.status).toBe(401);
    expect(wrongIdentifier.status).toBe(401);
    expect(wrongPassword.body.message).toBe('Invalid credentials');
    expect(wrongIdentifier.body.message).toBe(wrongPassword.body.message);
  });

  it('sends a hashed short-lived login code and issues the normal token after a correct code', async () => {
    const sendMail = vi.spyOn(userController.transporter, 'sendMail').mockResolvedValue({ accepted: [] });
    await prepareCustomerLogin();
    try {
      const login = await api.post('/api/users/login').send({
        identifier: fixtures.customer.email,
        password: 'CustomerPass1',
        rememberMe: true
      });
      expect(login.status).toBe(200);
      expect(login.body).toMatchObject({ requiresOtp: true, email: 'i***@example.com' });
      expect(login.body.token).toBeUndefined();
      expect(login.body.user).toBeUndefined();
      expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: fixtures.customer.email,
        subject: 'Your RevInsight login code'
      }));

      const user = await User.findById(fixtures.customer._id);
      const code = sendMail.mock.calls[0][0].text.match(/\b\d{6}\b/)[0];
      expect(user.loginChallenge.codeHash).not.toBe(code);
      expect(user.loginChallenge.codeHash).toMatch(/^[a-f\d]{64}$/);
      expect(user.loginChallenge.attempts).toBe(0);

      const verified = await api.post('/api/users/login/verify-otp').send({
        identifier: fixtures.customer.email,
        code
      });
      expect(verified.status).toBe(200);
      expect(verified.body).toMatchObject({
        message: 'Login successful',
        user: { email: fixtures.customer.email, twoFactorEnabled: true }
      });
      expect(verified.body.token).toBeTruthy();
      expect(jwt.decode(verified.body.token).exp - jwt.decode(verified.body.token).iat).toBe(30 * 24 * 60 * 60);
      expect((await User.findById(fixtures.customer._id)).loginChallenge).toBeUndefined();
    } finally {
      sendMail.mockRestore();
    }
  });

  it('rejects wrong and expired login codes with clear messages', async () => {
    const sendMail = vi.spyOn(userController.transporter, 'sendMail').mockResolvedValue({ accepted: [] });
    await prepareCustomerLogin();
    try {
      await api.post('/api/users/login').send({ identifier: fixtures.customer.email, password: 'CustomerPass1' });
      const wrong = await api.post('/api/users/login/verify-otp').send({
        identifier: fixtures.customer.email,
        code: '000000'
      });
      expect(wrong.status).toBe(401);
      expect(wrong.body.message).toBe('The login code is incorrect.');

      await User.updateOne(
        { _id: fixtures.customer._id },
        { $set: { 'loginChallenge.expiresAt': new Date(Date.now() - 1000) } }
      );
      const expired = await api.post('/api/users/login/verify-otp').send({
        identifier: fixtures.customer.email,
        code: sendMail.mock.calls[0][0].text.match(/\b\d{6}\b/)[0]
      });
      expect(expired.status).toBe(401);
      expect(expired.body.message).toContain('expired');
    } finally {
      sendMail.mockRestore();
    }
  });

  it('locks verification after five incorrect codes until another code is requested', async () => {
    const sendMail = vi.spyOn(userController.transporter, 'sendMail').mockResolvedValue({ accepted: [] });
    await prepareCustomerLogin();
    try {
      await api.post('/api/users/login').send({ identifier: fixtures.customer.email, password: 'CustomerPass1' });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await api.post('/api/users/login/verify-otp').send({
          identifier: fixtures.customer.email,
          code: '000000'
        });
        expect(response.status).toBe(attempt === 4 ? 429 : 401);
      }

      const locked = await api.post('/api/users/login/verify-otp').send({
        identifier: fixtures.customer.email,
        code: sendMail.mock.calls[0][0].text.match(/\b\d{6}\b/)[0]
      });
      expect(locked.status).toBe(429);
      expect(locked.body.message).toContain('Request a new code');

      const cooldown = await api.post('/api/users/login/resend-otp')
        .send({ identifier: fixtures.customer.email });
      expect(cooldown.status).toBe(429);
      expect(cooldown.body.retryAfterSeconds).toBeGreaterThan(0);

      await User.updateOne(
        { _id: fixtures.customer._id },
        { $set: { 'loginChallenge.lastSentAt': new Date(Date.now() - 61_000) } }
      );
      const resent = await api.post('/api/users/login/resend-otp')
        .send({ identifier: fixtures.customer.email });
      expect(resent.status).toBe(200);
      expect((await User.findById(fixtures.customer._id)).loginChallenge.attempts).toBe(0);
    } finally {
      sendMail.mockRestore();
    }
  });

  it('requires the current password to enable or disable email two-step verification', async () => {
    await prepareCustomerLogin(false);
    const token = signCustomer(fixtures.customer);
    const wrongEnable = await api.post('/api/users/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPassword1' });
    expect(wrongEnable.status).toBe(401);
    expect((await User.findById(fixtures.customer._id)).twoFactorEnabled).toBe(false);

    const enabled = await api.post('/api/users/2fa/enable')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'CustomerPass1' });
    expect(enabled.status).toBe(200);
    expect(enabled.body.twoFactorEnabled).toBe(true);

    const wrongDisable = await api.post('/api/users/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'WrongPassword1' });
    expect(wrongDisable.status).toBe(401);
    expect((await User.findById(fixtures.customer._id)).twoFactorEnabled).toBe(true);

    const disabled = await api.post('/api/users/2fa/disable')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'CustomerPass1' });
    expect(disabled.status).toBe(200);
    expect(disabled.body.twoFactorEnabled).toBe(false);

    const profile = await api.get('/api/users/profile').set('Authorization', `Bearer ${token}`);
    expect(profile.body.user.twoFactorEnabled).toBe(false);
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