const Order = require('../../models/orderingModels/order');
const mongoose = require('mongoose');
const Product = require('../../models/product');
const User = require('../../models/user');
const Mechanic = require('../../models/mechanic');
const ServiceRequest = require('../../models/serviceRequest');
const Service = require('../../models/service');
const BusinessRecord = require('../../models/businessRecord');
const Reservation = require('../../models/orderingModels/reservation');
const { archiveOrDeleteProduct, hasActiveProductReservation } = require('../../utils/safeDeleteInventoryRecord');
const { expireReservations } = require('../reservationController');
const {
  getProductImagePublicId,
  removeProductImageSafely
} = require('../../utils/productImage');
const {
  prepareProductMutation,
  uploadProductMutationImages
} = require('../../utils/productVariants');
const {
  getRevenueEntries,
  groupRevenueByPeriod,
  summarizeRevenue,
  calculateRevenueRisk,
  getRevenueRiskLevel,
  REVENUE_RISK_THRESHOLDS,
  calculateDashboardForecast,
  parseManilaDateBound,
  getManilaDateParts
} = require('../../utils/revenue');
const { buildServiceRevenueReport } = require('../../utils/serviceRevenue');
const { normalizeServiceCategory } = require('../../utils/serviceCategories');
const { getAvailableStock, isLowStock } = require('../../utils/inventory');
const { evaluateLowStockAlert } = require('../../utils/lowStockAlerts');

const loadRevenueEntries = (options = {}) => getRevenueEntries({
  Order,
  Reservation,
  ServiceRequest,
  Product,
  ...options
});

const isTransientInventoryWriteConflict = (error) =>
  error.code === 112
  || error.codeName === 'WriteConflict'
  || error.hasErrorLabel?.('TransientTransactionError');

const getRevenueByPeriod = async (unit, fromDate) => {
  const entries = await loadRevenueEntries({ startDate: fromDate });
  return groupRevenueByPeriod(entries, unit);
};

const getRevenueChartEntries = async (_req, res) => {
  try {
    const entries = await loadRevenueEntries();
    return res.json({ success: true, data: entries });
  } catch (error) {
    console.error('[getRevenueChartEntries] error', error);
    return res.status(500).json({ success: false, message: 'Failed to load revenue chart data.' });
  }
};

const getRevenueConcentration = async (req, res) => {
  try {
    const entries = await loadRevenueEntries();
    const data = calculateRevenueRisk(entries, []);
    const topOneShare = data.indicators.topContributorShare.value || 0;
    const topThreeShare = data.contributors.slice(0, 3).reduce((sum, item) => sum + item.share, 0);
    const hhi = data.indicators.concentrationHhi.value || 0;
    const concentrationLevel = data.completedQuarterCount < REVENUE_RISK_THRESHOLDS.minimumCompletedQuarters
      ? 'Not enough data'
      : [
        getRevenueRiskLevel('concentrationHhi', hhi),
        getRevenueRiskLevel('topContributorShare', topOneShare)
      ].sort((left, right) => ['Normal', 'Moderate', 'High'].indexOf(right) - ['Normal', 'Moderate', 'High'].indexOf(left))[0];

    res.json({
      success: true,
      data: {
        totalRevenue: data.totalRevenue,
        analyzedRevenue: data.totalRevenue - data.uncategorized.revenue,
        uncategorized: data.uncategorized,
        contributors: data.contributors,
        indicators: {
          topOneShare,
          topThreeShare,
          hhi,
          concentrationLevel,
          thresholds: REVENUE_RISK_THRESHOLDS
        },
        dependentOnLimitedContributors: concentrationLevel !== 'Normal'
      }
    });
  } catch (error) {
    console.error('[getRevenueConcentration] error', error);
    res.status(500).json({ success: false, message: 'Failed to calculate revenue concentration.' });
  }
};

