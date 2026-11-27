const Mechanic = require('../models/mechanic');
const ServiceRequest = require('../models/serviceRequest');

async function checkAvailableMechanic(mechanicId, session, startWork = false) {
  // Write the same mechanic document on assignments and starts to serialize competing jobs.
  const update = startWork ? { $set: { availabilityStatus: 'busy', availabilityUpdatedAt: new Date() } } : { $inc: { __v: 1 } };
  const mechanic = await Mechanic.findOneAndUpdate({ _id: mechanicId, isActive: true, availabilityStatus: { $nin: ['busy','on-leave'] } }, update, { session });
  const working = await ServiceRequest.exists({ status: 'in-progress', $or: [{ mechanic: mechanicId }, { mechanicId }] }).session(session);
  if (!mechanic || working) throw Object.assign(new Error('Mechanic is not available'), { status: 400 });
}

async function releaseMechanic(mechanicId, session) {
  const working = await ServiceRequest.exists({ status: 'in-progress', $or: [{ mechanic: mechanicId }, { mechanicId }] }).session(session);
  if (!working) await Mechanic.updateOne({ _id: mechanicId, availabilityStatus: 'busy' }, { $set: { availabilityStatus: 'available', availabilityUpdatedAt: new Date() } }, { session });
}

module.exports = { checkAvailableMechanic, releaseMechanic };
