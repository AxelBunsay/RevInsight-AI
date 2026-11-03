const Service = require('../models/service');
const ServiceRequest = require('../models/serviceRequest');
const Mechanic = require('../models/mechanic');
const ReservationSettings = require('../models/reservationSettings');
const mongoose = require('mongoose');
const { calculateServicePayment } = require('../utils/servicePayment');
const {
  countActiveBookings,
  readSlotCount,
  serializeSlotBooking
} = require('../utils/serviceSlotCapacity');

const TIME_ZONE = 'Asia/Manila';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SLOT_INTERVAL_MINUTES = 30;
const ACTIVE_UNPAID_BOOKING_STATUSES = ['pending', 'assigned', 'confirmed', 'accepted', 'in-progress'];

const timeToMinutes = (time) => {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const datePartsInManila = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
};

const todayInManila = () => {
  const parts = datePartsInManila();
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const parseDateKey = (dateKey) => {
  if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== dateKey) return null;
  return { year, month, day, date };
};

const manilaDayRange = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return null;
  const start = new Date(Date.UTC(date.year, date.month - 1, date.day) - 8 * 60 * 60 * 1000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
};

const durationInMinutes = (service, units = 1) => {
  const duration = Math.max(1, Number(service.durationMinutes) || 60);
  return service.pricePerUnit && service.scaleDuration !== false ? duration * units : duration;
};

const validateServiceUnits = (service, value) => {
  if (typeof value === 'boolean') {
    throw Object.assign(new Error('Units must be a whole number.'), { status: 400 });
  }
  const units = value === undefined ? 1 : Number(value);
  if (!Number.isInteger(units) || units < 1 || units > (service.pricePerUnit ? Number(service.maxUnits) || 2 : 1)) {
    throw Object.assign(new Error(service.pricePerUnit
      ? `Units must be a whole number from 1 to ${Number(service.maxUnits) || 2}.`
      : 'This service does not allow multiple units.'), { status: 400 });
  }
  return units;
};

const slotLabel = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
};

const buildScheduleInfo = async () => {
  const settings = await ReservationSettings.getDefaults();
  return {
    openDays: settings.openDays,
    openTime: settings.openTime,
    closeTime: settings.closeTime,
    slotCapacity: settings.slotCapacity,
    maxDaysAhead: settings.maxDaysAhead,
    pendingPaymentHours: settings.pendingPaymentHours,
    serviceDownPaymentPercent: settings.serviceDownPaymentPercent ?? settings.downPaymentPercent
  };
};

const ensureCustomerUnpaidBookingLimit = async (customerId, session) => {
  const count = await ServiceRequest.countDocuments({
    $or: [{ user: customerId }, { customerId }],
    status: { $in: ACTIVE_UNPAID_BOOKING_STATUSES },
    paymentStatus: 'Payment Pending'
  }).session(session);
  if (count >= 3) {
    throw Object.assign(new Error('You can have up to 3 active unpaid service bookings at a time. Submit payment or wait for an existing booking to close.'), { status: 409 });
  }
};

const validateDateForSchedule = (dateKey, schedule) => {
  const date = parseDateKey(dateKey);
  if (!date) return { error: 'Choose a valid booking date.' };
  const today = parseDateKey(todayInManila());
  const dayOffset = Math.round((date.date.getTime() - today.date.getTime()) / 86400000);
  if (dayOffset < 0) return { error: 'Booking dates cannot be in the past.' };
  if (dayOffset > schedule.maxDaysAhead) return { error: `Bookings can only be made up to ${schedule.maxDaysAhead} days ahead.` };
  const dayName = DAY_NAMES[date.date.getUTCDay()];
  return { date, dayName, closed: !schedule.openDays.includes(dayName) };
};

const currentManilaMinutes = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
};

