import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const keyFor = require('../middleware/apiRateLimitKey');
const secret = 'isolated-rate-limit-key-test-secret';
const req = token => ({ ip: '127.0.0.1', get: () => token ? `Bearer ${token}` : '' });

describe('API rate limit identity', () => {
  it('separates verified accounts on one shared IP', () => {
    process.env.JWT_SECRET = secret;
    const one = jwt.sign({ userId: '507f1f77bcf86cd799439011', role: 'customer' }, secret);
    const two = jwt.sign({ userId: '507f1f77bcf86cd799439012', role: 'customer' }, secret);
    expect(keyFor(req(one))).not.toBe(keyFor(req(two)));
    expect(keyFor(req(one))).toBe('customer:507f1f77bcf86cd799439011');
  });
  it('does not grant forged, expired, or malformed tokens a fresh identity budget', () => {
    process.env.JWT_SECRET = secret;
    for (const token of [
      jwt.sign({ userId: '507f1f77bcf86cd799439011', role: 'customer' }, 'wrong-secret'),
      jwt.sign({ userId: '507f1f77bcf86cd799439011', role: 'customer' }, secret, { expiresIn: -1 }),
      jwt.sign({ userId: 'arbitrary', role: 'customer' }, secret),
      'malformed'
    ]) expect(keyFor(req(token))).toBe(keyFor(req()));
  });
});
