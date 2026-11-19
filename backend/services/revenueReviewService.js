const { createHash } = require('crypto');
const Order = require('../models/orderingModels/order');
const Reservation = require('../models/orderingModels/reservation');
const ServiceRequest = require('../models/serviceRequest');
const Product = require('../models/product');
const Review = require('../models/revenueMonthReview');
const Audit = require('../models/adminAudit');
const { buildRevenuePipelines, getManilaDateParts, normalizeRevenueSources, REVENUE_TIMEZONE } = require('../utils/revenue');
const { resolveRevenueScope } = require('../utils/revenueScope');

const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sourceTypes = { order: 'order', reservation: 'reservation', service: 'service' };
const flag = (code, message, severity = 'blocking') => ({ code, message, severity });
const keys = records => [...new Map(records.map(row => [row.recordType + ':' + row.recordId, row])).values()]
  .sort((a,b) => (a.recordType + a.recordId).localeCompare(b.recordType + b.recordId));

// Reuse the eligibility predicates from the revenue pipeline, before projecting
// or normalizing: defaults must not conceal missing required revenue fields.
async function loadReviewRecords(session = null) {
  const pipelines = buildRevenuePipelines();
  const sources = await Promise.all([
    Order.find(pipelines.orders[0].$match).select('_id status createdAt totalPrice totalAmount items').session(session).lean(),
    Reservation.find({status:pipelines.reservations[0].$match.status}).select('_id code status completedAt total items').session(session).lean(),
    ServiceRequest.find(pipelines.services[0].$match).select('_id status completedAt estimatedPrice serviceType serviceCategory quoteStatus quotedPrice').session(session).lean()
  ]);
  const ids = sources.slice(0,2).flatMap(rows => rows.flatMap(row => (Array.isArray(row.items) ? row.items : []).map(item => item?.productId).filter(Boolean)));
  const products = ids.length ? await Product.find({ _id: { $in: ids } }).select('_id category').session(session).lean() : [];
  const categories = Object.fromEntries(products.map(row => [String(row._id), row.category]));
  const records = sources.flatMap((rows,index) => rows.map(row => {
    const source = ['order','reservation','service'][index];
    const eligible = source !== 'reservation' || Object.prototype.hasOwnProperty.call(row,'code');
    const date = source === 'order' ? row.createdAt : row.completedAt;
    const dateParts = date != null ? getManilaDateParts(date) : null;
    const amount = source === 'order' ? row.totalPrice ?? row.totalAmount : source === 'reservation' ? row.total : row.estimatedPrice;
    const flags = [];
    if (source === 'reservation' && !String(row.code || '').trim()) flags.push(flag('missing_reservation_code', 'A completed reservation is missing its required reservation code.'));

    if (!dateParts) flags.push(flag('missing_revenue_date', 'A completed revenue record has a missing or invalid ' + (source === 'order' ? 'createdAt' : 'completedAt') + '; its month cannot be established.'));
    if (!numeric(amount) || Number(amount) < 0) flags.push(flag('invalid_revenue_amount', 'Required revenue amount is missing, invalid or negative.'));
    const items = Array.isArray(row.items) ? row.items : [];
    if (source !== 'service') {
      if (!items.length) flags.push(flag('missing_items', 'Product revenue has no item breakdown.'));
      for (const item of items) {
        if (!item || typeof item !== 'object') { flags.push(flag('invalid_revenue_item', 'A revenue item is missing its required item fields.'));continue; }
        if (source === 'reservation' && !/^[a-f0-9]{24}$/i.test(String(item.productId || ''))) flags.push(flag('missing_product_id', 'A reserved revenue item is missing its required product reference.'));
        if (!String(item.name || item.productName || '').trim()) flags.push(flag('missing_item_name', 'A revenue item is missing its contributor name.'));
        const price = source === 'order' ? item.price : item.unitPrice;
        const qty = source === 'order' ? item.quantity : item.qty;
        if (!numeric(price) || Number(price) < 0 || !numeric(qty) || Number(qty) <= 0) flags.push(flag('invalid_item_amount', 'A revenue item is missing a valid price or quantity.'));
        if (source === 'reservation' && (!numeric(item.lineTotal) || Number(item.lineTotal) < 0)) flags.push(flag('missing_line_total', 'A reserved revenue item is missing its required line total.'));
        if (!(item.category || categories[String(item.productId)])) flags.push(flag('uncategorized_revenue', 'A revenue item uses the existing Uncategorized fallback.', 'warning'));
      }
    } else if (!String(row.serviceType || '').trim()) {
      flags.push(flag('missing_service_name', 'Service revenue is missing its required service type.'));
    }
    const snapshot = {
      source, recordId: String(row._id), status: row.status, eligible,
      reservationCode: source === 'reservation' ? row.code || null : null,
      date: dateParts ? new Date(date).toISOString() : null, amount: amount ?? null,
      items: items.map(item => !item || typeof item !== 'object' ? {invalid:true} : ({
        name: item.name || item.productName || null,
        price: (source === 'order' ? item.price : item.unitPrice) ?? null,
        quantity: (source === 'order' ? item.quantity : item.qty) ?? null,
        lineTotal: item.lineTotal ?? null, category: item.category || categories[String(item.productId)] || null
      })),
      serviceType: row.serviceType || null, serviceCategory: row.serviceCategory || null,
      quoteStatus: row.quoteStatus || null, quotedPrice: row.quotedPrice ?? null
    };
    return { row, source, eligible, dateLabel: dateParts?.dateLabel || null, snapshot, flags };
  }));
  // The same normalizer produces the dashboard's eligible revenue line items.
  const entries = normalizeRevenueSources({ orders: sources[0], reservations: sources[1].filter(row=>Object.prototype.hasOwnProperty.call(row,'code')), services: sources[2], productCategories: categories });
  return { records, entries };
}

