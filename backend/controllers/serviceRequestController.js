const ServiceRequest = require("../models/serviceRequest");
const Mechanic = require("../models/mechanic");
const BusinessRecord = require("../models/businessRecord");
const User = require("../models/user");
const Notification = require("../models/notification");
const mongoose = require("mongoose");
const ReservationSettings = require("../models/reservationSettings");
const {
  validateReceipt,
  validateReference,
  uploadReceipt,
  claimPaymentReference,
  getTemporaryReceiptUrl,
  removeReceipt
} = require("../utils/paymentReceipt");
const { createPaymentDecisionNotification } = require("../utils/paymentNotifications");
const EXPIRY_BATCH_SIZE = 200;
const MAX_EXPIRY_ROUNDS = 20;
const PAID_SERVICE_STATUSES = ["Confirmed", "Paid at shop"];
const UNPAID_BOOKING_EXPIRY_STATUSES = ["pending", "assigned", "confirmed", "accepted"];

// Mechanic accepts a pending job, sets start time, and confirms
const mechanicAcceptJob = async (req, res) => {
  try {
    const { requestId, startTime } = req.body || {};
    const mechanicId = req.user?.userId;
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: "Request ID is required" });
    }
    const request = await ServiceRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Service request not found" });
    if (!PAID_SERVICE_STATUSES.includes(request.paymentStatus)) {
      return res.status(409).json({ message: "Payment is not confirmed yet." });
    }
    const settings = await ReservationSettings.getDefaults();
    if (startTime) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
        return res.status(400).json({ message: "Start time must use 24-hour HH:mm format." });
      }
      if (startTime < settings.openTime || startTime > settings.closeTime) {
        return res.status(400).json({
          message: `Start time must be between ${settings.openTime} and ${settings.closeTime}.`
        });
      }
    }
    const nextStatus = request.status === "pending" && !request.mechanic ? "assigned" : "accepted";
    const serviceRequest = await transitionServiceRequestStatus({
      requestId,
      mechanicId,
      status: nextStatus,
      startTime,
      requirePayment: true
    });
    res.status(200).json({
      message: "Job accepted and start time set",
      serviceRequest,
    });
  } catch (error) {
    console.error("[mechanicAcceptJob] error", error);
    if (error.status) return res.status(error.status).json({ message: error.message });
    res.status(500).json({ message: "Failed to accept job. Please try again." });
  }
};

const syncCompletedServiceBusinessRecord = async (serviceRequest, session = null) => {
  if (!serviceRequest || serviceRequest.status !== "completed"
    || !PAID_SERVICE_STATUSES.includes(serviceRequest.paymentStatus)) return null;

  const userQuery = User.findById(serviceRequest.user);
  const mechanicQuery = Mechanic.findById(
    serviceRequest.mechanicId || serviceRequest.mechanic,
  );
  const existingRecordQuery = BusinessRecord.findOne({
    recordType: "service",
    sourceId: serviceRequest._id,
  }).select("completedAt");
  if (session) {
    userQuery.session(session);
    mechanicQuery.session(session);
    existingRecordQuery.session(session);
  }
  const [user, mechanic, existingRecord] = await Promise.all([
    userQuery.lean(),
    mechanicQuery.lean(),
    existingRecordQuery.lean()
  ]);

  const customerName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.email ||
      "Customer"
    : "Customer";
  const businessRecordData = {
    recordType: "service",
    sourceId: serviceRequest._id,
    customer: customerName,
    customerPhone: user?.phoneNumber || "",
    itemName: serviceRequest.serviceType,
    category: "Service Booking",
    mechanicId: serviceRequest.mechanicId || serviceRequest.mechanic || null,
    mechanicName: mechanic
      ? `${mechanic.firstName || ""} ${mechanic.lastName || ""}`.trim()
      : "",
    amount: Number(serviceRequest.estimatedPrice) || 0,
    laborFee: Number(serviceRequest.laborFee) || 0,
    status: serviceRequest.status,
    completedAt:
      serviceRequest.completedAt ||
      existingRecord?.completedAt ||
      new Date(serviceRequest.updatedAt || Date.now()),
    notes: serviceRequest.description || "Completed service request",
  };

  return BusinessRecord.findOneAndUpdate(
    { recordType: "service", sourceId: serviceRequest._id },
    businessRecordData,
    { upsert: true, new: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) },
  );
};

