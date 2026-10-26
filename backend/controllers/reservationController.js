const mongoose = require('mongoose');
const Product = require('../models/product');
const User = require('../models/user');
const Reservation = require('../models/orderingModels/reservation');
const Counter = require('../models/orderingModels/counter');
const ReservationSettings = require('../models/reservationSettings');
const BusinessRecord = require('../models/businessRecord');
const Cart = require('../models/orderingModels/cart');
const Notification = require('../models/notification');
const {
  validateReceipt,
  validateReference,
  uploadReceipt,
  claimPaymentReference,
  getTemporaryReceiptUrl,
  removeReceipt,
  uploadPublicImage,
  removePublicImage
} = require('../utils/paymentReceipt');
const { createPaymentDecisionNotification } = require('../utils/paymentNotifications');
const { canTransitionReservationStatus } = require('../utils/reservationStatus');
const { expireServiceBookings } = require('./serviceRequestController');

const validStatuses = ['Pending Down Payment', 'Payment Submitted', 'Reserved', 'Completed', 'Cancelled', 'Expired'];
const EXPIRY_BATCH_SIZE = 500;
const MAX_EXPIRY_ROUNDS = 20;
const money = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sendError = (res, error, fallback = 'Reservation request failed.') => {
  console.error('[reservations] error', error);
  res.status(error.status || 500).json({ success: false, message: error.message || fallback });
};

const getSettings = async () => ReservationSettings.getDefaults();

const validateStatus = (status) => !status || validStatuses.includes(status);
const isValidReservationId = (id) => mongoose.Types.ObjectId.isValid(id);

const customerReservationPayload = (reservation) => {
  const payload = reservation.toObject ? reservation.toObject() : { ...reservation };
  delete payload.paymentProofUrl;
  delete payload.paymentProofPublicId;
  delete payload.paymentSubmissions;
  return payload;
};

async function releaseReservedStock(reservation, session) {
  for (const item of reservation.items) {
    const product = await Product.findById(item.productId).session(session);
    if (!product || Number(product.reservedQty || 0) < item.qty) {
      throw Object.assign(new Error(`Unable to release reserved stock for ${item.name}. Contact support.`), { status: 409 });
    }
    product.reservedQty = Number(product.reservedQty || 0) - item.qty;
    await product.save({ session });
  }
}

async function expireReservations() {
  try {
    await expireServiceBookings();
  } catch (error) {
    console.error('[expireReservations] service booking expiry pass failed; continuing', error);
  }
  const now = new Date();
  let settings;
  try {
    settings = await getSettings();
  } catch (error) {
    console.error('[expireReservations] unable to load reservation settings; skipping expiry pass', error);
    return;
  }

  for (let round = 0; round < MAX_EXPIRY_ROUNDS; round += 1) {
    let expiredCandidates;
    try {
      expiredCandidates = await Reservation.find({
        code: { $exists: true },
        $or: [
          {
            status: 'Pending Down Payment',
            $or: [
              { paymentDueAt: { $lte: now } },
              { paymentDueAt: null, createdAt: { $lte: new Date(now.getTime() - settings.pendingPaymentHours * 60 * 60 * 1000) } }
            ]
          },
          { status: 'Reserved', reservedUntil: { $lte: now } }
        ]
      }).select('_id').limit(EXPIRY_BATCH_SIZE);
    } catch (error) {
      console.error('[expireReservations] unable to load expired reservations; skipping expiry pass', error);
      return;
    }
    if (!expiredCandidates.length) return;
    for (const candidate of expiredCandidates) {
      let session;
      try {
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
          const reservation = await Reservation.findOne({ _id: candidate._id, code: { $exists: true } }).session(session);
          if (!reservation) return;
          if (reservation.status === 'Pending Down Payment' && (reservation.paymentDueAt ? reservation.paymentDueAt <= now : reservation.createdAt <= new Date(now.getTime() - settings.pendingPaymentHours * 60 * 60 * 1000))
            && canTransitionReservationStatus(reservation.status, 'Expired')) {
            reservation.status = 'Expired';
            reservation.expiredAt = now;
            reservation.cancelReason = 'The down payment deadline passed.';
            await reservation.save({ session });
          } else if (reservation.status === 'Reserved' && reservation.reservedUntil <= now
            && canTransitionReservationStatus(reservation.status, 'Expired')) {
            await releaseReservedStock(reservation, session);
            reservation.status = 'Expired';
            reservation.expiredAt = now;
            reservation.cancelReason = 'The pickup hold period ended.';
            await reservation.save({ session });
          }
        });
      } catch (error) {
        console.error(`[expireReservations] failed to expire reservation ${candidate._id}; continuing`, error);
      } finally {
        if (session) {
          try {
            await session.endSession();
          } catch (error) {
            console.error(`[expireReservations] failed to close session for reservation ${candidate._id}`, error);
          }
        }
      }
    }
    if (expiredCandidates.length < EXPIRY_BATCH_SIZE) return;
  }
  console.error(`[expireReservations] stopped after ${MAX_EXPIRY_ROUNDS} rounds; more expired reservations may remain`);
}

