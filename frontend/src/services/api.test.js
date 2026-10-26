// Runtime validation coverage for multipart payment submission behavior.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, request } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('customer payment submission', () => {
  it.each([
    ['item reservation', 'submitReservationPayment', '/api/reservations/reservation-id/payment'],
    ['service booking', 'submitServiceRequestPayment', '/api/service-requests/service-id/payment'],
  ])('sends a receipt and reference for a %s', async (_label, method, expectedPath) => {
    const proof = new Blob(['receipt'], { type: 'image/png' });
    vi.stubGlobal('localStorage', { getItem: () => 'customer-token', removeItem: vi.fn() });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true }),
    }));

    const result = await api[method](
      method === 'submitReservationPayment' ? 'reservation-id' : 'service-id',
      { reference: '1234567890', proof },
    );

    expect(result.success).toBe(true);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toContain(expectedPath);
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get('reference')).toBe('1234567890');
    expect(options.body.get('proof').type).toBe('image/png');
  });
});

describe('request authentication expiry handling', () => {
  const mockUnauthorized = (tokens = {}) => {
    const removeItem = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => tokens[key] || null),
      removeItem
    });
    vi.stubGlobal('window', {
      location: { pathname: '/customer/profile', search: '?tab=security', hash: '', assign },
      dispatchEvent: vi.fn()
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Unauthorized' })
    }));
    return { removeItem, assign };
  };

  it('does not attach or clear the admin token on failed customer login', async () => {
    const { removeItem, assign } = mockUnauthorized({ adminToken: 'admin-token' });

    await expect(api.loginCustomer({ email: 'wrong@example.com', password: 'wrong' }))
      .rejects.toMatchObject({ status: 401 });

    expect(fetch.mock.calls[0][1].headers.get('Authorization')).toBeNull();
    expect(removeItem).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('keeps the customer token when a protected password request returns 401', async () => {
    const { removeItem, assign } = mockUnauthorized({ customerToken: 'customer-token' });

    await expect(api.changeCustomerPassword({
      currentPassword: 'wrong',
      newPassword: 'replacement'
    })).rejects.toMatchObject({ status: 401 });

    expect(removeItem).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('clears and redirects only the customer token after a real customer 401', async () => {
    const { removeItem, assign } = mockUnauthorized({
      customerToken: 'customer-token',
      adminToken: 'admin-token'
    });

    await expect(api.getCustomerReservations()).rejects.toMatchObject({ status: 401 });

    expect(removeItem).toHaveBeenCalledOnce();
    expect(removeItem).toHaveBeenCalledWith('customerToken');
    expect(assign).toHaveBeenCalledWith('/customer/login?returnTo=%2Fcustomer%2Fprofile%3Ftab%3Dsecurity');
  });

  it('does not clear a token for the delete-account endpoint', async () => {
    const { removeItem, assign } = mockUnauthorized({ customerToken: 'customer-token' });

    await expect(request('/api/customers/me', {
      method: 'DELETE',
      body: JSON.stringify({ password: 'wrong', confirmation: 'DELETE' }),
      tokenKey: 'customerToken'
    })).rejects.toMatchObject({ status: 401 });

    expect(removeItem).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