const serviceStatusTransitions = {
  pending: ["assigned"],
  confirmed: ["accepted", "declined"],
  assigned: ["in-progress", "declined"],
  accepted: ["in-progress"],
  "in-progress": ["completed"]
};

const serviceAdminStatusTransitions = {
  ...serviceStatusTransitions,
  pending: ["assigned", "cancelled"],
  assigned: ["in-progress", "declined", "cancelled"],
  confirmed: ["accepted", "declined", "cancelled"],
  accepted: ["in-progress", "cancelled"],
  "in-progress": ["cancelled"]
};

const transitionServiceRequestStatus = async ({
  requestId,
  mechanicId,
  status,
  startTime,
  requirePayment = false
}) => {
  if (!mongoose.Types.ObjectId.isValid(requestId) || !mongoose.Types.ObjectId.isValid(mechanicId)) {
    throw Object.assign(new Error("Service request and mechanic IDs are required."), { status: 400 });
  }
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const request = await ServiceRequest.findById(requestId).session(session);
      if (!request) throw Object.assign(new Error("Service request not found"), { status: 404 });
      const isUnassignedClaim = request.status === "pending" && status === "assigned"
        && !request.mechanic && !request.mechanicId;
      if (!isUnassignedClaim && String(request.mechanic || request.mechanicId) !== String(mechanicId)) {
        throw Object.assign(new Error("You can only update your assigned jobs"), { status: 403 });
      }
      if ((requirePayment || (status !== "declined" && ["assigned", "accepted", "in-progress", "completed"].includes(status)))
        && !PAID_SERVICE_STATUSES.includes(request.paymentStatus)) {
        throw Object.assign(new Error("Payment is not confirmed yet."), { status: 409 });
      }
      if (!serviceStatusTransitions[request.status]?.includes(status)) {
        throw Object.assign(new Error(`Cannot change status from ${request.status} to ${status}`), { status: 400 });
      }
      if (status === "declined" && PAID_SERVICE_STATUSES.includes(request.paymentStatus)) {
        throw Object.assign(new Error("An admin must record the refund decision before this paid booking can be declined."), { status: 409 });
      }
      if (startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
        throw Object.assign(new Error("Start time must use 24-hour HH:mm format."), { status: 400 });
      }

      const now = new Date();
      const assignment = request.status === "pending" && status === "assigned";
      result = await ServiceRequest.findOneAndUpdate(
        {
          _id: request._id,
          status: request.status,
          ...(assignment
            ? { $or: [{ mechanic: null }, { mechanic: { $exists: false } }] }
            : { $or: [{ mechanic: mechanicId }, { mechanicId }] })
        },
        {
          $set: {
            status,
            updatedAt: now,
            ...(assignment ? { mechanic: mechanicId, mechanicId } : {}),
            ...(startTime && !request.startTime ? { startTime } : {}),
            ...(status === "completed" ? { completedAt: now, mechanicId } : {})
          },
          $push: {
            statusHistory: {
              status,
              timestamp: now,
              note: `Status updated to ${status}`
            }
          }
        },
        { new: true, runValidators: true, session }
      );
      if (!result) {
        throw Object.assign(new Error("This job changed before the update could be saved."), { status: 409 });
      }
      if (status === "completed") {
        await syncCompletedServiceBusinessRecord(result, session);
      } else if (["cancelled", "declined"].includes(status)) {
        await BusinessRecord.deleteOne({ recordType: "service", sourceId: result._id }, { session });
      }
      if (["assigned", "accepted", "in-progress", "completed"].includes(status)) {
        const notificationCopy = {
          assigned: ["service_job_accepted", "A mechanic accepted your service booking."],
          accepted: ["service_job_accepted", "Your mechanic accepted your service booking."],
          "in-progress": ["service_job_started", "Work on your service booking has started."],
          completed: ["service_job_completed", "Your service booking is complete."]
        }[status];
        await Notification.create([{
          audience: "customer",
          customerId: result.customerId || result.user,
          type: notificationCopy[0],
          message: notificationCopy[1],
          link: `/customer/reservations/${result._id}`,
          recordId: result._id,
          recordType: "service"
        }], { session });
      }
    });
  } finally {
    await session.endSession();
  }
  return result;
};

