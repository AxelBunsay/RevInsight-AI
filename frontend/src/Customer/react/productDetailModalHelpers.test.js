import { describe, expect, it, vi } from 'vitest';
import { closeOnProductModalBackdrop, handleProductModalKeyDown } from './productDetailModalHelpers';

const makeEvent = (key, options = {}) => ({
  key,
  shiftKey: Boolean(options.shiftKey),
  preventDefault: vi.fn()
});

const makeFocusable = () => ({
  getClientRects: () => [{}],
  focus: vi.fn()
});

describe('product detail modal keyboard and backdrop behavior', () => {
  it('closes on Escape and a click on the overlay, but not a click inside the dialog', () => {
    const onClose = vi.fn();
    const escape = makeEvent('Escape');
    handleProductModalKeyDown(escape, { dialog: null, activeElement: null, onClose });
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();

    expect(closeOnProductModalBackdrop({ target: 'overlay', currentTarget: 'overlay' }, onClose)).toBe(true);
    expect(closeOnProductModalBackdrop({ target: 'dialog', currentTarget: 'overlay' }, onClose)).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('traps forward and reverse Tab navigation at the dialog boundaries', () => {
    const first = makeFocusable();
    const last = makeFocusable();
    const dialog = {
      querySelectorAll: () => [first, last],
      contains: (element) => element === first || element === last,
      focus: vi.fn()
    };
    const nextFromLast = makeEvent('Tab');
    handleProductModalKeyDown(nextFromLast, { dialog, activeElement: last, onClose: vi.fn() });
    expect(nextFromLast.preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();

    const previousFromFirst = makeEvent('Tab', { shiftKey: true });
    handleProductModalKeyDown(previousFromFirst, { dialog, activeElement: first, onClose: vi.fn() });
    expect(previousFromFirst.preventDefault).toHaveBeenCalledOnce();
    expect(last.focus).toHaveBeenCalledOnce();
  });

  it('moves focus into the dialog when Tab is pressed from outside it', () => {
    const first = makeFocusable();
    const dialog = {
      querySelectorAll: () => [first],
      contains: () => false,
      focus: vi.fn()
    };
    const tab = makeEvent('Tab');
    handleProductModalKeyDown(tab, { dialog, activeElement: null, onClose: vi.fn() });
    expect(tab.preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();
  });
});
