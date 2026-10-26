import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const { authorizeRoles } = require('../middleware/authorize');

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

describe('authorizeRoles middleware', () => {
  afterEach(() => vi.restoreAllMocks());

  it('allows a token whose role is permitted', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const req = {
      headers: {
        authorization: `Bearer ${jwt.sign({ userId: 'admin-id', role: 'admin' }, process.env.JWT_SECRET)}`
      }
    };
    const res = response();
    const next = vi.fn();

    await authorizeRoles('admin')(req, res, next);

    expect(req.user).toMatchObject({ userId: 'admin-id', role: 'admin' });
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it('rejects a valid token with a disallowed role', async () => {
    process.env.JWT_SECRET = 'test-secret';
    const req = {
      headers: {
        authorization: `Bearer ${jwt.sign({ userId: 'customer-id', role: 'customer' }, process.env.JWT_SECRET)}`
      }
    };
    const res = response();
    const next = vi.fn();

    await authorizeRoles('admin')(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ message: 'Access denied' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a missing token', async () => {
    const req = { headers: {} };
    const res = response();
    const next = vi.fn();

    await authorizeRoles('admin')(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
