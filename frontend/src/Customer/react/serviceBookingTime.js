function hourOf(time) {
  return Number(String(time).slice(0, 2));
}

export function getBookingTimeGroups(slots, selectedTime = '') {
  const visibleSlots = (Array.isArray(slots) ? slots : [])
    .filter((slot) => slot.status !== 'passed')
    .slice()
    .sort((left, right) => left.startTime.localeCompare(right.startTime));
  const hasAvailable = visibleSlots.some((slot) => slot.status === 'available');
  const selectedFullSlot = visibleSlots.find((slot) => slot.startTime === selectedTime && slot.status === 'full');
  const hasTimes = hasAvailable || Boolean(selectedFullSlot);

  return {
    hasTimes,
    Morning: hasTimes ? visibleSlots.filter((slot) => hourOf(slot.startTime) < 12) : [],
    Afternoon: hasTimes ? visibleSlots.filter((slot) => hourOf(slot.startTime) >= 12) : []
  };
}

export function bookingTimeOptionLabel(slot) {
  const [hours, minutes] = slot.startTime.split(':').map(Number);
  const timeLabel = `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
  if (slot.status !== 'available') return `${timeLabel} · Full`;
  const remaining = Number(slot.remaining);
  return `${timeLabel} · ${Number.isFinite(remaining) ? remaining : 0} left`;
}

export function getDateChangeState(date) {
  return { bookingDate: date, timeSlot: '' };
}

export function canSubmitServiceBooking({ bookingDate, timeSlot, selectedSlot, motorcycle, isLoadingSlots }) {
  return Boolean(bookingDate && timeSlot && selectedSlot?.status === 'available'
    && motorcycle.trim() && !isLoadingSlots);
}