const expireServiceBookings = async () => {
  const now = new Date();
  let settings;
  try {
    settings = await ReservationSettings.getDefaults();
  } catch (error) {
    console.error("[expireServiceBookings] unable to load reservation settings; skipping expiry pass", error);
    return;
  }

  for (let round = 0; round < MAX_EXPIRY_ROUNDS; round += 1) {
    let candidates;
    try {
      candidates = await ServiceRequest.find({
        status: { $in: UNPAID_BOOKING_EXPIRY_STATUSES },
        paymentStatus: "Payment Pending",
        $or: [
          { paymentDueAt: { $lte: now } },
          {
            paymentDueAt: null,
            createdAt: { $lte: new Date(now.getTime() - settings.pendingPaymentHours * 60 * 60 * 1000) }
          }
        ]
      }).select("_id").limit(EXPIRY_BATCH_SIZE);
    } catch (error) {
      console.error("[expireServiceBookings] unable to load expired bookings; skipping expiry pass", error);
      return;
    }
    if (!candidates.length) return;

    for (const candidate of candidates) {
      let session;
      try {
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
          const booking = await ServiceRequest.findOne({
            _id: candidate._id,
            status: { $in: UNPAID_BOOKING_EXPIRY_STATUSES },
            paymentStatus: "Payment Pending"
          }).session(session);
          if (!booking) return;
          const dueAt = booking.paymentDueAt
            || new Date(new Date(booking.createdAt || now).getTime() + settings.pendingPaymentHours * 60 * 60 * 1000);
          if (dueAt > now) return;
          booking.status = "cancelled";
          booking.cancelReason = "The payment deadline passed.";
          booking.updatedAt = now;
          await booking.save({ session });
          await BusinessRecord.deleteOne({ recordType: "service", sourceId: booking._id }, { session });
        });
      } catch (error) {
        console.error(`[expireServiceBookings] failed to expire booking ${candidate._id}; continuing`, error);
      } finally {
        if (session) {
          try {
            await session.endSession();
          } catch (error) {
            console.error(`[expireServiceBookings] failed to close session for booking ${candidate._id}`, error);
          }
        }
      }
    }
    if (candidates.length < EXPIRY_BATCH_SIZE) return;
  }
  console.error("[expireServiceBookings] stopped after the maximum expiry rounds; more expired bookings may remain");
};

const customerServiceRequestPayload = (request) => {
  const value = request.toObject ? request.toObject() : { ...request };
  delete value.paymentProofPublicId;
  delete value.paymentProofUrl;
  delete value.paymentSubmissions;
  return value;
};

