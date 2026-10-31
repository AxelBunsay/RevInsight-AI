import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLogin from '../admin/pages/Login';
import { CustomerLogin, CustomerRegister } from '../Customer/react/CustomerAuth';
import { CustomerPage } from '../Customer/react/CustomerLayout';
import { CustomerPrototypeProvider } from '../Customer/react/CustomerPrototypeProvider';
import MechanicLogin from '../Mechanic/MechanicLogin';
import AuthContext from '../context/authContext';
import SessionBootstrap from './SessionBootstrap';

function createStorage(values = {}) {
  return {
    getItem: (key) => values[key] || null,
    setItem: vi.fn(),
    removeItem: vi.fn()
  };
}

function renderScreen(pathname, screen) {
  return renderToStaticMarkup(createElement(
    MemoryRouter,
    { initialEntries: [pathname] },
    createElement(
      AuthContext.Provider,
      { value: { isAuthenticated: false, login: vi.fn() } },
      createElement(
        CustomerPrototypeProvider,
        null,
        createElement(SessionBootstrap, null, screen)
      )
    )
  ));
}

function customerServicesScreen() {
  return createElement(CustomerPage, {
    title: 'Motorcycle Services',
    description: 'Book expert care for your motorcycle.'
  });
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
  vi.stubGlobal('sessionStorage', createStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session bootstrap route isolation', () => {
  it.each([
    ['mechanicToken', '/admin/login', createElement(AdminLogin), 'ADMIN ACCESS'],
    ['mechanicToken', '/customer/services', customerServicesScreen(), 'Motorcycle Services'],
    ['customerToken', '/admin/login', createElement(AdminLogin), 'ADMIN ACCESS'],
    ['customerToken', '/mechanic/login', createElement(MechanicLogin), 'Mechanic Login'],
    ['adminToken', '/mechanic/login', createElement(MechanicLogin), 'Mechanic Login'],
    ['adminToken', '/customer/services', customerServicesScreen(), 'Motorcycle Services'],
    ['adminToken', '/customer/login', createElement(CustomerLogin), 'Welcome back!'],
    ['adminToken', '/customer/register', createElement(CustomerRegister), 'Create your account']
  ])('renders %s-independent screen at %s', (tokenKey, pathname, screen, expectedContent) => {
    vi.stubGlobal('localStorage', createStorage({ [tokenKey]: 'stored-token' }));

    const markup = renderScreen(pathname, screen);

    expect(markup).toContain(expectedContent);
    expect(markup).not.toContain('Restoring your session');
    expect(markup).not.toContain('Mechanic Dashboard');
  });
});