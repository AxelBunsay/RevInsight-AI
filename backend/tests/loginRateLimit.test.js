import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const createLoginRateLimit = require('../middleware/loginRateLimit');

describe('login rate limit settings', () => {
  it('defaults to five attempts in a two-minute window', () => {
    expect(createLoginRateLimit.getLoginRateLimitSettings({})).toEqual({
      windowMinutes: 2,
      windowMs: 120000,
      limit: 5
    });
  });

  it('uses valid environment overrides for every login route', () => {
    expect(createLoginRateLimit.getLoginRateLimitSettings({
      LOGIN_RATE_LIMIT_WINDOW_MINUTES: '7',
      LOGIN_RATE_LIMIT_MAX: '9'
    })).toEqual({
      windowMinutes: 7,
      windowMs: 420000,
      limit: 9
    });
  });

  it('reports the actual remaining retry time in minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T00:00:00.000Z'));
    try {
      expect(createLoginRateLimit.getRetryMessage({
        rateLimit: { resetTime: new Date(Date.now() + 61_000) }
      }, { windowMs: 120_000 })).toEqual({
        message: 'Too many login attempts. Please try again in 2 minutes.'
      });
      expect(createLoginRateLimit.getRetryMessage({
        rateLimit: { resetTime: new Date(Date.now() + 20_000) }
      }, { windowMs: 120_000 })).toEqual({
        message: 'Too many login attempts. Please try again in 1 minute.'
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('blocks the configured number of requests and returns the live retry window', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousWindow = process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES;
    const previousLimit = process.env.LOGIN_RATE_LIMIT_MAX;
    process.env.NODE_ENV = 'development';
    process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES = '2';
    process.env.LOGIN_RATE_LIMIT_MAX = '1';

    try {
      const app = express();
      app.set('trust proxy', 1);
      app.post('/login', createLoginRateLimit(), (req, res) => res.sendStatus(204));
      const client = supertest(app);

      expect((await client.post('/login')).status).toBe(204);
      const limited = await client.post('/login');
      expect(limited.status).toBe(429);
      expect(limited.body.message).toMatch(/^Too many login attempts\. Please try again in 2 minutes\.$/);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousWindow === undefined) delete process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES;
      else process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES = previousWindow;
      if (previousLimit === undefined) delete process.env.LOGIN_RATE_LIMIT_MAX;
      else process.env.LOGIN_RATE_LIMIT_MAX = previousLimit;
    }
  });
});