const submitServicePayment = async (req, res) => {
  let uploadedReceipt;
  let session;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Service booking not found." });
    }
    const reference = validateReference(req.body?.reference);
    validateReceipt(req.file);
    const [settings, customer] = await Promise.all([
      ReservationSettings.getDefaults(),
      User.findById(req.user.userId)
    ]);
    if (!customer) return res.status(404).json({ message: "Customer account not found." });
    if (!settings.paymentInstructions.methodName || !settings.paymentInstructions.accountName || !settings.paymentInstructions.accountNumber) {
      return res.status(409).json({ message: "The shop payment instructions are not configured yet. Please contact the shop before submitting payment." });
    }
    const request = await ServiceRequest.findOne({
      _id: req.params.id,
      $or: [{ user: req.user.userId }, { customerId: req.user.userId }]
    });
    if (!request) return res.status(404).json({ message: "Service booking not found." });
    if (["cancelled", "declined", "completed"].includes(request.status)) {
      return res.status(409).json({ message: "Payment cannot be submitted for a closed booking." });
    }
    const submissionTime = new Date();
    const paymentDeadline = request.paymentDueAt
      || new Date(new Date(request.createdAt || submissionTime).getTime() + settings.pendingPaymentHours * 60 * 60 * 1000);
    if (paymentDeadline <= submissionTime) {
      return res.status(409).json({ message: "The payment deadline passed. Create a new booking to continue." });
    }
    if ((request.paymentStatus || "Payment Pending") !== "Payment Pending") {
      return res.status(409).json({ message: "Payment can only be submitted for a booking awaiting payment." });
    }

    uploadedReceipt = await uploadReceipt(req.file);
    const submissionAttemptTime = new Date();
    session = await mongoose.startSession();
    let updatedRequest;
    await session.withTransaction(async () => {
      const current = await ServiceRequest.findOne({
        _id: req.params.id,
        $or: [{ user: req.user.userId }, { customerId: req.user.userId }],
        paymentStatus: { $in: ["Payment Pending", null] },
        status: { $nin: ["cancelled", "declined", "completed"] },
        $and: [{
          $or: [
            { paymentDueAt: { $gt: submissionAttemptTime } },
            {
              paymentDueAt: null,
              createdAt: { $gt: new Date(submissionAttemptTime.getTime() - settings.pendingPaymentHours * 60 * 60 * 1000) }
            }
          ]
        }]
      }).session(session);
      if (!current) throw Object.assign(new Error("Payment can only be submitted for a booking awaiting payment."), { status: 409 });
      const submittedAt = new Date();
      await claimPaymentReference({ reference, recordType: "service", recordId: current._id, session });
      current.code = current.code || `SRV-${String(current._id).slice(-6).toUpperCase()}`;
      current.paymentStatus = "Payment Submitted";
      current.paymentMethod = settings.paymentInstructions.methodName;
      current.paymentReference = reference;
      current.paymentProofPublicId = uploadedReceipt.publicId;
      current.paymentProofFormat = uploadedReceipt.format || 'jpg';
      current.paymentSubmittedAt = submittedAt;
      current.paymentRejectionReason = "";
      current.paymentSubmissions.push({
        reference,
        paymentProofPublicId: uploadedReceipt.publicId,
        format: uploadedReceipt.format || 'jpg',
        submittedAt,
        status: "Payment Submitted"
      });
      updatedRequest = await current.save({ session });
      const customerName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.email || "Customer";
      await Notification.create([{
        audience: "admin",
        type: "payment_submitted",
        message: `New payment submitted: ${current.code} · ${customerName} · ₱${Number(current.estimatedPrice || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        recordId: current._id,
        recordType: "service"
      }], { session });
    });
    res.json({ success: true, serviceRequest: customerServiceRequestPayload(updatedRequest) });
  } catch (error) {
    if (uploadedReceipt?.publicId) {
      try {
        await removeReceipt(uploadedReceipt.publicId);
      } catch (cleanupError) {
        console.error("[submitServicePayment] receipt cleanup failed", cleanupError);
      }
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: "This reference number was already used." });
    }
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("[submitServicePayment] error", error);
    res.status(500).json({ message: "Payment could not be submitted. Please try again." });
  } finally {
    if (session) await session.endSession();
  }
};

const reviewServicePayment = async (req, res) => {
  let session;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Service booking not found." });
    }
    const confirmed = req.method === "POST" && req.path.endsWith("/confirm-payment");
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!confirmed && (reason.length < 3 || reason.length > 300)) {
      return res.status(400).json({ message: "Provide a rejection reason between 3 and 300 characters." });
    }
    const settings = await ReservationSettings.getDefaults();
    session = await mongoose.startSession();
    let serviceRequest;
    await session.withTransaction(async () => {
      serviceRequest = await ServiceRequest.findById(req.params.id).session(session);
      if (!serviceRequest) throw Object.assign(new Error("Service booking not found."), { status: 404 });
      if (serviceRequest.paymentStatus !== "Payment Submitted") {
        throw Object.assign(new Error("Only submitted payments can be reviewed."), { status: 409 });
      }
      const reviewedAt = new Date();
      const latestSubmission = serviceRequest.paymentSubmissions[serviceRequest.paymentSubmissions.length - 1];
      if (confirmed) {
        serviceRequest.paymentStatus = "Confirmed";
        serviceRequest.paymentConfirmedAt = reviewedAt;
        serviceRequest.paymentConfirmedBy = req.admin.id;
        if (latestSubmission) latestSubmission.status = "Confirmed";
      } else {
        serviceRequest.paymentStatus = "Payment Pending";
        serviceRequest.paymentDueAt = new Date(
          reviewedAt.getTime() + settings.pendingPaymentHours * 60 * 60 * 1000
        );
        serviceRequest.paymentRejectedAt = reviewedAt;
        serviceRequest.paymentRejectedBy = req.admin.id;
        serviceRequest.paymentRejectionReason = reason;
        if (latestSubmission) {
          latestSubmission.status = "Rejected";
          latestSubmission.rejectionReason = reason;
        }
      }
      if (latestSubmission) {
        latestSubmission.reviewedAt = reviewedAt;
        latestSubmission.reviewedBy = req.admin.id;
      }
      serviceRequest = await serviceRequest.save({ session });
      await createPaymentDecisionNotification({
        customerId: serviceRequest.customerId || serviceRequest.user,
        recordId: serviceRequest._id,
        recordType: "service",
        code: serviceRequest.code || `SRV-${String(serviceRequest._id).slice(-6).toUpperCase()}`,
        confirmed,
        reason,
        session
      });
    });
    res.json({ success: true, serviceRequest });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("[reviewServicePayment] error", error);
    res.status(500).json({ message: "Service payment could not be updated." });
  } finally {
    if (session) await session.endSession();
  }
};

const markServicePaidAtShop = async (req, res) => {
  let session;
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid service booking ID." });
    }
    session = await mongoose.startSession();
    let serviceRequest;
    await session.withTransaction(async () => {
      serviceRequest = await ServiceRequest.findOneAndUpdate(
        {
          _id: req.params.id,
          paymentStatus: "Payment Pending",
          status: { $nin: ["completed", "declined", "cancelled"] }
        },
        {
          $set: {
            paymentStatus: "Paid at shop",
            paymentMethod: "Paid at shop",
            paymentConfirmedAt: new Date(),
            paymentConfirmedBy: req.admin.id
          }
        },
        { new: true, runValidators: true, session }
      );
      if (!serviceRequest) {
        throw Object.assign(new Error("Only an active booking awaiting payment can be marked paid at the shop."), { status: 409 });
      }
      await createPaymentDecisionNotification({
        customerId: serviceRequest.customerId || serviceRequest.user,
        recordId: serviceRequest._id,
        recordType: "service",
        code: serviceRequest.code || `SRV-${String(serviceRequest._id).slice(-6).toUpperCase()}`,
        confirmed: true,
        reason: "",
        session
      });
    });
    res.json({ success: true, serviceRequest });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("[markServicePaidAtShop] error", error);
    res.status(500).json({ message: "Service payment could not be updated." });
  } finally {
    if (session) await session.endSession();
  }
};

// Admin assigns a mechanic to a job
const assignMechanic = async (req, res) => {
  try {
    const { requestId, mechanicId } = req.body;
    const mechanic = await Mechanic.findOne({
      _id: mechanicId,
      isActive: true,
    });
    if (!mechanic)
      return res.status(400).json({ message: "Mechanic is not available" });
    const serviceRequest = await ServiceRequest.findById(requestId);
    if (!serviceRequest)
      return res.status(404).json({ message: "Service request not found" });

    if (serviceRequest.status !== "pending") {
      return res.status(400).json({ message: "This service request can no longer be assigned." });
    }
    serviceRequest.mechanic = mechanicId;
    serviceRequest.mechanicId = mechanicId;
    serviceRequest.status = "assigned";
    await serviceRequest.save();

    res.status(200).json({
      message: "Mechanic assigned",
      serviceRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all service requests (admin)
const getAllServiceRequests = async (req, res) => {
  try {
    const shouldPaginate = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const filter = {};

    if (req.query.activeOnly === "true") {
      filter.status = { $in: ["pending", "assigned", "confirmed", "accepted", "in-progress"] };
    }

    if (req.query.reviewOnly === "true") {
      filter.$or = [
        { paymentStatus: "Payment Submitted" },
        { paymentStatus: "Payment Pending", paymentRejectionReason: { $exists: true, $ne: "" } }
      ];
    }

    if (req.query.status) {
      const status = String(req.query.status);
      const statusFilter = status === "Payment Submitted"
        ? { paymentStatus: "Payment Submitted" }
        : status === "Payment Pending"
          ? { paymentStatus: "Payment Pending" }
          : status === "Confirmed"
              ? { paymentStatus: "Confirmed" }
              : status === "Paid at shop"
                ? { paymentStatus: "Paid at shop" }
              : { status };
      filter.$and = [...(filter.$and || []), statusFilter];
    }

    const search = String(req.query.search || "").trim();
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const expression = new RegExp(escapedSearch, "i");
      const [matchingUsers, matchingMechanics] = await Promise.all([
        User.find({ $or: [{ firstName: expression }, { lastName: expression }, { email: expression }] }).distinct("_id"),
        Mechanic.find({ $or: [{ firstName: expression }, { lastName: expression }, { email: expression }] }).distinct("_id")
      ]);
      const searchFilter = {
        $or: [
          { code: expression },
          { serviceType: expression },
          { paymentReference: expression },
          { vehicle: expression },
          { user: { $in: matchingUsers } },
          { mechanic: { $in: matchingMechanics } },
          ...(mongoose.Types.ObjectId.isValid(search) ? [{ _id: search }] : [])
        ]
      };
      filter.$and = [...(filter.$and || []), searchFilter];
    }

    const [requests, totalRecords, totalAmountRows, paymentSubmittedCount] = await Promise.all([
      ServiceRequest.find(filter)
      .populate("user")
      .populate("mechanic")
      .sort({ paymentStatus: -1, createdAt: -1 })
      .skip(shouldPaginate ? (page - 1) * limit : 0)
      .limit(shouldPaginate ? limit : 0),
      shouldPaginate ? ServiceRequest.countDocuments(filter) : Promise.resolve(null),
      shouldPaginate
        ? ServiceRequest.aggregate([
          { $match: filter },
          { $group: { _id: null, total: { $sum: "$estimatedPrice" } } }
        ])
        : Promise.resolve([]),
      shouldPaginate
        ? ServiceRequest.countDocuments({ paymentStatus: "Payment Submitted" })
        : Promise.resolve(null)
    ]);
    const response = { requests: requests.map((request) => {
      const value = request.toObject();
      value.paymentSubmissions = (value.paymentSubmissions || []).map((submission) => {
        const data = submission.toObject();
        delete data.paymentProofPublicId;
        return data;
      });
      delete value.paymentProofPublicId;
      delete value.paymentProofFormat;
      delete value.paymentProofUrl;
      return value;
    }) };
    if (shouldPaginate) {
      response.pagination = {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / limit))
      };
      response.totalAmount = Number(totalAmountRows[0]?.total || 0);
      response.paymentSubmittedCount = paymentSubmittedCount;
    }
    res.status(200).json(response);
  } catch (error) {
    console.error("[getAllServiceRequests] error", error);
    res
      .status(500)
      .json({ message: "Failed to load service requests. Please try again." });
  }
};

const getAdminServiceRequestReceipts = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid service request ID.' });
    }
    const request = await ServiceRequest.findById(req.params.id)
      .select('paymentProofPublicId paymentProofFormat paymentSubmittedAt paymentSubmissions')
      .lean();
    if (!request) return res.status(404).json({ success: false, message: 'Service request not found.' });

    let submissions = (request.paymentSubmissions || []).map((submission) => ({
      ...submission,
      receiptUrl: getTemporaryReceiptUrl(submission.paymentProofPublicId, submission.format || 'jpg')
    }));
    if (!submissions.length && request.paymentProofPublicId) {
      submissions = [{
        submittedAt: request.paymentSubmittedAt,
        status: 'Payment Submitted',
        receiptUrl: getTemporaryReceiptUrl(request.paymentProofPublicId, request.paymentProofFormat || 'jpg')
      }];
    }
    res.json({ success: true, paymentSubmissions: submissions });
  } catch (error) {
    console.error('[getAdminServiceRequestReceipts] error', error);
    res.status(500).json({ success: false, message: 'Payment receipts could not be loaded.' });
  }
};

// Mechanic updates job status
const updateJobStatus = async (req, res) => {
  try {
    const { requestId, status } = req.body;
    const validStatuses = Object.values(serviceStatusTransitions).flat();
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const serviceRequest = await transitionServiceRequestStatus({
      requestId,
      mechanicId: req.user.userId,
      status
    });
    res.status(200).json({
      message: "Job status updated",
      serviceRequest,
    });
  } catch (error) {
    console.error("[updateJobStatus] error", error);
    if (error.status) return res.status(error.status).json({ message: error.message });
    res
      .status(500)
      .json({ message: "Failed to update job status. Please try again." });
  }
};

// Admin updates the booking status while monitoring the schedule.
const updateBookingStatus = async (req, res) => {
  let session;
  try {
    const { requestId, status, reason, refundDecision } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ message: "Invalid service request ID." });
    }
    if (status === "completed") {
      return res.status(400).json({ message: "Only the assigned mechanic can complete a booking." });
    }
    if (!Object.values(serviceAdminStatusTransitions).flat().includes(status)) {
      return res.status(400).json({ message: "Invalid booking status" });
    }

    session = await mongoose.startSession();
    let serviceRequest;
    await session.withTransaction(async () => {
      serviceRequest = await ServiceRequest.findById(requestId).session(session);
      if (!serviceRequest) throw Object.assign(new Error("Service request not found"), { status: 404 });
      if (serviceRequest.status === "completed") {
        throw Object.assign(new Error("A completed booking cannot be changed."), { status: 409 });
      }
      if (!serviceAdminStatusTransitions[serviceRequest.status]?.includes(status)) {
        throw Object.assign(new Error(`Cannot change status from ${serviceRequest.status} to ${status}`), { status: 400 });
      }
      if (status === "assigned" && !serviceRequest.mechanic) {
        throw Object.assign(new Error("Assign a mechanic before setting this request to Assigned."), { status: 400 });
      }
      if (status === "in-progress" && !PAID_SERVICE_STATUSES.includes(serviceRequest.paymentStatus)) {
        throw Object.assign(new Error("Payment is not confirmed yet."), { status: 409 });
      }
      const cancelReason = typeof reason === "string" ? reason.trim() : "";
      if (serviceRequest.status === "in-progress" && status === "cancelled"
        && (cancelReason.length < 3 || cancelReason.length > 300)) {
        throw Object.assign(new Error("Provide a cancellation reason between 3 and 300 characters."), { status: 400 });
      }
      if (["cancelled", "declined"].includes(status)
        && PAID_SERVICE_STATUSES.includes(serviceRequest.paymentStatus)) {
        if (!["refunded", "forfeited"].includes(refundDecision)) {
          throw Object.assign(new Error("Choose whether the service payment was refunded or forfeited."), { status: 400 });
        }
        serviceRequest.refundDecision = refundDecision;
        serviceRequest.refundDecisionBy = req.admin?.id || req.user?.userId || req.user?.id;
        serviceRequest.refundDecisionAt = new Date();
      }
      serviceRequest.status = status;
      if (cancelReason) serviceRequest.cancelReason = cancelReason;
      await serviceRequest.save({ session });
      if (["cancelled", "declined"].includes(status)) {
        await BusinessRecord.deleteOne({ recordType: "service", sourceId: serviceRequest._id }, { session });
      }
    });
    res.status(200).json({ message: "Booking status updated", serviceRequest });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error("[updateBookingStatus] error", error);
    res.status(500).json({ message: "Failed to update booking status. Please try again." });
  } finally {
    if (session) await session.endSession();
  }
};

// User gets their own service requests
const getUserServiceRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    const requests = await ServiceRequest.find({ $or: [{ user: userId }, { customerId: userId }] }).populate(
      "mechanic",
      "firstName lastName specialization",
    );
    res.status(200).json({ requests: requests.map(customerServiceRequestPayload) });
  } catch (error) {
    console.error("[getUserServiceRequests] error", error);
    res.status(500).json({
      message: "Failed to load your service requests. Please try again.",
    });
  }
};

// Mechanic gets their assigned jobs
const getMechanicJobs = async (req, res) => {
  try {
    const mechanicId = req.user.userId;
    const jobs = await ServiceRequest.find({
      $or: [
        { mechanic: mechanicId },
        { mechanic: null, status: "pending" },
      ],
    })
      .populate("user", "firstName lastName email")
      .sort({ createdAt: -1 });
    const formattedJobs = jobs.map((job) => {
      const request = job.toObject();
      request.customerName =
        `${request.user?.firstName || ""} ${request.user?.lastName || ""}`.trim() ||
        request.user?.email ||
        "Customer";
      return request;
    });
    res.status(200).json({ jobs: formattedJobs });
  } catch (error) {
    console.error("[getMechanicJobs] error", error);
    res
      .status(500)
      .json({ message: "Failed to load your jobs. Please try again." });
  }
};

module.exports = {
  submitServicePayment,
  reviewServicePayment,
  assignMechanic,
  getAllServiceRequests,
  getAdminServiceRequestReceipts,
  markServicePaidAtShop,
  expireServiceBookings,
  updateJobStatus,
  getUserServiceRequests,
  getMechanicJobs,
  mechanicAcceptJob,
  updateBookingStatus,
  syncCompletedServiceBusinessRecord,
  transitionServiceRequestStatus,
};