const getGeneratedSlots = async (serviceId, dateKey, requestedUnits = 1) => {
  if (!mongoose.Types.ObjectId.isValid(serviceId)) return { error: 'Service not found.', status: 404 };
  const service = await Service.findOne({ _id: serviceId, isActive: { $ne: false } }).lean();
  if (!service) return { error: 'Service not found.', status: 404 };
  let units;
  try {
    units = validateServiceUnits(service, requestedUnits);
  } catch (error) {
    return { error: error.message, status: error.status };
  }
  const schedule = await buildScheduleInfo();
  const dateValidation = validateDateForSchedule(dateKey, schedule);
  if (dateValidation.error) return { error: dateValidation.error, status: 400, schedule };
  if (dateValidation.closed) {
    const dayLabel = dateValidation.dayName === 'Sun' ? 'Sundays' : `${dateValidation.dayName}s`;
    return {
      serviceId,
      serviceType: service.name,
      date: dateKey,
      open: false,
      closedMessage: `The shop is closed on ${dayLabel}.`,
      serviceDurationMinutes: durationInMinutes(service, units),
      ...schedule,
      slots: []
    };
  }

  const openMinutes = timeToMinutes(schedule.openTime);
  const closeMinutes = timeToMinutes(schedule.closeTime);
  if (openMinutes === null || closeMinutes === null || closeMinutes <= openMinutes) {
    throw new Error('The shop booking schedule has invalid opening hours.');
  }
  const serviceDurationMinutes = durationInMinutes(service, units);
  const lastStartMinute = closeMinutes - serviceDurationMinutes;
  const dayRange = manilaDayRange(dateKey);
  const currentMinutes = dateKey === todayInManila() ? currentManilaMinutes() : -1;
  const slots = [];

  for (let start = openMinutes; start <= lastStartMinute; start += SLOT_INTERVAL_MINUTES) {
    const startTime = minutesToTime(start);
    const endTime = minutesToTime(start + serviceDurationMinutes);
    const occupied = await readSlotCount(
      dateKey,
      startTime,
      endTime,
      dayRange.start,
      dayRange.end
    );
    const remaining = Math.max(0, schedule.slotCapacity - occupied);
    const status = start <= currentMinutes ? 'passed' : remaining === 0 ? 'full' : 'available';
    slots.push({
      startTime,
      endTime,
      label: slotLabel(startTime),
      endLabel: slotLabel(endTime),
      status,
      remaining,
      remainingLabel: remaining > 0 && remaining <= 2 ? `${remaining} left` : ''
    });
  }

  return {
    serviceId,
    serviceType: service.name,
    date: dateKey,
    open: true,
    serviceDurationMinutes,
    ...schedule,
    slots
  };
};

const getServiceSlots = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const result = await getGeneratedSlots(req.params.id, req.query.date, req.query.units);
    if (result.error) return res.status(result.status).json({ message: result.error, ...result.schedule });
    res.json(result);
  } catch (error) {
    console.error('[getServiceSlots] error', error);
    res.status(500).json({ message: 'Service availability could not be loaded.' });
  }
};