const createReservation = async (req, res) => {
  try {
    const requestedItems = req.body?.items;
    if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 50) {
      return res.status(400).json({ success: false, message: 'Add between 1 and 50 items to the reservation.' });
    }

    const itemIds = new Set();
    for (const item of requestedItems) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ success: false, message: 'Each reservation item must be an object with a product ID and quantity.' });
      }
      if (!mongoose.Types.ObjectId.isValid(item.productId)) {
        return res.status(400).json({ success: false, message: 'Each item must have a valid product ID.' });
      }
      if (itemIds.has(String(item.productId))) {
        return res.status(400).json({ success: false, message: 'Remove duplicate products before creating a reservation.' });
      }
      itemIds.add(String(item.productId));
      if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99999) {
        return res.status(400).json({ success: false, message: 'Item quantities must be whole numbers from 1 to 99,999.' });
      }
    }

    const [user, settings] = await Promise.all([
      User.findById(req.user.userId),
      getSettings()
    ]);
    if (!user) return res.status(404).json({ success: false, message: 'Customer account not found.' });

    const items = [];
    for (const requested of requestedItems) {
      const product = await Product.findOne({ _id: requested.productId, isActive: { $ne: false } });
      if (!product) return res.status(404).json({ success: false, message: 'A selected product is no longer available.' });
      const available = Math.max(0, product.quantity - Number(product.reservedQty || 0));
      if (available < requested.qty) {
        return res.status(409).json({ success: false, message: `Only ${available} of ${product.name} are currently available.` });
      }
      const unitPrice = money(product.price);
      items.push({
        productId: product._id,
        name: product.name,
        imageUrl: product.imageUrl || product.image || '',
        unitPrice,
        qty: requested.qty,
        lineTotal: money(unitPrice * requested.qty)
      });
    }

    const total = money(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const downPaymentPercent = settings.downPaymentPercent;
    const downPaymentAmount = money(total * downPaymentPercent / 100);
    const session = await mongoose.startSession();
    let reservation;
    try {
      await session.withTransaction(async () => {
        const counter = await Counter.findOneAndUpdate(
          { _id: 'reservation' },
          { $inc: { sequence: 1 } },
          { new: true, upsert: true, session }
        );
        const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || user.email;
        [reservation] = await Reservation.create([{
          code: `RSV-${String(counter.sequence).padStart(4, '0')}`,
          customerId: user._id,
          customerName: name,
          customerPhone: user.phoneNumber || '',
          items,
          status: 'Pending Down Payment',
          total,
          downPaymentPercent,
          downPaymentAmount,
          amountPaid: 0,
          balanceDue: total,
          paymentDueAt: new Date(Date.now() + settings.pendingPaymentHours * 60 * 60 * 1000)
        }], { session });
      });
    } finally {
      await session.endSession();
    }
    res.status(201).json({ success: true, reservation });
  } catch (error) {
    sendError(res, error);
  }
};

