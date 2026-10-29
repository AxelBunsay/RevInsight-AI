import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  CustomerAccountMenu,
  CustomerAccountMenuTrigger
} from './CustomerLayout';
import { customerHeaderMenuReducer, isOutsideCustomerMenus } from './customerHeaderMenu';

const initialMenuState = { accountOpen: false, notificationsOpen: false };

describe('customer account menu', () => {
  it('opens by click action, toggles closed, and closes notifications when opened', () => {
    const accountOpen = customerHeaderMenuReducer(initialMenuState, { type: 'toggle-account' });
    expect(accountOpen).toEqual({ accountOpen: true, notificationsOpen: false });
    expect(customerHeaderMenuReducer(accountOpen, { type: 'toggle-account' })).toEqual(initialMenuState);
    expect(customerHeaderMenuReducer(
      { accountOpen: false, notificationsOpen: true },
      { type: 'toggle-account' }
    )).toEqual(accountOpen);
  });

  it('closes on Escape or an outside click and closes the account menu when notifications open', () => {
    const open = { accountOpen: true, notificationsOpen: false };
    expect(customerHeaderMenuReducer(open, { type: 'close' })).toEqual(initialMenuState);
    expect(customerHeaderMenuReducer(open, { type: 'toggle-notifications' }))
      .toEqual({ accountOpen: false, notificationsOpen: true });

    const target = {};
    expect(isOutsideCustomerMenus(target, { contains: () => false }, { contains: () => false })).toBe(true);
    expect(isOutsideCustomerMenus(target, { contains: (node) => node === target }, { contains: () => false })).toBe(false);
    expect(isOutsideCustomerMenus(target, { contains: () => false }, { contains: (node) => node === target })).toBe(false);
  });

  it('exposes an accessible trigger and both menu destinations', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <CustomerAccountMenuTrigger isActive isExpanded onClick={() => {}} />
        <CustomerAccountMenu isOpen onSelect={() => {}} />
      </MemoryRouter>
    );

    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('role="menu"');
    expect(markup).toContain('href="/customer/profile"');
    expect(markup).toContain('href="/my-purchases?tab=all"');
    expect(markup).toContain('My profile');
    expect(markup).toContain('My purchases');
  });
});