function summarizeFlags(records) {
  const groups = new Map();
  for (const record of records) {
    for (const issue of new Map(record.flags.map(item => [item.code,item])).values()) {
      const value = groups.get(issue.code) || { ...issue, count: 0 };
      value.count++;groups.set(issue.code,value);
    }
  }
  return [...groups.values()].sort((a,b) => a.code.localeCompare(b.code));
}

async function getQuarterReview(selectedQuarter, { session = null, now = new Date() } = {}) {
  const scope = resolveRevenueScope({ scope: 'selectedQuarter', selectedQuarter });
  const firstMonth = Number(scope.startDate.slice(5,7)), year = Number(scope.startDate.slice(0,4));
  const monthKeys = [0,1,2].map(offset => year + '-' + String(firstMonth + offset).padStart(2,'0'));
  const [{records,entries},reviews] = await Promise.all([
    loadReviewRecords(session),
    Review.find({ monthKey: { $in: monthKeys } }).session(session).lean()
  ]);
  const currentSources = records.map(row => ({ recordType: sourceTypes[row.source], recordId: row.row._id }));
  const dependencies = keys([...currentSources,...reviews.flatMap(row => row.sourceRecords || [])]);
  const auditRows = await Audit.find({
    recordType: { $in: ['order','reservation','service'] },
    $or: [{recordId:{$in:dependencies.map(row=>row.recordId)}},{revenueMonths:{$in:monthKeys}}]
  }).select('_id recordType recordId revenueMonths').sort({_id:1}).session(session).lean();
  const unassigned = records.filter(row => !row.dateLabel);
  const globalFlags = summarizeFlags(unassigned);
  const today = getManilaDateParts(now).dateLabel;
  const months = monthKeys.map((monthKey,index) => {
    const startDate = monthKey + '-01';
    const endDateExclusive = index === 2 ? scope.endDateExclusive : monthKeys[index+1] + '-01';
    const periodStatus = today < startDate ? 'future' : today < endDateExclusive ? 'in_progress' : 'closed';
    const monthRecords = records.filter(row => row.dateLabel >= startDate && row.dateLabel < endDateExclusive);
    const dates = [...new Set(monthRecords.filter(row=>row.eligible).map(row => row.dateLabel))].sort();
    const review = reviews.find(row => row.monthKey === monthKey);
    const sourceRecords = keys([...monthRecords.map(row => ({recordType:sourceTypes[row.source],recordId:row.row._id})),...(review?.sourceRecords || [])]);
    const dependencyKeys = new Set(sourceRecords.map(row => row.recordType + ':' + row.recordId));
    const dataQualityFlags = [...summarizeFlags(monthRecords),...globalFlags.map(row => ({...row,code:'unassigned_'+row.code}))];
    if (monthRecords.some(row => row.dateLabel > today)) dataQualityFlags.push({ ...flag('future_transaction_date', 'Eligible revenue includes a future transaction date.'), count:monthRecords.filter(row => row.dateLabel > today).length });
    const fingerprint = digest({
      records:monthRecords.map(row => row.snapshot).sort((a,b)=>(a.source+a.recordId).localeCompare(b.source+b.recordId)),
      unassigned:unassigned.map(row=>row.snapshot).sort((a,b)=>(a.source+a.recordId).localeCompare(b.source+b.recordId)),
      auditEvents:auditRows.filter(row=>dependencyKeys.has(row.recordType+':'+row.recordId) || row.revenueMonths?.includes(monthKey)).map(row=>String(row._id))
    });
    const blocking = dataQualityFlags.some(row => row.severity === 'blocking');
    const current = review?.reviewedFingerprint === fingerprint && !blocking;
    const reviewStatus = periodStatus !== 'closed' ? periodStatus
      : review && !current ? 'needs_review'
      : blocking ? 'blocked'
      : current ? review.status : 'awaiting_review';
    const eligibleTransactionCount = monthRecords.filter(row=>row.eligible).length;
    return {
      monthKey, label: new Intl.DateTimeFormat('en-PH',{ timeZone:REVENUE_TIMEZONE, month:'long',year:'numeric' }).format(new Date(startDate+'T00:00:00+08:00')),
      startDate, endDateExclusive, periodStatus, eligibleTransactionCount,
      observedDates:dates, firstRecordedDate:dates[0] || null,lastRecordedDate:dates.at(-1) || null,
      recordedRevenue: entries.filter(row=>row.dateLabel>=startDate&&row.dateLabel<endDateExclusive).reduce((sum,row)=>sum+row.revenue,0),
      dataQualityFlags, reviewStatus, canReview:periodStatus==='closed'&&!blocking,
      canConfirmZeroSales:periodStatus==='closed'&&!blocking&&eligibleTransactionCount===0,
      confirmedZeroSales:current&&periodStatus==='closed'&&review.confirmedZeroSales===true,
      reviewerId:review?.reviewedBy || null, reviewedAt:review?.reviewedAt || null,
      reviewId:review?._id || null, fingerprint, sourceRecords
    };
  });
  const closed = today >= scope.endDateExclusive;
  const reviewed = closed && months.every(row => ['reviewed','confirmed_zero_sales'].includes(row.reviewStatus));
  const status = reviewed ? 'reviewed' : today < scope.startDate ? 'future' : !closed ? 'in_progress'
    : months.some(row=>row.dataQualityFlags.some(issue=>issue.severity==='blocking')) ? 'blocked'
    : months.some(row=>row.reviewStatus==='needs_review') ? 'needs_review' : 'awaiting_review';
  return { selectedQuarter, timezone:REVENUE_TIMEZONE, closed, status, reviewed, unassignedRecordCount:unassigned.length, months };
}

function publicQuarterReview(result) {
  return { ...result, months:result.months.map(({sourceRecords,...row}) => row) };
}
module.exports = { getQuarterReview, publicQuarterReview };