const createReservationFromCart = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ success: false, message: 'Customer account not found.' });
    const cart = await Cart.findOne({ customerPhone: user.phoneNumber });
    if (!cart || !cart.items.length) return res.status(400).json({ success: false, message: 'Cart is empty.' });

    const captured = {
      statusCode: 200,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        return payload;
      }
    };
    await createReservation({
      user: req.user,
      body: { items: cart.items.map((item) => ({ productId: item.productId, qty: item.quantity })) }
    }, captured);
    if (captured.statusCode >= 400) return res.status(captured.statusCode).json(captured.payload);
    try {
      await Cart.deleteOne({ _id: cart._id });
    } catch (error) {
      console.error('[createReservationFromCart] cart cleanup failed', error);
      return res.status(201).json({
        ...captured.payload,
        message: 'Reservation created, but your cart could not be cleared. Remove the reserved items from your cart.'
      });
    }
    res.status(captured.statusCode).json(captured.payload);
  } catch (error) {
    sendError(res, error);
  }
};

const submitPayment = async (req, res) => {
  let uploadedReceipt;
  let session;
  try {
    if (!isValidReservationId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid reservation ID.' });
    const reference = validateReference(req.body?.reference);
    validateReceipt(req.file);
    await expireReservations();
    const reservation = await Reservation.findOne({ _id: req.params.id, customerId: req.user.userId, code: { $exists: true } });
    if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found.' });
    if (!canTransitionReservationStatus(reservation.status, 'Payment Submitted')) {
      return res.status(409).json({ success: false, message: 'Payment can only be submitted for a pending down payment.' });
    }
    const settings = await getSettings();
    if (!settings.paymentInstructions.methodName || !settings.paymentInstructions.accountName || !settings.paymentInstructions.accountNumber) {
      return res.status(409).json({ success: false, message: 'The shop payment instructions are not configured yet. Please contact the shop before submitting payment.' });
    }
    uploadedReceipt = await uploadReceipt(req.file);
    session = await mongoose.startSession();
    let updatedReservation;
    await session.withTransaction(async () => {
      const current = await Reservation.findOne({
        _id: req.params.id,
        customerId: req.user.userId,
        status: 'Pending Down Payment',
        code: { $exists: true }
      }).session(session);
      if (!current || !canTransitionReservationStatus(current.status, 'Payment Submitted')) throw Object.assign(new Error('Payment can only be submitted for a pending down payment.'), { status: 409 });
      const submittedAt = new Date();
      await claimPaymentReference({ reference, recordType: 'item', recordId: current._id, session });
      current.paymentReference = reference;
      current.paymentMethod = settings.paymentInstructions.methodName;
      current.paymentProofUrl = '';
      current.paymentProofPublicId = uploadedReceipt.publicId;
      current.paymentProofFormat = uploadedReceipt.format || 'jpg';
      current.submittedAt = submittedAt;
      current.status = 'Payment Submitted';
      current.rejectionReason = '';
      current.paymentSubmissions.push({
        reference,
        paymentProofPublicId: uploadedReceipt.publicId,
        format: uploadedReceipt.format || 'jpg',
        submittedAt,
        status: 'Payment Submitted'
      });
      updatedReservation = await current.save({ session });
      await Notification.create([{
        audience: 'admin',
        type: 'payment_submitted',
        message: `New payment submitted: ${current.code} · ${current.customerName} · ₱${money(current.downPaymentAmount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        recordId: current._id,
        recordType: 'item'
      }], { session });
    });
    res.json({ success: true, reservation: customerReservationPayload(updatedReservation) });
  } catch (error) {
    if (uploadedReceipt?.publicId) {
      try {
        await removeReceipt(uploadedReceipt.publicId);
      } catch (cleanupError) {
        console.error('[submitPayment] receipt cleanup failed', cleanupError);
      }
    }
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This reference number was already used.' });
    }
    sendError(res, error);
  } finally {
    if (session) await session.endSession();
  }
};

const getCustomerReservations = async (req, res) => {
  try {
    await expireReservations();
    const reservations = await Reservation.find({ customerId: req.user.userId, code: { $exists: true } }).sort({ createdAt: -1 });
    res.json({ success: true, reservations: reservations.map(customerReservationPayload) });
  } catch (error) {
    sendError(res, error);
  }
};

const getCustomerReservation = async (req, res) => {
  try {
    if (!isValidReservationId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid reservation ID.' });
    await expireReservations();
    const reservation = await Reservation.findOne({ _id: req.params.id, customerId: req.user.userId, code: { $exists: true } });
    if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found.' });
    res.json({ success: true, reservation: customerReservationPayload(reservation) });
  } catch (error) {
    sendError(res, error);
  }
};

const cancelCustomerReservation = async (req, res) => {
  let session;
  try {
    if (!isValidReservationId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid reservation ID.' });
    const reason = req.body?.reason ?? 'Cancelled by customer';
    if (typeof reason !== 'string' || reason.length > 300) return res.status(400).json({ success: false, message: 'Cancellation reason must be 300 characters or fewer.' });
    await expireReservations();
    session = await mongoose.startSession();
    let reservation;
    await session.withTransaction(async () => {
      reservation = await Reservation.findOneAndUpdate(
        {
          _id: req.params.id,
          customerId: req.user.userId,
          code: { $exists: true },
          status: 'Pending Down Payment'
        },
        {
          $set: {
            status: 'Cancelled',
            cancelledAt: new Date(),
            cancelReason: reason.trim() || 'Cancelled by customer'
          }
        },
        { new: true, runValidators: true, session }
      );
      if (reservation) return;

      const current = await Reservation.findOne({
        _id: req.params.id,
        customerId: req.user.userId,
        code: { $exists: true }
      }).session(session);
      if (!current) throw Object.assign(new Error('Reservation not found.'), { status: 404 });
      if (current.status === 'Payment Submitted') {
        throw Object.assign(new Error('The shop is reviewing your payment. Contact the shop to cancel.'), { status: 409 });
      }
      throw Object.assign(new Error('Customers can only cancel reservations with a pending down payment.'), { status: 409 });
    });
    res.json({ success: true, reservation: customerReservationPayload(reservation) });
  } catch (error) {
    sendError(res, error);
  } finally {
    if (session) await session.endSession();
  }
};

const getAdminReservations = async (req, res) => {
  try {
    await expireReservations();
    const { status, search = '' } = req.query;
    if (!validateStatus(status)) return res.status(400).json({ success: false, message: 'Invalid reservation status.' });
    if (typeof search !== 'string') return res.status(400).json({ success: false, message: 'Search must be text.' });
    const query = { code: { $exists: true }, ...(status ? { status } : {}) };
    if (search.trim()) {
      const pattern = new RegExp(escapeRegex(search.trim()), 'i');
      const matchingUsers = await User.find({
        $or: [{ firstName: pattern }, { lastName: pattern }, { email: pattern }, { phoneNumber: pattern }]
      }).select('_id');
      query.$or = [
        { code: pattern },
        { paymentReference: pattern },
        { customerName: pattern },
        { customerPhone: pattern },
        { customerId: { $in: matchingUsers.map((user) => user._id) } }
      ];
    }
    const populateAdminReservation = (builder) => builder
      .populate('customerId', 'firstName lastName email phoneNumber name isDeleted')
      .populate('verifiedBy', 'username')
      .populate('refundDecisionBy', 'username');
    let reservations;
    if (!status) {
      const [submitted, otherReservations] = await Promise.all([
        populateAdminReservation(Reservation.find({ ...query, status: 'Payment Submitted' }).sort({ createdAt: -1 }).limit(200)),
        populateAdminReservation(Reservation.find({ ...query, status: { $ne: 'Payment Submitted' } }).sort({ createdAt: -1 }).limit(200))
      ]);
      reservations = [...submitted, ...otherReservations].slice(0, 200);
    } else {
      reservations = await populateAdminReservation(Reservation.find(query).sort({ createdAt: -1 }).limit(200));
    }
    const sortedReservations = reservations.sort((left, right) => {
      const leftPending = left.status === 'Payment Submitted' ? 0 : 1;
      const rightPending = right.status === 'Payment Submitted' ? 0 : 1;
      return leftPending - rightPending || right.createdAt - left.createdAt;
    });
    res.json({ success: true, reservations: sortedReservations.map((reservation) => {
      const value = reservation.toObject();
      value.paymentSubmissions = (value.paymentSubmissions || []).map((submission) => {
        const data = submission.toObject();
        delete data.paymentProofPublicId;
        return data;
      });
      delete value.paymentProofPublicId;
      delete value.paymentProofUrl;
      delete value.paymentProofFormat;
      return value;
    }) });
  } catch (error) {
    sendError(res, error);
  }
};

const getAdminReservationReceipts = async (req, res) => {
  try {
    if (!isValidReservationId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid reservation ID.' });
    }
    const reservation = await Reservation.findOne({
      _id: req.params.id,
      code: { $exists: true }
    }).select('paymentProofPublicId paymentProofFormat submittedAt paymentSubmissions').lean();
    if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found.' });

    let submissions = (reservation.paymentSubmissions || []).map((submission) => ({
      ...submission,
      receiptUrl: getTemporaryReceiptUrl(submission.paymentProofPublicId, submission.format || 'jpg')
    }));
    if (!submissions.length && reservation.paymentProofPublicId) {
      submissions = [{
        submittedAt: reservation.submittedAt,
        status: 'Payment Submitted',
        receiptUrl: getTemporaryReceiptUrl(reservation.paymentProofPublicId, reservation.paymentProofFormat || 'jpg')
      }];
    }
    res.json({ success: true, paymentSubmissions: submissions });
  } catch (error) {
    sendError(res, error);
  }
};

const confirmReservation = async (req, res) => {
  if (!isValidReservationId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid reservation ID.' });
  const session = await mongoose.startSession();
  try {
    await expireReservations();
    let result;
    await session.withTransaction(async () => {
      const reservation = await Reservation.findOne({ _id: req.params.id, code: { $exists: true } }).session(session);
      if (!reservation) throw Object.assign(new Error('Reservation not found.'), { status: 404 });
      if (!canTransitionReservationStatus(reservation.status, 'Reserved')) {
        throw Object.assign(new Error('Only submitted payments can be confirmed.'), { status: 409 });
      }
      for (const item of reservation.items) {
        const product = await Product.findOne({ _id: item.productId, isActive: { $ne: false } }).session(session);
        if (!product || product.quantity - Number(product.reservedQty || 0) < item.qty) {
          throw Object.assign(new Error(`Not enough available stock for ${item.name}. Cancel this reservation and refund the payment.`), { status: 409 });
        }
        product.reservedQty = Number(product.reservedQty || 0) + item.qty;
        await product.save({ session });
      }
      const settings = await getSettings();
      reservation.status = 'Reserved';
      reservation.amountPaid = reservation.downPaymentAmount;
      reservation.balanceDue = money(reservation.total - reservation.amountPaid);
      reservation.verifiedAt = new Date();
      reservation.verifiedBy = req.admin.id;
      reservation.reservedUntil = new Date(Date.now() + settings.holdDays * 24 * 60 * 60 * 1000);
      const latestSubmission = reservation.paymentSubmissions[reservation.paymentSubmissions.length - 1];
      if (latestSubmission) {
        latestSubmission.status = 'Confirmed';
        latestSubmission.reviewedAt = reservation.verifiedAt;
        latestSubmission.reviewedBy = req.admin.id;
      }
      result = await reservation.save({ session });
      await createPaymentDecisionNotification({
        customerId: reservation.customerId,
        recordId: reservation._id,
        recordType: 'item',
        code: reservation.code,
        confirmed: true,
        session
      });
    });
    res.json({ success: true, reservation: result });
  } catch (error) {
    sendError(res, error);
  } finally {
    await session.endSession();
  }
};

const rejectReservation = async (req, res) => {
  let session;
  try {
    if (!isValidReservationId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid reservation ID.' });
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 300) {
      return res.status(400).json({ success: false, message: 'Provide a rejection reason between 3 and 300 characters.' });
    }
    const settings = await getSettings();
    session = await mongoose.startSession();
    let reservation;
    await session.withTransaction(async () => {
      reservation = await Reservation.findOne({ _id: req.params.id, code: { $exists: true } }).session(session);
      if (!reservation) throw Object.assign(new Error('Reservation not found.'), { status: 404 });
      if (!canTransitionReservationStatus(reservation.status, 'Pending Down Payment')) {
        throw Object.assign(new Error('Only submitted payments can be rejected.'), { status: 409 });
      }
      reservation.status = 'Pending Down Payment';
      reservation.rejectionReason = reason;
      reservation.paymentRejectedBy = req.admin.id;
      reservation.paymentRejectedAt = new Date();
      reservation.paymentDueAt = new Date(Date.now() + settings.pendingPaymentHours * 60 * 60 * 1000);
      const latestSubmission = reservation.paymentSubmissions[reservation.paymentSubmissions.length - 1];
      if (latestSubmission) {
        latestSubmission.status = 'Rejected';
        latestSubmission.rejectionReason = reason;
        latestSubmission.reviewedAt = reservation.paymentRejectedAt;
        latestSubmission.reviewedBy = req.admin.id;
      }
      reservation = await reservation.save({ session });
      await createPaymentDecisionNotification({
        customerId: reservation.customerId,
        recordId: reservation._id,
        recordType: 'item',
        code: reservation.code,
        confirmed: false,
        reason,
        session
      });
    });
    res.json({ success: true, reservation: customerReservationPayload(reservation) });
  } catch (error) {
    sendError(res, error);
  } finally {
    if (session) await session.endSession();
  }
};

const completeReservation = async (req, res) => {
  if (!isValidReservationId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid reservation ID.' });
  const session = await mongoose.startSession();
  try {
    await expireReservations();
    let result;
    await session.withTransaction(async () => {
      const reservation = await Reservation.findOne({ _id: req.params.id, code: { $exists: true } }).session(session);
      if (!reservation) throw Object.assign(new Error('Reservation not found.'), { status: 404 });
      if (!canTransitionReservationStatus(reservation.status, 'Completed')) throw Object.assign(new Error('Only reserved items can be completed.'), { status: 409 });
      for (const item of reservation.items) {
        const product = await Product.findById(item.productId).session(session);
        if (!product || Number(product.reservedQty || 0) < item.qty || product.quantity < item.qty) {
          throw Object.assign(new Error(`Stock for ${item.name} is inconsistent. Resolve inventory before completing pickup.`), { status: 409 });
        }
        product.quantity -= item.qty;
        product.reservedQty = Number(product.reservedQty || 0) - item.qty;
        await product.save({ session });
      }
      reservation.status = 'Completed';
      reservation.amountPaid = reservation.total;
      reservation.balanceDue = 0;
      reservation.completedAt = new Date();
      result = await reservation.save({ session });
      await BusinessRecord.findOneAndUpdate(
        { recordType: 'product', sourceId: reservation._id },
        {
          recordType: 'product',
          sourceId: reservation._id,
          customer: reservation.customerName,
          customerPhone: reservation.customerPhone,
          itemName: reservation.items.map((item) => item.name).join(', '),
          category: 'Product Sales',
          amount: reservation.total,
          status: 'completed',
          completedAt: reservation.completedAt,
          notes: `${reservation.items.length} reserved product item${reservation.items.length === 1 ? '' : 's'} collected`
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, session }
      );
    });
    res.json({ success: true, reservation: result });
  } catch (error) {
    sendError(res, error);
  } finally {
    await session.endSession();
  }
};

async function cancelReservation(req, res, isRefundDecisionOnly = false) {
  if (!isValidReservationId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid reservation ID.' });
  let session;
  try {
    let result;
    const { refundDecision, reason } = req.body || {};
    if (refundDecision !== undefined && !['refunded', 'forfeited'].includes(refundDecision)) {
      return res.status(400).json({ success: false, message: 'Refund decision must be refunded or forfeited.' });
    }
    if (isRefundDecisionOnly && refundDecision === undefined) {
      return res.status(400).json({ success: false, message: 'Choose refunded or forfeited.' });
    }
    if (!isRefundDecisionOnly && (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 300)) {
      return res.status(400).json({ success: false, message: 'Reason must be between 3 and 300 characters.' });
    }
    await expireReservations();
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const reservation = await Reservation.findOne({ _id: req.params.id, code: { $exists: true } }).session(session);
      if (!reservation) throw Object.assign(new Error('Reservation not found.'), { status: 404 });
      if (isRefundDecisionOnly) {
        if (reservation.status !== 'Expired' || reservation.amountPaid <= 0 || reservation.refundDecision) {
          throw Object.assign(new Error('A refund decision is only required for expired reservations with a confirmed down payment.'), { status: 409 });
        }
      } else {
        if (!canTransitionReservationStatus(reservation.status, 'Cancelled')) {
          throw Object.assign(new Error('This reservation can no longer be cancelled.'), { status: 409 });
        }
        if ((reservation.status === 'Reserved' || reservation.status === 'Expired' && reservation.amountPaid > 0) && !refundDecision && !reservation.refundDecision) {
          throw Object.assign(new Error('Choose whether the confirmed down payment is refunded or forfeited.'), { status: 400 });
        }
        if (reservation.amountPaid <= 0 && refundDecision) {
          throw Object.assign(new Error('Refund decisions only apply after a down payment has been confirmed.'), { status: 400 });
        }
      }
      if (reservation.status === 'Reserved') await releaseReservedStock(reservation, session);
      if (!isRefundDecisionOnly) {
        reservation.status = 'Cancelled';
        reservation.cancelledAt = new Date();
        reservation.cancelReason = reason.trim();
      }
      if (refundDecision) {
        reservation.refundDecision = refundDecision;
        reservation.refundDecisionBy = req.admin.id;
        reservation.refundDecisionAt = new Date();
      }
      result = await reservation.save({ session });
    });
    res.json({ success: true, reservation: result });
  } catch (error) {
    sendError(res, error);
  } finally {
    if (session) await session.endSession();
  }
}

const cancelAdminReservation = (req, res) => cancelReservation(req, res);
const decideExpiredRefund = (req, res) => cancelReservation(req, res, true);

const getPublicSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      success: true,
      settings: {
        downPaymentPercent: settings.downPaymentPercent,
        pendingPaymentHours: settings.pendingPaymentHours,
        holdDays: settings.holdDays,
        paymentInstructions: {
          methodName: settings.paymentInstructions.methodName,
          accountName: settings.paymentInstructions.accountName,
          accountNumber: settings.paymentInstructions.accountNumber,
          qrImageUrl: settings.paymentInstructions.qrImageUrl
        },
        pickupAddress: settings.pickupAddress,
        pickupHours: settings.pickupHours
      }
    });
  } catch (error) {
    sendError(res, error);
  }
};

const uploadGcashQr = async (req, res) => {
  let uploaded;
  try {
    validateReceipt(req.file);
    uploaded = await uploadPublicImage(req.file, 'revinsight/gcash-qr');
    const settings = await getSettings();
    const previousPublicId = settings.paymentInstructions.qrImagePublicId;
    settings.paymentInstructions.qrImagePublicId = uploaded.publicId;
    settings.paymentInstructions.qrImageUrl = uploaded.url;
    await settings.save();
    if (previousPublicId) {
      try {
        await removePublicImage(previousPublicId);
      } catch (error) {
        console.error('[uploadGcashQr] previous QR cleanup failed', error);
      }
    }
    res.json({ success: true, qrImageUrl: uploaded.url });
  } catch (error) {
    if (uploaded?.publicId) {
      try {
        await removePublicImage(uploaded.publicId);
      } catch (cleanupError) {
        console.error('[uploadGcashQr] uploaded QR cleanup failed', cleanupError);
      }
    }
    sendError(res, error);
  }
};

const getShopSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      success: true,
      settings: {
        downPaymentPercent: settings.downPaymentPercent,
        pickupAddress: settings.pickupAddress,
        pickupHours: settings.pickupHours,
        contactNumber: settings.contactNumber
      }
    });
  } catch (error) {
    sendError(res, error);
  }
};

const getBookingSchedule = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      success: true,
      schedule: {
        openDays: settings.openDays,
        openTime: settings.openTime,
        closeTime: settings.closeTime,
        slotCapacity: settings.slotCapacity,
        maxDaysAhead: settings.maxDaysAhead
      }
    });
  } catch (error) {
    sendError(res, error);
  }
};

const updateBookingSchedule = async (req, res) => {
  try {
    const { openDays, openTime, closeTime, slotCapacity, maxDaysAhead } = req.body || {};
    const validDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const isValidTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const errors = [];

    if (!Array.isArray(openDays) || openDays.length === 0 || openDays.some((day) => !validDays.includes(day)) || new Set(openDays).size !== openDays.length) {
      errors.push('Select at least one valid, unique open day.');
    }
    if (!isValidTime(openTime)) errors.push('Opening time must use 24-hour HH:mm format.');
    if (!isValidTime(closeTime)) errors.push('Closing time must use 24-hour HH:mm format.');
    if (isValidTime(openTime) && isValidTime(closeTime) && minutes(closeTime) <= minutes(openTime)) {
      errors.push('Closing time must be after opening time.');
    }
    if (!Number.isInteger(slotCapacity) || slotCapacity < 1 || slotCapacity > 100) {
      errors.push('Slot capacity must be a whole number from 1 to 100.');
    }
    if (!Number.isInteger(maxDaysAhead) || maxDaysAhead < 1 || maxDaysAhead > 365) {
      errors.push('Maximum days ahead must be a whole number from 1 to 365.');
    }
    if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });

    const settings = await ReservationSettings.findOneAndUpdate(
      { key: 'reservation' },
      { $set: { openDays, openTime, closeTime, slotCapacity, maxDaysAhead } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({
      success: true,
      schedule: {
        openDays: settings.openDays,
        openTime: settings.openTime,
        closeTime: settings.closeTime,
        slotCapacity: settings.slotCapacity,
        maxDaysAhead: settings.maxDaysAhead
      }
    });
  } catch (error) {
    sendError(res, error);
  }
};

const updateSettings = async (req, res) => {
  try {
    const { downPaymentPercent, pendingPaymentHours, holdDays, paymentInstructions, pickupAddress, pickupHours, contactNumber } = req.body || {};
    const errors = [];
    if (!Number.isInteger(downPaymentPercent) || downPaymentPercent < 10 || downPaymentPercent > 100) errors.push('Down payment percent must be a whole number from 10 to 100.');
    if (!Number.isInteger(pendingPaymentHours) || pendingPaymentHours < 1 || pendingPaymentHours > 720) errors.push('Pending payment hours must be a whole number from 1 to 720.');
    if (!Number.isInteger(holdDays) || holdDays < 1 || holdDays > 30) errors.push('Hold days must be a whole number from 1 to 30.');
    if (!paymentInstructions || typeof paymentInstructions !== 'object') errors.push('Payment instructions are required.');
    else {
      for (const field of ['methodName', 'accountName', 'accountNumber']) {
        if (typeof paymentInstructions[field] !== 'string' || paymentInstructions[field].length > 120) errors.push(`Payment ${field} must be 120 characters or fewer.`);
      }
    }
    if (typeof pickupAddress !== 'string' || pickupAddress.length > 500) errors.push('Pickup address must be 500 characters or fewer.');
    if (typeof pickupHours !== 'string' || pickupHours.length > 200) errors.push('Pickup hours must be 200 characters or fewer.');
    if (typeof contactNumber !== 'string' || contactNumber.length > 40) errors.push('Contact number must be 40 characters or fewer.');
    if (errors.length) return res.status(400).json({ success: false, message: errors.join(' ') });

    const currentSettings = await getSettings();
    const savedPaymentInstructions = {
      ...paymentInstructions,
      qrImageUrl: currentSettings.paymentInstructions.qrImageUrl || '',
      qrImagePublicId: currentSettings.paymentInstructions.qrImagePublicId || ''
    };
    const settings = await ReservationSettings.findOneAndUpdate(
      { key: 'reservation' },
      { $set: { downPaymentPercent, pendingPaymentHours, holdDays, paymentInstructions: savedPaymentInstructions, pickupAddress, pickupHours, contactNumber } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, settings });
  } catch (error) {
    sendError(res, error);
  }
};

module.exports = {
  createReservation,
  createReservationFromCart,
  submitPayment,
  getCustomerReservations,
  getCustomerReservation,
  cancelCustomerReservation,
  getAdminReservations,
  getAdminReservationReceipts,
  confirmReservation,
  rejectReservation,
  completeReservation,
  cancelAdminReservation,
  decideExpiredRefund,
  canTransitionReservationStatus,
  getPublicSettings,
  getShopSettings,
  getBookingSchedule,
  updateBookingSchedule,
  updateSettings,
  uploadGcashQr,
  expireReservations
};
