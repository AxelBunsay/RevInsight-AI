import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { summarizeRecord } = require('../scripts/diagnoseLogin');

describe('login diagnostics output', () => {
  it('reports login fields and password presence without exposing password values', () => {
    const result = summarizeRecord('mechanics', {
      email: 'mechanic@example.com',
      username: 'donjhon',
      normalizedUsername: 'donjhon',
      role: 'mechanic',
      isActive: true,
      password: 'a-password-hash'
    });

    expect(result).toEqual({
      collection: 'mechanics',
      exists: true,
      fieldsPresent: ['email', 'username', 'normalizedUsername', 'role', 'isActive', 'password'],
      values: {
        email: 'mechanic@example.com',
        username: 'donjhon',
        normalizedUsername: 'donjhon',
        role: 'mechanic',
        isActive: true
      },
      passwordHashExists: true
    });
    expect(JSON.stringify(result)).not.toContain('a-password-hash');
  });
});
