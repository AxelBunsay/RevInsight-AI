import { getBookingTimeGroups, bookingTimeOptionLabel } from './serviceBookingTime';

export default function ServiceBookingTimeSelect({
  slots,
  timeSlot,
  isLoading,
  closedMessage,
  availabilityError,
  onChange
}) {
  const groups = getBookingTimeGroups(slots, timeSlot);
  const placeholder = isLoading
    ? 'Select a time'
    : groups.hasTimes
      ? 'Select a time'
      : 'No available times on this date';

  return <div className="customer-booking-time-field">
    <label htmlFor="service-booking-time">Booking time</label>
    <select
      id="service-booking-time"
      value={timeSlot}
      disabled={isLoading || Boolean(closedMessage) || Boolean(availabilityError)}
      onChange={onChange}
    >
      <option value="" disabled>{placeholder}</option>
      {['Morning', 'Afternoon'].map((group) => groups[group].length > 0 && <optgroup label={group} key={group}>
        {groups[group].map((slot) => <option
          key={slot.startTime}
          value={slot.startTime}
          disabled={slot.status !== 'available'}
        >{bookingTimeOptionLabel(slot)}</option>)}
      </optgroup>)}
    </select>
  </div>;
}
