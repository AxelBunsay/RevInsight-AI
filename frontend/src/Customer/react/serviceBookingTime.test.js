import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ServiceBookingTimeSelect from './ServiceBookingTimeSelect';
import {
  bookingTimeOptionLabel,
  canSubmitServiceBooking,
  getBookingTimeGroups,
  getDateChangeState
} from './serviceBookingTime';

const slots = [
  { startTime: '12:00', status: 'full', remaining: 0 },
  { startTime: '10:30', status: 'available', remaining: 1 },
  { startTime: '11:00', status: 'passed', remaining: 1 },
  { startTime: '13:00', status: 'available', remaining: 2 }
];

describe('service booking time options', () => {
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
