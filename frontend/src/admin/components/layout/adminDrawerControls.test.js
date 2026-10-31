import { describe, expect, it } from 'vitest';
import { adminDrawerReducer } from './adminLayoutBreakpoints';

describe('admin drawer interaction state', () => {
  it('opens from the hamburger and closes after an overlay tap', () => {
    const opened = adminDrawerReducer(
      { open: false, pathname: null },
      { type: 'open', pathname: '/admin' }
    );

    expect(opened.open).toBe(true);
    expect(adminDrawerReducer(opened, { type: 'overlay' }).open).toBe(false);
  });

  it('closes after navigation and Escape', () => {
    const opened = { open: true, pathname: '/admin' };

    expect(adminDrawerReducer(opened, { type: 'navigation' }).open).toBe(false);
    expect(adminDrawerReducer(opened, { type: 'escape' }).open).toBe(false);
  });
});