import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const { app, User, Admin, Mechanic, startReplicaSet, stopReplicaSet, clearCollections, createFixtures, signCustomer } = require('./helpers');
const bcrypt = require('bcryptjs');
const emailSender = require('../../utils/sendEmail');
const api = supertest(app);
const nextPassword = 'Replacement123';
const requestCode = email => api.post('/api/users/password-recovery/request').send({ email });
const reset = (email, code, password = nextPassword) => api.post('/api/users/password-recovery/reset')
  .send({ email, code, newPassword: password, confirmPassword: password });
const login = (email, password) => api.post('/api/users/login').send({ email, password });

describe('customer password recovery', () => {
  let fixture, email, delivery;
  beforeAll(startReplicaSet, 180000);
  afterAll(stopReplicaSet, 180000);
  beforeEach(async () => {
    await clearCollections();
    fixture = await createFixtures();
    email = fixture.customer.email;
    await User.updateOne({ _id: fixture.customer._id }, { password: await bcrypt.hash('Original123', 10) });
    delivery = vi.spyOn(emailSender, 'sendEmail').mockResolvedValue({});
  });
  afterEach(() => vi.restoreAllMocks());

  async function issue() {
    expect((await requestCode(email)).status).toBe(200);
    const message = delivery.mock.calls.at(-1)[0];
    expect(message.to).toBe(email);
    return message.text.match(/\b\d{6}\b/)[0];
  }

  it('changes the password once, confirms by email and revokes existing sessions', async () => {
    const oldToken = (await login(email, 'Original123')).body.token;
    const legacyToken = signCustomer(fixture.customer);
    const code = await issue();
    expect((await reset(email, code, 'weak')).status).toBe(400);
    const attempts = await Promise.all([reset(email, code), reset(email, code)]);
    expect(attempts.map(x => x.status).sort()).toEqual([200, 400]);
    expect(delivery).toHaveBeenCalledTimes(2);
    expect(delivery.mock.calls[1][0]).toMatchObject({ to: email, subject: 'Your RevInsight password was changed' });
    expect((await reset(email, code)).status).toBe(400);
    expect((await login(email, 'Original123')).status).toBe(401);
    for (const token of [oldToken, legacyToken]) {
      expect((await api.get('/api/users/profile').set('Authorization', 'Bearer ' + token)).status).toBe(401);
      expect((await api.get('/api/service-requests/my').set('Authorization', 'Bearer ' + token)).status).toBe(401);
    }
    const fresh = await login(email, nextPassword);
    expect(fresh.status).toBe(200);
    expect((await api.get('/api/users/profile').set('Authorization', 'Bearer ' + fresh.body.token)).status).toBe(200);
  });

  it('returns the same confirmation and sends only to a verified customer', async () => {
    const allowed = await requestCode(email);
    expect(allowed.body.message).toBe('If a customer account uses this email, we’ll send a reset code.');
    await User.updateOne({ _id: fixture.secondCustomer._id }, { isEmailVerified: false });
    for (const address of ['unknown@example.com', fixture.mechanic.email, fixture.secondCustomer.email, email]) {
      const response = await requestCode(address);
      expect(response.status).toBe(allowed.status);
      expect(response.body).toEqual(allowed.body);
    }
    expect(delivery).toHaveBeenCalledTimes(1);
    const code = delivery.mock.calls[0][0].text.match(/\b\d{6}\b/)[0];
    for (const target of [fixture.mechanic.email, fixture.admin.username]) {
      expect((await reset(target, code)).status).toBe(400);
    }
    expect(await (await Admin.findById(fixture.admin._id).select('+password')).comparePassword(nextPassword)).toBe(false);
    expect(await bcrypt.compare(nextPassword, (await Mechanic.findById(fixture.mechanic._id).select('+password')).password)).toBe(false);
  });

  it('expires issued codes and caps guesses across concurrent attempts', async () => {
    const code = await issue();
    await User.updateOne({ email }, { 'passwordRecovery.expiresAt': new Date(Date.now() - 1000) });
    expect((await reset(email, code)).status).toBe(400);
    await User.updateOne({ email }, { 'passwordRecovery.lastSentAt': new Date(Date.now() - 61000) });
    const replacement = await issue();
    await Promise.all(Array.from({ length: 6 }, () => reset(email, '000000')));
    expect((await User.findOne({ email }).select('+passwordRecovery')).passwordRecovery.attempts).toBe(5);
    expect((await reset(email, replacement)).status).toBe(400);
  });

  it('rejects registration and sign-in codes and clears outstanding login challenges', async () => {
    await User.updateOne({ email }, { twoFactorEnabled: true });
    const registration = await api.post('/api/users/register-request').send({
      email: 'pending@example.com', username: 'pending_rider', password: 'Original123',
      firstName: 'Test', lastName: 'Account', phoneNumber: '09171234567'
    });
    expect(registration.status).toBe(202);
    const registrationCode = delivery.mock.calls.at(-1)[0].text.match(/\b\d{6}\b/)[0];
    expect((await reset('pending@example.com', registrationCode)).status).toBe(400);
    expect((await login(email, 'Original123')).body.requiresOtp).toBe(true);
    const loginCode = delivery.mock.calls.at(-1)[0].text.match(/\b\d{6}\b/)[0];
    expect((await reset(email, loginCode)).status).toBe(400);
    expect((await reset(email, await issue())).status).toBe(200);
    expect((await api.post('/api/users/login/verify-otp').send({ email, code: loginCode })).status).toBe(401);
  });
});
