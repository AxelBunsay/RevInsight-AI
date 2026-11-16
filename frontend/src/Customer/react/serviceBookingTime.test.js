import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ServiceBookingTimeSelect from './ServiceBookingTimeSelect';
import { request } from '../../services/api';
import {
  bookingTimeOptionLabel,
  canSubmitServiceBooking,
  getBookingTimeGroups,
  getDateChangeState,
  runWithBookingLock
} from './serviceBookingTime';

const slots = [
  { startTime: '12:00', status: 'full', remaining: 0 },
  { startTime: '10:30', status: 'available', remaining: 1 },
  { startTime: '11:00', status: 'passed', remaining: 1 },
  { startTime: '13:00', status: 'available', remaining: 2 }
];

describe('service booking time options', () => {
  it('ignores a second submit while the first booking request is pending', async () => {
    const lockRef = { current: false };
    const setSending = vi.fn();
    let finishRequest;
    const submit = vi.fn(() => new Promise((resolve) => { finishRequest = resolve; }));
    const firstClick = runWithBookingLock(lockRef, setSending, submit);
    const secondClick = await runWithBookingLock(lockRef, setSending, submit);

    expect(secondClick).toBe(false);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(setSending).toHaveBeenCalledWith(true);
    finishRequest();
    await firstClick;
    expect(lockRef.current).toBe(false);
    expect(setSending).toHaveBeenLastCalledWith(false);
  });

  it('resets the sending state when the booking request fails', async () => {
    const lockRef = { current: false };
    const setSending = vi.fn();

    await expect(runWithBookingLock(lockRef, setSending, async () => {
      throw new Error('Booking failed');
    })).rejects.toThrow('Booking failed');

    expect(lockRef.current).toBe(false);
    expect(setSending).toHaveBeenLastCalledWith(false);
  });

  it('shows sending state and booking failures in the form', () => {
    const formSource = readFileSync(new URL('./ServiceBookingForm.jsx', import.meta.url), 'utf8');

    expect(formSource).toContain("isSendingBooking ? 'Sending...' : 'Send request'");
    expect(formSource).toContain('disabled={isSendingBooking ||');
    expect(formSource).toContain('setBookingError(error.message ||');
    expect(formSource).toContain('{bookingError && <p className="customer-error" role="alert">{bookingError}</p>}');
  });

  it('uses a clear timeout message and preserves the server message for a full slot', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    vi.stubGlobal('fetch', vi.fn((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const pending = request('/api/services/bookings', { tokenKey: null, timeout: 20_000 });
    controller.abort();

    await expect(pending).rejects.toThrow('The request took too long. Please check My Bookings before trying again.');
    expect(timeout).toHaveBeenCalledWith(20_000);

    vi.unstubAllGlobals();
    timeout.mockRestore();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      headers: { get: () => 'application/json' },
      json: async () => ({ message: 'That time was just booked. Please choose another.' }),
      ok: false,
      status: 409
    }));
    await expect(request('/api/services/bookings', { tokenKey: null, timeout: 20_000 }))
      .rejects.toMatchObject({ status: 409, message: 'That time was just booked. Please choose another.' });
    vi.unstubAllGlobals();
  });

  it('groups options by time, formats remaining capacity, disables full times and omits passed times', () => {
    const groups = getBookingTimeGroups(slots);

    expect(groups.Morning.map((slot) => slot.startTime)).toEqual(['10:30']);
    expect(groups.Afternoon.map((slot) => slot.startTime)).toEqual(['12:00', '13:00']);
    expect([...groups.Morning, ...groups.Afternoon].some((slot) => slot.status === 'passed')).toBe(false);
    expect(bookingTimeOptionLabel(groups.Morning[0])).toBe('10:30 AM · 1 left');
    expect(bookingTimeOptionLabel(groups.Afternoon[0])).toBe('12:00 PM · Full');
    expect(groups.Afternoon[0].status).toBe('full');
  });

  it('renders optgroups and disabled full options in the native select', () => {
    const markup = renderToStaticMarkup(
      createElement(ServiceBookingTimeSelect, {
        slots,
        timeSlot: '',
        isLoading: false,
        onChange: () => {}
      })
    );

    expect(markup).toContain('<optgroup label="Morning">');
    expect(markup).toContain('<optgroup label="Afternoon">');
    expect(markup).toContain('<option value="12:00" disabled="">12:00 PM · Full</option>');
    expect(markup).not.toContain('11:00 AM');
    expect(markup).toContain('10:30 AM · 1 left');
    expect(markup).toContain('1:00 PM · 2 left');
  });

  it('uses one disabled no-times option when none are available and retains a selected full cart time', () => {
    const render = (timeSlot) => renderToStaticMarkup(
      createElement(ServiceBookingTimeSelect, {
        slots: [{ startTime: '12:00', status: 'full', remaining: 0 }],
        timeSlot,
        isLoading: false,
        onChange: () => {}
      })
    );

    expect(render('')).toContain('No available times on this date');
    expect(render('')).not.toContain('<optgroup');
    expect(render('12:00')).toContain('<option value="12:00" disabled="" selected="">12:00 PM · Full</option>');
  });

  it('shows no times when no slot is available, but retains the selected full cart time', () => {
    const fullOnly = [{ startTime: '12:00', status: 'full', remaining: 0 }];

    expect(getBookingTimeGroups(fullOnly).hasTimes).toBe(false);
    expect(getBookingTimeGroups(fullOnly, '12:00').hasTimes).toBe(true);
  });

  it('resets the selected time when the booking date changes', () => {
    expect(getDateChangeState('2026-11-02')).toEqual({
      bookingDate: '2026-11-02',
      timeSlot: ''
    });
  });

  it('enables booking only when date, motorcycle, and an available time are selected', () => {
    const base = {
      bookingDate: '2026-11-02',
      timeSlot: '10:30',
      selectedSlot: { startTime: '10:30', status: 'available' },
      motorcycle: 'Honda Click',
      isLoadingSlots: false
    };

    expect(canSubmitServiceBooking(base)).toBe(true);
    expect(canSubmitServiceBooking({ ...base, bookingDate: '' })).toBe(false);
    expect(canSubmitServiceBooking({ ...base, motorcycle: '' })).toBe(false);
    expect(canSubmitServiceBooking({ ...base, timeSlot: '' })).toBe(false);
    expect(canSubmitServiceBooking({ ...base, selectedSlot: { status: 'full' } })).toBe(false);
    expect(canSubmitServiceBooking({ ...base, isLoadingSlots: true })).toBe(false);
  });
});
