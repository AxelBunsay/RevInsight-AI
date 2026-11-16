const ServiceRequest = require('../models/serviceRequest');
const ServiceSlotLock = require('../models/serviceSlotLock');

const capacityStatuses = ['pending', 'assigned', 'confirmed', 'accepted', 'in-progress', 'completed'];

const countActiveBookings = (startTime, endTime, dayStart, nextDayStart, session) => {
  const query = ServiceRequest.countDocuments({
    scheduledDate: { $gte: dayStart, $lt: nextDayStart },
    startTime: { $lt: endTime },
    $or: [
      { endTime: { $gt: startTime } },
      { endTime: null, startTime }
    ],
    status: { $in: capacityStatuses }
  });
  return session ? query.session(session) : query;
};

const ensureSlotLocks = async (dateKey, startTime, endTime) => {
  await ServiceSlotLock.init();
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  for (let minute = start; minute < end; minute += 30) {
    const lockTime = minutesToTime(minute);
    try {
      await ServiceSlotLock.create({ dateKey, startTime: lockTime, bookingVersion: 0 });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
};

const readSlotCount = async (dateKey, startTime, endTime, dayStart, nextDayStart) => {
  return countActiveBookings(startTime, endTime, dayStart, nextDayStart);
};

const timeToMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const serializeSlotBooking = async ({ dateKey, startTime, endTime, session }) => {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  let finalLock;
  for (let minute = start; minute < end; minute += 30) {
    const lockTime = minutesToTime(minute);
    finalLock = await ServiceSlotLock.findOneAndUpdate(
      { dateKey, startTime: lockTime },
      { $inc: { bookingVersion: 1 } },
      { new: true, session }
    ).select('_id');
    if (!finalLock) {
      throw Object.assign(new Error('Booking time is temporarily unavailable. Please try again.'), { status: 503 });
    }
  }
  return finalLock;
};

module.exports = {
  countActiveBookings,
  ensureSlotLocks,
  serializeSlotBooking,
  readSlotCount
};