const createServiceBookings = async (req, res) => {
  try {
    const bookings = req.body?.bookings;
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return res.status(400).json({ message: 'Add at least one service booking.' });
    }
    if (bookings.length > 20) return res.status(400).json({ message: 'Submit no more than 20 service bookings at a time.' });

    const schedule = await buildScheduleInfo();
    const results = [];
    for (const [index, booking] of bookings.entries()) {
      const cartKey = typeof booking?.cartKey === 'string' ? booking.cartKey.slice(0, 120) : String(index);
      try {
        if (!booking || typeof booking !== 'object') {
          throw Object.assign(new Error('A booking must include service and schedule details.'), { status: 400 });
        }
        const partsSource = booking.partsSource === undefined ? 'shop' : booking.partsSource;
        const selectedMechanicId = booking.mechanicId || booking.mechanic || null;
        if (!['shop', 'customer'].includes(partsSource)) {
          throw Object.assign(new Error('Choose whether parts come from the shop or the customer.'), { status: 400 });
        }
        if (selectedMechanicId && !mongoose.Types.ObjectId.isValid(selectedMechanicId)) {
          throw Object.assign(new Error('Choose a valid mechanic.'), { status: 400 });
        }
        if (!mongoose.Types.ObjectId.isValid(booking.serviceId)) {
          throw Object.assign(new Error('A selected service could not be found.'), { status: 400 });
        }
        const service = await Service.findOne({
          _id: booking.serviceId,
          isActive: { $ne: false }
        }).lean();
        const requestedUnits = validateServiceUnits(service, booking.units);
        const dateValidation = validateDateForSchedule(booking.date, schedule);
        if (dateValidation.error) {
          throw Object.assign(new Error(dateValidation.error), { status: 400 });
        }
        if (dateValidation.closed) {
          const dayLabel = dateValidation.dayName === 'Sun' ? 'Sundays' : `${dateValidation.dayName}s`;
          throw Object.assign(new Error(`The shop is closed on ${dayLabel}.`), { status: 400 });
        }
        if (typeof booking.vehicle !== 'string' || !booking.vehicle.trim()) {
          throw Object.assign(new Error('Choose a motorcycle for each service booking.'), { status: 400 });
        }
        const slots = await getGeneratedSlots(booking.serviceId, booking.date, requestedUnits);
        const selectedSlot = slots.slots?.find((slot) => slot.startTime === booking.startTime);
        if (!selectedSlot) {
          throw Object.assign(new Error('Choose an available booking time.'), { status: 400 });
        }
        if (selectedSlot.status === 'full') {
          throw Object.assign(new Error('That time was just booked. Please choose another.'), { status: 409 });
        }
        if (selectedSlot.startTime <= (booking.date === todayInManila() ? minutesToTime(currentManilaMinutes()) : '')) {
          throw Object.assign(new Error('Choose an available booking time.'), { status: 400 });
        }
        const dayRange = manilaDayRange(booking.date);
        const session = await mongoose.startSession();
        let serviceRequest;
        try {
          await session.withTransaction(async () => {
            if (booking.date === todayInManila() && selectedSlot.startTime <= minutesToTime(currentManilaMinutes())) {
              throw Object.assign(new Error('Choose an available booking time.'), { status: 400 });
            }

            await ensureCustomerUnpaidBookingLimit(req.user.userId, session);

            const configuredService = await Service.findOne({
              _id: booking.serviceId,
              isActive: { $ne: false }
            }).session(session).lean();
            if (!configuredService) {
              throw Object.assign(new Error('This service is no longer available.'), { status: 400 });
            }
            if (selectedMechanicId) {
              const mechanic = await Mechanic.findById(selectedMechanicId).session(session).lean();
              if (!mechanic || mechanic.isActive === false) {
                throw Object.assign(new Error('This mechanic is no longer available. Please choose another mechanic.'), { status: 400 });
              }
              if ((mechanic.availabilityStatus || 'available') === 'on-leave') {
                throw Object.assign(new Error('This mechanic is currently on leave. Please choose another mechanic.'), { status: 400 });
              }
            }
            const hasLaborPriceRange = configuredService.laborPriceMin != null || configuredService.laborPriceMax != null;
            const quoteRequired = partsSource === 'customer'
              && (hasLaborPriceRange || configuredService.laborOnlyPrice == null);
            const customerPartsNote = [booking.customerPartsNote, booking.notes]
              .find((value) => typeof value === 'string' && value.trim())?.trim().slice(0, 1000) || '';
            if (quoteRequired && !customerPartsNote) {
              throw Object.assign(new Error('Describe the parts you will provide.'), { status: 400 });
            }
            const units = validateServiceUnits(configuredService, booking.units);
            const unitPrice = quoteRequired ? 0 : Number(partsSource === 'customer'
              ? configuredService.laborOnlyPrice
              : configuredService.price) || 0;
            const unitMechanicFee = quoteRequired ? 0 : Number(configuredService.mechanicFee) || 0;
            const servicePriceTotal = unitPrice * units;
            const mechanicFeeTotal = unitMechanicFee * units;
            const paymentSnapshot = calculateServicePayment(
              quoteRequired ? 0 : servicePriceTotal + mechanicFeeTotal,
              schedule.serviceDownPaymentPercent
            );
            const serviceDurationMinutes = durationInMinutes(configuredService, units);
            const startMinutes = timeToMinutes(booking.startTime);
            const endTime = minutesToTime(startMinutes + serviceDurationMinutes);
            if (startMinutes === null || startMinutes + serviceDurationMinutes > timeToMinutes(schedule.closeTime)) {
              throw Object.assign(new Error('Choose an available booking time.'), { status: 400 });
            }
            await serializeSlotBooking({ dateKey: booking.date, startTime: booking.startTime, endTime, session });
            const activeCount = await countActiveBookings(
              booking.startTime,
              endTime,
              dayRange.start,
              dayRange.end,
              session
            );
            if (activeCount >= schedule.slotCapacity) {
              throw Object.assign(new Error('That time was just booked. Please choose another.'), { status: 409 });
            }
            const createdAt = new Date();
            serviceRequest = (await ServiceRequest.create([{
              user: req.user.userId,
              customerId: req.user.userId,
              serviceId: booking.serviceId,
              partsSource,
              quoteStatus: quoteRequired ? 'quote_requested' : '',
              customerPartsNote: quoteRequired ? customerPartsNote : '',
              laborPriceMinSnapshot: quoteRequired ? configuredService.laborPriceMin ?? null : null,
              laborPriceMaxSnapshot: quoteRequired ? configuredService.laborPriceMax ?? null : null,
              serviceType: configuredService.name,
              description: typeof booking.notes === 'string' && booking.notes.trim()
                ? booking.notes.trim()
                : `Customer booking for ${configuredService.name}`,
              notes: typeof booking.notes === 'string' ? booking.notes.trim() : '',
              vehicle: booking.vehicle.trim(),
              mechanic: selectedMechanicId,
              mechanicId: selectedMechanicId,
              units,
              pricePerUnit: configuredService.pricePerUnit === true,
              unitLabel: configuredService.pricePerUnit ? configuredService.unitLabel : '',
              unitPrice,
              unitMechanicFee,
              servicePriceTotal,
              mechanicFeeTotal,
              estimatedPrice: paymentSnapshot.totalAmount,
              ...paymentSnapshot,
              amountPaid: 0,
              paymentStatus: quoteRequired ? 'Payment Pending' : paymentSnapshot.downPaymentAmount === 0 ? 'Confirmed' : 'Payment Pending',
              paymentMethod: !quoteRequired && paymentSnapshot.downPaymentAmount === 0 ? 'No upfront payment required' : '',
              laborFee: mechanicFeeTotal,
              durationMinutes: serviceDurationMinutes,
              createdAt,
              paymentDueAt: quoteRequired || paymentSnapshot.downPaymentAmount === 0
                ? null
                : new Date(createdAt.getTime() + schedule.pendingPaymentHours * 60 * 60 * 1000),
              scheduledDate: dayRange.start,
              startTime: booking.startTime,
              endTime,
              status: 'pending'
            }], { session }))[0];
          });
        } finally {
          await session.endSession();
        }
        results.push({ cartKey, ok: true, serviceRequest });
      } catch (error) {
        if (error.status !== 409 && error.status !== 400) {
          console.error('[createServiceBookings] booking failed', error);
        }
        results.push({
          cartKey,
          ok: false,
          status: error.status || 500,
          message: error.status ? error.message : 'This booking could not be submitted. Please try again.',
          serviceId: booking?.serviceId,
          date: booking?.date,
          startTime: booking?.startTime
        });
      }
    }

    return res.status(200).json({
      message: 'Service booking results are ready.',
      results
    });
  } catch (error) {
    console.error('[createServiceBookings] error', error);
    return res.status(500).json({ message: 'Service bookings could not be submitted. Please try again.' });
  }
};

module.exports = { getServiceSlots, createServiceBookings, ensureCustomerUnpaidBookingLimit };