// Get Dashboard Stats
const getDashboardStats = async (req, res) => {
  try {
    await expireReservations();
    const [revenueEntries, collectionSummary, outstandingSummary] = await Promise.all([
      loadRevenueEntries(),
      Reservation.aggregate([
        {
          $match: {
            code: { $exists: true },
            verifiedAt: { $ne: null },
            refundDecision: { $ne: 'refunded' }
          }
        },
        { $group: { _id: null, total: { $sum: '$amountPaid' } } }
      ]),
      Reservation.aggregate([
        { $match: { code: { $exists: true }, status: 'Reserved' } },
        { $group: { _id: null, total: { $sum: '$balanceDue' } } }
      ])
    ]);
    const revenueSummary = summarizeRevenue(revenueEntries);
    const totalInventoryItems = await Product.countDocuments({ isActive: { $ne: false } });
    const totalMechanics = await Mechanic.countDocuments();
    const totalUsers = await User.countDocuments();

    res.json({
      success: true,
      data: {
        totalRevenue: revenueSummary.totalSales,
        totalTransactions: revenueSummary.totalOrders,
        totalInventoryItems,
        totalMechanics,
        totalUsers,
        collected: collectionSummary[0]?.total || 0,
        outstanding: outstandingSummary[0]?.total || 0,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('[getDashboardStats] error', error);
    res.status(500).json({ success: false, message: 'Failed to load dashboard stats. Please try again.' });
  }
};

// Get Revenue Data
const getRevenueData = async (req, res) => {
  try {
    const revenueByMonth = await getRevenueByPeriod('month');

    res.json({
      success: true,
      data: revenueByMonth
    });
  } catch (error) {
    console.error('[getRevenueData] error', error);
    res.status(500).json({ success: false, message: 'Failed to load revenue data. Please try again.' });
  }
};

const getServiceRevenueRange = (period, now = new Date()) => {
  const parts = getManilaDateParts(now);
  const start = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  if (period === 'daily') {
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (period === 'weekly') {
    const daysSinceMonday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - daysSinceMonday - (7 * 7));
  } else {
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 11);
  }

  const startDate = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`;
  return { startDate, endDate: now };
};

const getServiceRevenue = async (req, res) => {
  try {
    const period = req.query.period || 'daily';
    if (!['daily', 'weekly', 'monthly'].includes(period)) {
      return res.status(400).json({ success: false, message: 'Period must be daily, weekly, or monthly.' });
    }

    const [entries, services] = await Promise.all([
      loadRevenueEntries(getServiceRevenueRange(period)),
      Service.find({}, { name: 1, category: 1 }).lean()
    ]);
    const serviceCategoryByName = new Map(services.map((service) => [
      service.name.trim().toLocaleLowerCase('en'),
      normalizeServiceCategory(service.category)
    ]));
    const data = buildServiceRevenueReport({
      entries,
      nonServiceRevenue: summarizeRevenue(entries.filter((entry) => entry.source !== 'service')).totalSales,
      serviceCategoryByName
    });

    res.json({ success: true, data: { period, ...data } });
  } catch (error) {
    console.error('[getServiceRevenue] error', error);
    res.status(500).json({ success: false, message: 'Failed to load service revenue.' });
  }
};

// Get Quarterly Data
const getQuarterlyData = async (req, res) => {
  try {
    const quarterlyData = await getRevenueByPeriod('quarter');

    res.json({
      success: true,
      data: quarterlyData
    });
  } catch (error) {
    console.error('[getQuarterlyData] error', error);
    res.status(500).json({ success: false, message: 'Failed to load quarterly data. Please try again.' });
  }
};

// Get Daily Data
const getDailyData = async (req, res) => {
  try {
    const lastSevenDays = new Date();
    lastSevenDays.setDate(lastSevenDays.getDate() - 7);

    const dailyData = await getRevenueByPeriod('date', lastSevenDays);

    res.json({
      success: true,
      data: dailyData
    });
  } catch (error) {
    console.error('[getDailyData] error', error);
    res.status(500).json({ success: false, message: 'Failed to load daily data. Please try again.' });
  }
};

// Get Revenue Risk
const getRevenueRisk = async (req, res) => {
  try {
    const [entries, quarterlyData] = await Promise.all([
      loadRevenueEntries(),
      getRevenueByPeriod('quarter')
    ]);
    const risk = calculateRevenueRisk(entries, quarterlyData);

    res.json({
      success: true,
      data: risk
    });
  } catch (error) {
    console.error('[getRevenueRisk] error', error);
    res.status(500).json({ success: false, message: 'Failed to load revenue risk data. Please try again.' });
  }
};

// Get Projected Revenue
const getProjectedRevenue = async (req, res) => {
  try {
    const quarterlyData = await getRevenueByPeriod('quarter');
    const currentQuarter = getManilaDateParts(new Date());
    const completedQuarters = quarterlyData.filter((row) =>
      row._id.year < currentQuarter.year
      || (row._id.year === currentQuarter.year && row._id.quarter < currentQuarter.quarter)
    );
    const forecast = calculateDashboardForecast(quarterlyData);
    const insufficientData = forecast === null;

    res.json({
      success: true,
      data: {
        insufficientData,
        availableQuarters: completedQuarters.length,
        projection: forecast ? [{
          _id: forecast.targetQuarter,
          revenue: forecast.expected,
          low: forecast.low,
          high: forecast.high,
          target: forecast.target,
          targetLabel: forecast.targetLabel,
          baseRevenue: forecast.baseRevenue,
          growthRates: forecast.growthRates,
          averageGrowthRate: forecast.averageGrowthRate,
          quarterToDate: forecast.quarterToDate
        }] : []
      }
    });
  } catch (error) {
    console.error('[getProjectedRevenue] error', error);
    res.status(500).json({ success: false, message: 'Failed to load projected revenue data. Please try again.' });
  }
};

// Get All Transactions
const getBusinessRecords = async (req, res) => {
  try {
    const { recordType, status, startDate, endDate, mechanicId, type, itemView = 'all', search, partsSource } = req.query;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    await expireReservations();
    const query = {};

    if (recordType) query.recordType = recordType;
    const reservationStatuses = [
      'Pending Down Payment',
      'Payment Submitted',
      'Reserved',
      'Completed',
      'Cancelled',
      'Expired'
    ];
    const statusLower = String(status || '').toLowerCase();
    const reservationStatus = reservationStatuses.find(
      (value) => value.toLowerCase() === statusLower
    );
    const cancelledOrExpiredFilter = statusLower === 'cancelled/expired';
    const reservationStatusFilter = cancelledOrExpiredFilter
      ? { $in: ['Cancelled', 'Expired'] }
      : reservationStatus || (status ? '__no_matching_reservation_status__' : undefined);
    if (status) {
      query.status = reservationStatus
        ? statusLower === 'completed'
          ? { $in: ['Paid', 'completed'] }
          : '__no_matching_business_record_status__'
        : cancelledOrExpiredFilter
          ? '__no_matching_business_record_status__'
        : statusLower === 'paid'
          ? { $in: ['Paid', 'completed'] }
          : statusLower;
    }
    if (mechanicId) query.mechanicId = mechanicId;
    if (startDate || endDate) {
      query.completedAt = {};
      if (startDate) query.completedAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.completedAt.$lte = end;
      }
    }

    const typeMap = { item: 'product', service: 'service' };
    if (type && !typeMap[type]) {
      return res.status(400).json({ success: false, message: 'Type must be item or service' });
    }
    if (type === 'item' && !['all', 'sales', 'reservations'].includes(itemView)) {
      return res.status(400).json({ success: false, message: 'Item view must be all, sales, or reservations' });
    }
    const searchPattern = search
      ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : null;
    const withSearch = (fields) => searchPattern
      ? { ...query, $or: fields.map((field) => ({ [field]: searchPattern })) }
      : { ...query };
    const allQuery = withSearch(['customer', 'itemName', 'mechanicName']);
    const itemQuery = { ...withSearch(['customer', 'itemName']), recordType: 'product' };
    const serviceQuery = { ...withSearch(['customer', 'itemName', 'mechanicName']), recordType: 'service' };
    if (type === 'service' && partsSource === 'customer') {
      serviceQuery.partsSource = 'customer';
    } else if (type === 'service' && partsSource === 'shop') {
      serviceQuery.$and = [...(serviceQuery.$and || []), {
        $or: [{ partsSource: 'shop' }, { partsSource: { $exists: false } }, { partsSource: null }]
      }];
    }
    const reservationQuery = { code: { $exists: true } };
    if (reservationStatusFilter) reservationQuery.status = reservationStatusFilter;
    if (searchPattern) {
      reservationQuery.$or = [
        { code: searchPattern },
        { customerName: searchPattern },
        { customerPhone: searchPattern },
        { paymentReference: searchPattern },
        { 'items.name': searchPattern }
      ];
    }
    if (startDate || endDate) {
      reservationQuery.createdAt = {};
      if (startDate) reservationQuery.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        reservationQuery.createdAt.$lte = end;
      }
    }
    const includeReservations = !type || (type === 'item' && itemView !== 'sales');
    const reservationIds = await Reservation.distinct('_id', {
      code: { $exists: true },
      status: 'Completed'
    });
    const allBusinessRecordsQuery = {
      $and: [
        allQuery,
        { $or: [{ recordType: { $ne: 'product' } }, { sourceId: { $nin: reservationIds } }] }
      ]
    };
    const itemBusinessRecordsQuery = { ...itemQuery, sourceId: { $nin: reservationIds } };
    const emptyBusinessRecordQuery = { _id: { $exists: false } };
    const filteredQuery = type === 'item'
      ? itemView === 'reservations'
        ? emptyBusinessRecordQuery
        : itemBusinessRecordsQuery
      : type === 'service'
        ? serviceQuery
        : allBusinessRecordsQuery;
    const [businessCount, businessAmount, reservationCount, reservationAmount, allCountBase, itemCountBase, serviceCount, records, reservationRows] = await Promise.all([
      BusinessRecord.countDocuments(filteredQuery),
      BusinessRecord.aggregate([
        { $match: filteredQuery },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      includeReservations ? Reservation.countDocuments(reservationQuery) : 0,
      includeReservations ? Reservation.aggregate([
        { $match: reservationQuery },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]) : [],
      BusinessRecord.countDocuments(allBusinessRecordsQuery),
      BusinessRecord.countDocuments(itemBusinessRecordsQuery),
      BusinessRecord.countDocuments(serviceQuery),
      BusinessRecord.find(filteredQuery)
        .sort({ completedAt: -1, createdAt: -1, _id: -1 })
        .limit(page * limit),
      includeReservations
        ? Reservation.aggregate([
          { $match: reservationQuery },
          { $addFields: { sortDate: { $ifNull: ['$completedAt', '$createdAt'] } } },
          { $sort: { sortDate: -1, _id: -1 } },
          { $limit: page * limit }
        ])
        : []
    ]);
    const allReservationCount = await Reservation.countDocuments({
      code: { $exists: true },
      ...(searchPattern ? { $or: [
        { code: searchPattern },
        { customerName: searchPattern },
        { customerPhone: searchPattern },
        { paymentReference: searchPattern },
        { 'items.name': searchPattern }
      ] } : {}),
      ...(reservationStatusFilter ? { status: reservationStatusFilter } : {}),
      ...(startDate || endDate ? { createdAt: {
        ...(startDate ? { $gte: new Date(startDate) } : {}),
        ...(endDate ? { $lte: (() => { const end = new Date(endDate); end.setHours(23, 59, 59, 999); return end; })() } : {})
      } } : {})
    });
    const paymentSubmittedCount = await Reservation.countDocuments({
      ...reservationQuery,
      status: 'Payment Submitted'
    });
    const matchingReservationCount = includeReservations ? reservationCount : 0;
    const matchingCount = businessCount + matchingReservationCount;
    const counts = {
      all: allCountBase + allReservationCount,
      items: type === 'item'
        ? matchingCount
        : itemCountBase + allReservationCount,
      services: serviceCount,
      paymentSubmitted: paymentSubmittedCount
    };

    const productRecordIds = records
      .filter((record) => record.recordType === 'product')
      .map((record) => record.sourceId);
    const [orders, reservations] = productRecordIds.length
      ? await Promise.all([
        Order.find({ _id: { $in: productRecordIds }, code: { $exists: false } }).select('items').lean(),
        Reservation.find({ _id: { $in: productRecordIds }, code: { $exists: true } }).select('items').lean()
      ])
      : [[], []];
    const quantitiesByOrderId = new Map([
      ...orders.map((order) => [
        order._id.toString(),
        (order.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0)
      ]),
      ...reservations.map((reservation) => [
        reservation._id.toString(),
        (reservation.items || []).reduce((total, item) => total + Number(item.qty || 0), 0)
      ])
    ]);
    const serviceRequests = records.some((record) => record.recordType === 'service')
      ? await ServiceRequest.find({
        _id: {
          $in: records
            .filter((record) => record.recordType === 'service')
            .map((record) => record.sourceId)
        }
      }).select('user customerId').lean()
      : [];
    const linkedCustomerIds = [
      ...reservationRows.map((reservation) => reservation.customerId).filter(Boolean),
      ...serviceRequests.flatMap((request) => [request.user, request.customerId].filter(Boolean))
    ];
    const deletedCustomerIds = new Set(
      (linkedCustomerIds.length
        ? await User.find({ _id: { $in: linkedCustomerIds }, isDeleted: true }).select('_id').lean()
        : []).map((customer) => String(customer._id))
    );
    const deletedServiceRequestIds = new Set(
      serviceRequests
        .filter((request) => deletedCustomerIds.has(String(request.user || request.customerId)))
        .map((request) => String(request._id))
    );
    const recordsWithQuantity = records.map((record) => ({
      ...record.toObject(),
      ...(deletedServiceRequestIds.has(String(record.sourceId)) ? { customer: 'Deleted customer' } : {}),
      quantity: quantitiesByOrderId.get(record.sourceId.toString()),
      paid: record.recordType === 'product' ? Number(record.amount || 0) : null,
      balance: record.recordType === 'product' ? 0 : null
    }));
    const reservationRecords = reservationRows.map((reservation) => {
      const reservationData = { ...reservation };
      delete reservationData.sortDate;
      return {
        ...reservationData,
        recordType: 'product',
        isReservation: true,
        sourceId: reservation._id,
        customer: deletedCustomerIds.has(String(reservation.customerId))
          ? 'Deleted customer'
          : reservation.customerName || 'Unknown',
        customerPhone: reservation.customerPhone || '',
        itemName: (reservation.items || []).map((item) => item.name).join(', '),
        amount: Number(reservation.total || 0),
        paid: Number(reservation.amountPaid || 0),
        balance: Number(reservation.balanceDue || 0),
        quantity: (reservation.items || []).reduce((total, item) => total + Number(item.qty || 0), 0),
        completedAt: reservation.completedAt || reservation.createdAt,
        mechanicName: 'N/A'
      };
    });
    const combinedRows = [...recordsWithQuantity, ...reservationRecords].sort(
      (left, right) => new Date(right.completedAt || right.createdAt) - new Date(left.completedAt || left.createdAt)
        || String(right._id).localeCompare(String(left._id))
    );
    const pageRows = combinedRows.slice((page - 1) * limit, page * limit);
    const totalAmount = (businessAmount[0]?.total || 0) + (reservationAmount[0]?.total || 0);

    res.json({
      success: true,
      data: pageRows,
      counts,
      totalAmount,
      pagination: {
        totalRecords: matchingCount,
        totalPages: Math.max(1, Math.ceil(matchingCount / limit)),
        currentPage: page,
        limit
      }
    });
  } catch (error) {
    console.error('[getBusinessRecords] error', error);
    res.status(500).json({ success: false, message: 'Failed to load business records.' });
  }
};

const getAllTransactions = async (req, res) => {
  if (req.query.view !== 'orders') {
    return getBusinessRecords(req, res);
  }

  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const { status = null } = req.query;
    const query = { code: { $exists: false }, ...(status ? { status } : {}) };
    const includeCompletedReservations = !status || String(status).toLowerCase() === 'completed';
    const [orders, orderCount, reservationRows, reservationCount] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(page * limit),
      Order.countDocuments(query),
      includeCompletedReservations
        ? Reservation.find({ status: 'Completed', code: { $exists: true } }).sort({ completedAt: -1, _id: -1 }).limit(page * limit)
        : [],
      includeCompletedReservations ? Reservation.countDocuments({ status: 'Completed', code: { $exists: true } }) : 0
    ]);
    const reservations = reservationRows.map((reservation) => ({
      _id: reservation._id,
      totalPrice: reservation.total,
      createdAt: reservation.completedAt,
      status: 'completed',
      items: reservation.items.map((item) => ({
        productId: item.productId,
        productName: item.name,
        category: 'Product reservations',
        price: item.unitPrice,
        quantity: item.qty
      }))
    }));
    const transactions = [...orders, ...reservations]
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)
        || String(right._id).localeCompare(String(left._id)))
      .slice((page - 1) * limit, page * limit);
    const total = orderCount + reservationCount;

    res.json({
      success: true,
      data: transactions,
      pagination: {
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page
      }
    });
  } catch (error) {
    console.error('[getAllTransactions] error', error);
    res.status(500).json({ success: false, message: 'Failed to load transactions. Please try again.' });
  }
};

// Get Transaction by ID
const getTransactionById = async (req, res) => {
  try {
    let transaction = await Order.findOne({ _id: req.params.id, code: { $exists: false } })
      .populate('items.productId');

    if (!transaction) {
      const reservation = await Reservation.findOne({ _id: req.params.id, code: { $exists: true } }).populate('customerId', 'firstName lastName email');
      if (!reservation) {
        return res.status(404).json({ success: false, message: 'Transaction not found' });
      }
      transaction = {
        ...reservation.toObject(),
        userId: reservation.customerId,
        status: 'completed',
        totalPrice: reservation.total,
        items: reservation.items.map((item) => ({
          productId: item.productId,
          productName: item.name,
          price: item.unitPrice,
          quantity: item.qty
        }))
      };
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('[getTransactionById] error', error);
    res.status(500).json({ success: false, message: 'Failed to load transaction. Please try again.' });
  }
};

// Update Transaction
const updateTransaction = async (req, res) => {
  try {
    const allowedStatuses = ['pending', 'completed', 'cancelled', 'Paid'];
    const status = req.body?.status;
    if (typeof status !== 'string' || !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'A valid transaction status is required.' });
    }
    const transaction = await Order.findOneAndUpdate(
      { _id: req.params.id, code: { $exists: false } },
      { $set: { status } },
      { new: true, runValidators: true }
    );

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.json({
      success: true,
      message: 'Transaction updated successfully',
      data: transaction
    });
  } catch (error) {
    console.error('[updateTransaction] error', error);
    res.status(500).json({ success: false, message: 'Failed to update transaction. Please try again.' });
  }
};

// Delete Transaction
const deleteTransaction = async (req, res) => {
  try {
    const transaction = await Order.findOneAndDelete({ _id: req.params.id, code: { $exists: false } });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.json({
      success: true,
      message: 'Transaction deleted successfully'
    });
  } catch (error) {
    console.error('[deleteTransaction] error', error);
    res.status(500).json({ success: false, message: 'Failed to delete transaction. Please try again.' });
  }
};

// Get All Inventory
const serializeInventoryVariants = (variants = []) => variants.map((variant) => ({
  ...variant.toObject(),
  brand: variant.brand || '',
  model: variant.model || '',
  size: variant.size || '',
  color: variant.color || '',
  label: variant.label || '',
  imageUrl: variant.imageUrl || ''
}));

const getAllInventory = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const filter = { isActive: { $ne: false } };
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.name = { $regex: escapedSearch, $options: 'i' };
    }
    const [inventory, total] = await Promise.all([
      Product.find(filter).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter)
    ]);
    const activeReservations = await Reservation.find({
      code: { $exists: true },
      status: { $in: ['Pending Down Payment', 'Payment Submitted', 'Reserved'] },
      'items.productId': { $in: inventory.map((item) => item._id) }
    }).select('items.productId');
    const activeProductIds = new Set(
      activeReservations.flatMap((reservation) => reservation.items.map((item) => item.productId.toString()))
    );
    const inventoryWithAvailability = inventory.map((item) => ({
      ...item.toObject(),
      variants: serializeInventoryVariants(item.variants || []),
      available: Number(item.quantity || 0) - Number(item.reservedQty || 0),
      hasActiveReservation: activeProductIds.has(item._id.toString())
    }));

    res.json({
      success: true,
      data: inventoryWithAvailability,
      pagination: {
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
        currentPage: page
      }
    });
  } catch (error) {
    console.error('[getAllInventory] error', error);
    res.status(500).json({ success: false, message: 'Failed to load inventory. Please try again.' });
  }
};

// Get Inventory Item
const getInventoryItem = async (req, res) => {
  try {
    const item = await Product.findOne({ _id: req.params.id, isActive: { $ne: false } });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    res.json({
      success: true,
      data: {
        ...item.toObject(),
        variants: serializeInventoryVariants(item.variants || [])
      }
    });
  } catch (error) {
    console.error('[getInventoryItem] error', error);
    res.status(500).json({ success: false, message: 'Failed to load inventory item. Please try again.' });
  }
};

// Add Inventory Item
const addInventoryItem = async (req, res) => {
  let prepared;
  try {
    prepared = await prepareProductMutation({
      input: req.body,
      productFile: req.file,
      variantFiles: req.variantFiles,
      Reservation
    });
    const item = await Product.create(prepared.data);
    await evaluateLowStockAlert(item._id);

    res.status(201).json({
      success: true,
      message: 'Inventory item added successfully',
      data: item
    });
  } catch (error) {
    for (const image of prepared?.uploadedImages || error.uploadedImages || []) {
      await removeProductImageSafely(image.imagePublicId, 'addInventoryItem.rollback');
    }
    console.error('[addInventoryItem] error', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to add inventory item. Please try again.',
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
    });
  }
};

// Update Inventory Item
const updateInventoryItem = async (req, res) => {
  let session;
  let stagedImages;
  let prepared;
  try {
    stagedImages = await uploadProductMutationImages({
      input: req.body,
      productFile: req.file,
      variantFiles: req.variantFiles
    });
    session = await mongoose.startSession();
    let item;
    await session.withTransaction(async () => {
      const currentItem = await Product.findById(req.params.id).session(session);
      if (!currentItem) throw Object.assign(new Error('Item not found'), { status: 404 });
      prepared = await prepareProductMutation({
        input: req.body,
        currentProduct: currentItem,
        Reservation,
        session,
        preparedImages: stagedImages
      });
      currentItem.set(prepared.data);
      item = await currentItem.save({ session });
    });
    await evaluateLowStockAlert(item._id);
    for (const publicId of prepared.obsoleteImagePublicIds) {
      await removeProductImageSafely(publicId, 'updateInventoryItem');
    }

    res.json({
      success: true,
      message: 'Inventory item updated successfully',
      data: item
    });
  } catch (error) {
    for (const image of prepared?.uploadedImages || stagedImages?.uploadedImages || error.uploadedImages || []) {
      await removeProductImageSafely(image.imagePublicId, 'updateInventoryItem.rollback');
    }
    console.error('[updateInventoryItem] error', error);
    const isConflict = isTransientInventoryWriteConflict(error);
    res.status(isConflict ? 409 : error.status || 500).json({
      success: false,
      message: isConflict
        ? 'This item changed while saving. Reload and try again.'
        : error.message || 'Failed to update inventory item. Please try again.',
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
    });
  } finally {
    if (session) await session.endSession();
  }
};

// Delete Inventory Item
const deleteInventoryItem = async (req, res) => {
  try {
    const item = await Product.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const activeReservation = await hasActiveProductReservation(item._id);
    if (activeReservation) {
      return res.status(409).json({
        success: false,
        message: 'This item cannot be deleted while it has an active reservation.'
      });
    }

    const { archived } = await archiveOrDeleteProduct(item);
    if (!archived) {
      await removeProductImageSafely(
        item.imagePublicId || getProductImagePublicId(item.imageUrl || item.image),
        'deleteInventoryItem'
      );
      for (const variant of item.variants || []) {
        await removeProductImageSafely(
          variant.imagePublicId || getProductImagePublicId(variant.imageUrl),
          'deleteInventoryItem.variant'
        );
      }
    }
    res.json({
      success: true,
      archived,
      message: archived
        ? 'Inventory item archived because it is referenced by past records'
        : 'Inventory item deleted successfully'
    });
  } catch (error) {
    console.error('[deleteInventoryItem] error', error);
    res.status(500).json({ success: false, message: 'Failed to delete inventory item. Please try again.' });
  }
};

// Get Sales Report
const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const reportStartDate = parseManilaDateBound(startDate);
    const reportEndDate = parseManilaDateBound(endDate, true);
    const revenueEntries = await loadRevenueEntries({
      startDate: reportStartDate,
      endDate: reportEndDate
    });
    const summary = summarizeRevenue(revenueEntries);

    const forfeitureDateQuery = startDate || endDate ? {
      refundDecisionAt: {
        ...(reportStartDate ? { $gte: reportStartDate } : {}),
        ...(reportEndDate ? { $lte: reportEndDate } : {})
      }
    } : {};
    const forfeitureReport = await Reservation.aggregate([
      {
        $match: {
          code: { $exists: true },
          status: { $in: ['Cancelled', 'Expired'] },
          refundDecision: 'forfeited',
          ...forfeitureDateQuery
        }
      },
      { $group: { _id: null, forfeitedDownPayments: { $sum: '$amountPaid' } } }
    ]);
    const report = [{
      totalSales: summary.totalSales,
      totalOrders: summary.totalOrders,
      avgOrderValue: summary.avgOrderValue,
      forfeitedDownPayments: forfeitureReport[0]?.forfeitedDownPayments || 0
    }];

    res.json({
      success: true,
      data: report[0] || { totalSales: 0, totalOrders: 0, avgOrderValue: 0, forfeitedDownPayments: 0 }
    });
  } catch (error) {
    console.error('[getSalesReport] error', error);
    res.status(500).json({ success: false, message: 'Failed to load sales report. Please try again.' });
  }
};

// Get Inventory Report
const getInventoryReport = async (req, res) => {
  try {
    const activeProducts = await Product.find({ isActive: { $ne: false } }).lean();
    const lowStockItems = activeProducts
      .map((item) => ({ ...item, available: getAvailableStock(item) }))
      .filter((item) => isLowStock(item.available));
    const totalInventoryValue = await Product.aggregate([
      { $match: { isActive: { $ne: false } } },
      { $group: { _id: null, totalValue: { $sum: { $multiply: ['$price', '$quantity'] } } } }
    ]);

    res.json({
      success: true,
      data: {
        lowStockItems,
        totalItems: activeProducts.length,
        totalInventoryValue: totalInventoryValue[0]?.totalValue || 0
      }
    });
  } catch (error) {
    console.error('[getInventoryReport] error', error);
    res.status(500).json({ success: false, message: 'Failed to load inventory report. Please try again.' });
  }
};

// Get Mechanics Report
const getMechanicsReport = async (req, res) => {
  try {
    const mechanicsReport = await Mechanic.aggregate([
      { $match: { isActive: { $ne: false } } },
      {
        $lookup: {
          from: 'servicerequests',
          let: { mechanicId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ['$mechanic', '$$mechanicId'] },
                    { $eq: ['$mechanicId', '$$mechanicId'] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalJobs: { $sum: 1 },
                completedJobs: {
                  $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                },
                totalLabor: {
                  $sum: {
                    $cond: [
                      { $eq: ['$status', 'completed'] },
                      { $ifNull: ['$mechanicFeeTotal', { $ifNull: ['$laborFee', 0] }] },
                      0
                    ]
                  }
                }
              }
            }
          ],
          as: 'jobStats'
        }
      },
      {
        $project: {
          _id: '$_id',
          name: { $trim: { input: { $concat: ['$firstName', ' ', '$lastName'] } } },
          specialty: '$specialization',
          totalJobs: { $ifNull: [{ $arrayElemAt: ['$jobStats.totalJobs', 0] }, 0] },
          completedJobs: { $ifNull: [{ $arrayElemAt: ['$jobStats.completedJobs', 0] }, 0] },
          totalLabor: { $ifNull: [{ $arrayElemAt: ['$jobStats.totalLabor', 0] }, 0] }
        }
      }
    ]);

    res.json({
      success: true,
      data: mechanicsReport
    });
  } catch (error) {
    console.error('[getMechanicsReport] error', error);
    res.status(500).json({ success: false, message: 'Failed to load mechanics report. Please try again.' });
  }
};



module.exports = {
  getDashboardStats,
  getRevenueData,
  getRevenueChartEntries,
  getServiceRevenue,
  getQuarterlyData,
  getDailyData,
  getRevenueRisk,
  getRevenueConcentration,
  getProjectedRevenue,
  getBusinessRecords,
  getAllTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
  getAllInventory,
  getInventoryItem,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getSalesReport,
  getInventoryReport,
  getMechanicsReport
};