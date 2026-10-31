import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerPrototypeProvider } from './CustomerPrototypeProvider';
import { CustomerLogin } from './CustomerAuth';

describe('customer remember-me login', () => {
  it('renders remember me checked by default under the password field', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', storage);
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          CustomerPrototypeProvider,
          null,
          createElement(CustomerLogin)
        )
      )
    );

    expect(markup).toContain('class="customer-auth-remember"');
    expect(markup).toContain('type="checkbox" checked=""');
    expect(markup.indexOf('placeholder="********"')).toBeLessThan(markup.indexOf('class="customer-auth-remember"'));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
