const ServiceRequest = require('../models/serviceRequest');
const ServiceSlotLock = require('../models/serviceSlotLock');

const capacityStatuses = ['pending', 'assigned', 'confirmed', 'accepted', 'in-progress', 'completed'];

const countActiveBookings = (startTime, dayStart, nextDayStart, session) => {
  const query = ServiceRequest.countDocuments({
    scheduledDate: { $gte: dayStart, $lt: nextDayStart },
    startTime,
    status: { $in: capacityStatuses }
  });
  return session ? query.session(session) : query;
};

const ensureSlotLock = async (dateKey, startTime) => {
  await ServiceSlotLock.init();
  try {
    await ServiceSlotLock.updateOne(
      { dateKey, startTime },
      { $setOnInsert: { dateKey, startTime, bookingVersion: 0 } },
      { upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
};

const readSlotCount = async (dateKey, startTime, dayStart, nextDayStart) => {
  return countActiveBookings(startTime, dayStart, nextDayStart);
};

const serializeSlotBooking = async ({ dateKey, startTime, session }) => {
  await ensureSlotLock(dateKey, startTime);
  return ServiceSlotLock.findOneAndUpdate(
    { dateKey, startTime },
    { $inc: { bookingVersion: 1 } },
    { new: true, session }
  ).select('_id');
};

module.exports = {
  countActiveBookings,
  serializeSlotBooking,
  readSlotCount
};
