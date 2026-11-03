import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerPrototypeProvider } from './CustomerPrototypeProvider';
import { CustomerLogin, CustomerRegister } from './CustomerAuth';
import {
  sanitizeCustomerUsername,
  validateCustomerUsername
} from '../../../../shared/customerUsername.mjs';

const renderAuth = (Component) => renderToStaticMarkup(
  createElement(
    MemoryRouter,
    null,
    createElement(CustomerPrototypeProvider, null, createElement(Component))
  )
);

describe('customer username authentication UI', () => {
  it('uses a plain text username-or-email field for sign-in', () => {
    const markup = renderAuth(CustomerLogin);
    expect(markup).toContain('Username or email<input type="text" required="" autoComplete="username" placeholder="Username or email"');
    expect(markup).not.toContain('type="email" required="" placeholder="you@email.com"');
  });

  it('places the username field between last name and email during registration', () => {
    const markup = renderAuth(CustomerRegister);
    expect(markup.indexOf('Last Name')).toBeLessThan(markup.indexOf('Username<input'));
    expect(markup.indexOf('Username<input')).toBeLessThan(markup.indexOf('Email<input'));
    expect(markup).toContain('autoComplete="username"');
    expect(markup).toContain('4-20 letters, numbers or underscore');
  });

  it('sanitizes typed values and rejects invalid or reserved usernames', () => {
    expect(sanitizeCustomerUsername('Ride r@123')).toBe('Rider123');
    expect(validateCustomerUsername('rider_123').isValid).toBe(true);
    expect(validateCustomerUsername('abc').isValid).toBe(false);
    expect(validateCustomerUsername('administrator').isValid).toBe(false);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});