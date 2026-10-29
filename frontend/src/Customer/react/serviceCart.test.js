import { describe, expect, it } from 'vitest';
import { getCartSummary, replaceServiceCartItem } from './serviceCart';

describe('service cart helpers', () => {
  const booking = {
    kind: 'service',
    key: 'bearing-booking',
    id: 'bearing',
    bookingDate: '2026-11-02',
    startTime: '10:00',
    units: 2,
    estimatedPrice: 400
  };

  it('updates a booking in place without changing its cart identity or count', () => {
    const cart = [booking, { kind: 'product', key: 'oil', price: 250, quantity: 1 }];
    const result = replaceServiceCartItem(cart, booking.key, {
      ...booking,
      bookingDate: '2026-11-03',
      estimatedPrice: 500
    });

    expect(result.updated).toBe(true);
    expect(result.cart).toHaveLength(2);
    expect(result.cart[0]).toMatchObject({
      key: 'bearing-booking',
      bookingDate: '2026-11-03',
      estimatedPrice: 500
    });
  });

  it('leaves the old booking unchanged when the selected slot is unavailable', () => {
    const cart = [booking];
    const result = replaceServiceCartItem(cart, booking.key, {
      ...booking,
      startTime: '11:00'
    }, false);

    expect(result.updated).toBe(false);
    expect(result.cart).toBe(cart);
    expect(result.cart[0]).toEqual(booking);
  });

  it('summarizes item down payment and full service payment separately', () => {
    expect(getCartSummary([
      { kind: 'product', price: 250, quantity: 2 },
      { kind: 'service', estimatedPrice: 400 },
      { kind: 'service', price: 150, mechanicFee: 50 }
    ], 30)).toEqual({
      hasProducts: true,
      hasServices: true,
      showCartTotal: true,
      productSubtotal: 500,
      serviceSubtotal: 600,
      downPayment: 150,
      balanceDueAtPickup: 350,
      cartTotal: 1100
    });
  });
});
