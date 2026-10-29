const REVENUE_TIMEZONE = 'Asia/Manila';
const ORDER_STATUSES = ['completed', 'Paid'];
const REVENUE_RISK_THRESHOLDS = require('../../shared/revenueRiskConfig.json');

const dateExpression = (field) => ({ $toDate: `$${field}` });
const datePart = (operator, field) => ({
  [operator]: { date: dateExpression(field), timezone: REVENUE_TIMEZONE }
});

const dateFields = (field) => ({
  date: dateExpression(field),
  year: datePart('$year', field),
  month: datePart('$month', field),
  quarter: {
    $ceil: {
      $divide: [datePart('$month', field), 3]
    }
  },
  dateLabel: {
    $dateToString: {
      format: '%Y-%m-%d',
      date: dateExpression(field),
      timezone: REVENUE_TIMEZONE
    }
  }
});

function percentChange(current, previous) {
  const currentValue = Number(current);
  const previousValue = Number(previous);
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue) || previousValue === 0) return null;
  return ((currentValue - previousValue) / previousValue) * 100;
}

function makeDateMatch(field, startDate, endDate) {
  if (!startDate && !endDate) return {};
  return {
    [field]: {
      ...(startDate ? { $gte: startDate } : {}),
      ...(endDate ? { $lte: endDate } : {})
    }
  };
}

function buildRevenuePipelines({ startDate, endDate } = {}) {
  return {
    orders: [
      {
        $match: {
          status: { $in: ORDER_STATUSES },
          code: { $exists: false },
          ...makeDateMatch('createdAt', startDate, endDate)
        }
      },
      {
        $project: {
          revenue: { $ifNull: ['$totalPrice', '$totalAmount'] },
          ...dateFields('createdAt'),
          items: 1,
          source: { $literal: 'order' }
        }
      }
    ],
    reservations: [
      {
        $match: {
          status: 'Completed',
          code: { $exists: true },
          ...makeDateMatch('completedAt', startDate, endDate)
        }
      },
      {
        $project: {
          revenue: '$total',
          ...dateFields('completedAt'),
          items: 1,
          source: { $literal: 'reservation' }
        }
      }
    ],
    services: [
      {
        $match: {
          status: 'completed',
          ...makeDateMatch('completedAt', startDate, endDate)
        }
      },
      {
        $project: {
          revenue: '$estimatedPrice',
          ...dateFields('completedAt'),
          serviceType: 1,
          source: { $literal: 'service' }
        }
      }
    ]
  };
}

function getManilaDateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REVENUE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const part = (type) => Number(parts.find((entry) => entry.type === type)?.value);
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return {
    year,
    month,
    day,
    quarter: Math.ceil(month / 3),
    dateLabel: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  };
}

function normalizeRevenueSources({ orders = [], reservations = [], services = [], productCategories = {} }) {
  const sourceRows = [
    ...orders.map((row) => ({ ...row, source: 'order' })),
    ...reservations.map((row) => ({ ...row, source: 'reservation' })),
    ...services.map((row) => ({ ...row, source: 'service' }))
  ];

  return sourceRows.flatMap((row) => {
    const revenue = Number(row.revenue ?? row.totalPrice ?? row.totalAmount ?? row.total ?? row.estimatedPrice ?? 0);
    const parts = {
      year: Number(row.year),
      month: Number(row.month),
      quarter: Number(row.quarter),
      dateLabel: row.dateLabel
    };
    if (!parts.year || !parts.month || !parts.quarter || !parts.dateLabel) {
      Object.assign(parts, getManilaDateParts(row.date || row.createdAt || row.completedAt));
    }
    if (!Number.isFinite(revenue) || !parts.year) return [];

    if (row.source === 'service') {
      return [{
        ...parts,
        source: row.source,
        recordId: String(row._id || `${row.source}:${row.dateLabel}:${row.serviceType || ''}`),
        revenue,
        name: row.serviceType || 'Service',
        contributorType: 'Labor service',
        category: null
      }];
    }

    const items = Array.isArray(row.items) ? row.items : [];
    const lineValues = items.map((item) => Number(
      row.source === 'reservation'
        ? item.lineTotal ?? (Number(item.unitPrice || 0) * Number(item.qty || 0))
        : Number(item.price || 0) * Number(item.quantity || 0)
    ));
    const lineTotal = lineValues.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    if (!items.length || lineTotal <= 0) {
      return [{
        ...parts,
        source: row.source,
        recordId: String(row._id || `${row.source}:${row.dateLabel}`),
        revenue,
        name: row.source === 'order' ? 'Product sales' : 'Reserved products',
        contributorType: 'Uncategorized',
        category: 'Uncategorized'
      }];
    }

    return items.map((item, index) => {
      const productCategory = productCategories[String(item.productId)];
      const fallbackCategory = (item.category || productCategory) || 'Uncategorized';
      const amount = Number.isFinite(lineValues[index]) && lineValues[index] > 0
        ? revenue * lineValues[index] / lineTotal
        : 0;
      return {
        ...parts,
        source: row.source,
        recordId: String(row._id || `${row.source}:${row.dateLabel}`),
        revenue: amount,
        name: row.source === 'order' ? item.productName || item.name : item.name || item.productName,
        contributorType: fallbackCategory,
        category: fallbackCategory
      };
    });
  });
}

function groupRevenueByPeriod(entries, unit) {
  const groups = new Map();
  entries.forEach((entry) => {
    const id = unit === 'date'
      ? entry.dateLabel
      : unit === 'quarter'
        ? { year: entry.year, quarter: entry.quarter }
        : { year: entry.year, month: entry.month };
    const key = typeof id === 'string' ? id : JSON.stringify(id);
    const group = groups.get(key) || { _id: id, revenue: 0, count: 0, records: new Set() };
    group.revenue += entry.revenue;
    group.records.add(entry.recordId);
    group.count = group.records.size;
    groups.set(key, group);
  });
  return [...groups.values()].map(({ records, ...group }) => group).sort((left, right) => {
    if (typeof left._id === 'string') return left._id.localeCompare(right._id);
    return left._id.year - right._id.year
      || (left._id.quarter || left._id.month) - (right._id.quarter || right._id.month);
  });
}

function summarizeRevenue(entries) {
  const totalSales = entries.reduce((sum, entry) => sum + entry.revenue, 0);
  const transactionCount = new Set(entries.map((entry) => entry.recordId)).size;
  return {
    totalSales,
    totalOrders: transactionCount,
    avgOrderValue: transactionCount ? totalSales / transactionCount : 0
  };
}

function groupRevenueByCategory(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    const category = entry.source === 'service'
      ? 'Services'
      : entry.category || 'Uncategorized';
    const group = groups.get(category) || { _id: category, revenue: 0, percentage: 0 };
    group.revenue += entry.revenue;
    groups.set(category, group);
  });
  return [...groups.values()].sort((left, right) => right.revenue - left.revenue);
}

function groupRevenueContributors(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    const type = entry.source === 'service' ? 'Labor service' : entry.contributorType || 'Uncategorized';
    const name = entry.name || (entry.source === 'service' ? 'Service' : 'Product sales');
    const key = `${type}:${name}`;
    const group = groups.get(key) || { name, revenue: 0, contributorType: type };
    group.revenue += entry.revenue;
    groups.set(key, group);
  });
  return [...groups.values()].sort((left, right) => right.revenue - left.revenue);
}

function projectNextQuarter(quarterlyRows) {
  if (!quarterlyRows.length) return [];
  const rows = [...quarterlyRows].sort((left, right) => left._id.year - right._id.year
    || left._id.quarter - right._id.quarter);
  const growthRates = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previousQuarter = rows[index - 1]._id;
    const currentQuarter = rows[index]._id;
    const quarterDistance = (currentQuarter.year - previousQuarter.year) * 4
      + currentQuarter.quarter - previousQuarter.quarter;
    if (quarterDistance !== 1) continue;
    const previous = Number(rows[index - 1].revenue);
    const current = Number(rows[index].revenue);
    if (previous > 0 && Number.isFinite(current)) growthRates.push((current - previous) / previous);
  }
  const averageGrowth = growthRates.length
    ? growthRates.reduce((sum, growth) => sum + growth, 0) / growthRates.length
    : 0;
  const latest = rows[rows.length - 1];
  const nextQuarter = latest._id.quarter === 4
    ? { year: latest._id.year + 1, quarter: 1 }
    : { year: latest._id.year, quarter: latest._id.quarter + 1 };
  return [{
    _id: nextQuarter,
    revenue: Math.max(0, Math.round(Number(latest.revenue) * (1 + averageGrowth))),
    isProjection: true
  }];
}

function getRevenueRiskLevel(indicator, value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) {
    return 'Not enough data';
  }
  const numericValue = Number(value);
  if (indicator === 'qoqChange') {
    return numericValue >= REVENUE_RISK_THRESHOLDS.qoqChange.normalMin
      ? 'Normal'
      : numericValue >= REVENUE_RISK_THRESHOLDS.qoqChange.moderateMin ? 'Moderate' : 'High';
  }
  if (indicator === 'concentrationHhi') {
    return numericValue < REVENUE_RISK_THRESHOLDS.concentrationHhi.normalMaxExclusive
      ? 'Normal'
      : numericValue <= REVENUE_RISK_THRESHOLDS.concentrationHhi.moderateMaxInclusive ? 'Moderate' : 'High';
  }
  if (indicator === 'topContributorShare') {
    return numericValue < REVENUE_RISK_THRESHOLDS.topContributorShare.normalMaxExclusive
      ? 'Normal'
      : numericValue <= REVENUE_RISK_THRESHOLDS.topContributorShare.moderateMaxInclusive ? 'Moderate' : 'High';
  }
  if (indicator === 'forecastVsFourQuarterAverage') {
    return numericValue >= REVENUE_RISK_THRESHOLDS.forecastVsFourQuarterAverage.normalMin
      ? 'Normal'
      : numericValue >= REVENUE_RISK_THRESHOLDS.forecastVsFourQuarterAverage.moderateMin ? 'Moderate' : 'High';
  }
  throw new Error(`Unknown revenue risk indicator: ${indicator}`);
}

function calculateDashboardForecast(quarterlyRows, now = new Date()) {
  const sourceRows = Array.isArray(quarterlyRows) ? quarterlyRows : [];
  const parts = getManilaDateParts(now);
  const completedRows = getCompletedQuarterRows(sourceRows, now)
    .map((row) => ({
      year: Number(row._id.year),
      quarter: Number(row._id.quarter),
      revenue: Number(row.revenue || 0)
    }));
  if (completedRows.length < REVENUE_RISK_THRESHOLDS.minimumCompletedQuarters) return null;

  const growthRates = completedRows.slice(1).flatMap((row, index) => {
    const previous = completedRows[index];
    const quarterDistance = (row.year - previous.year) * 4 + row.quarter - previous.quarter;
    return quarterDistance === 1 && previous.revenue > 0
      ? [(row.revenue - previous.revenue) / previous.revenue]
      : [];
  });
  const averageGrowth = growthRates.length
    ? growthRates.reduce((sum, value) => sum + value, 0) / growthRates.length
    : 0;
  const variance = growthRates.length
    ? growthRates.reduce((sum, value) => sum + (value - averageGrowth) ** 2, 0) / growthRates.length
    : 0;
  const base = completedRows[completedRows.length - 1];
  const nextQuarter = base.quarter === 4
    ? { year: base.year + 1, quarter: 1 }
    : { year: base.year, quarter: base.quarter + 1 };
  const expected = Math.max(0, Math.round(base.revenue * (1 + averageGrowth)));
  const range = Math.sqrt(variance);
  const target = `${nextQuarter.year} Q${nextQuarter.quarter}`;
  const currentQuarter = parts.quarter;
  const quarterStartUtc = Date.UTC(parts.year, (currentQuarter - 1) * 3, 1) - (8 * 60 * 60 * 1000);
  const nextQuarterStartUtc = Date.UTC(parts.year, currentQuarter * 3, 1) - (8 * 60 * 60 * 1000);
  const percentElapsed = Math.min(100, Math.max(0, Math.floor(
    (new Date(now).getTime() - quarterStartUtc) / (nextQuarterStartUtc - quarterStartUtc) * 100
  )));
  const quarterToDateRevenue = sourceRows.find((row) =>
    Number(row?._id?.year) === parts.year && Number(row?._id?.quarter) === currentQuarter
  )?.revenue || 0;

  return {
    target,
    targetQuarter: nextQuarter,
    targetLabel: `Forecast for ${target}`,
    expected,
    low: Math.max(0, Math.round(expected * (1 - range))),
    high: Math.round(expected * (1 + range)),
    baseRevenue: base.revenue,
    growthRates,
    averageGrowthRate: averageGrowth,
    quarterToDate: {
      quarter: `${parts.year} Q${currentQuarter}`,
      revenue: Number(quarterToDateRevenue),
      percentElapsed
    }
  };
}

function getCompletedQuarterRows(quarterlyRows, now = new Date()) {
  const current = getManilaDateParts(now);
  return (Array.isArray(quarterlyRows) ? quarterlyRows : [])
    .filter((row) => Number(row?._id?.year) < current.year
      || (Number(row?._id?.year) === current.year && Number(row?._id?.quarter) < current.quarter))
    .sort((left, right) => Number(left._id.year) - Number(right._id.year)
      || Number(left._id.quarter) - Number(right._id.quarter));
}

function calculateRevenueRisk(entries, quarterlyRows, now = new Date()) {
  const allContributors = groupRevenueContributors(entries);
  const totalRevenue = allContributors.reduce((sum, item) => sum + item.revenue, 0);
  const uncategorizedRevenue = allContributors
    .filter((item) => String(item.contributorType).toLowerCase() === 'uncategorized')
    .reduce((sum, item) => sum + item.revenue, 0);
  const contributors = allContributors
    .filter((item) => String(item.contributorType).toLowerCase() !== 'uncategorized' && item.revenue > 0)
    .sort((left, right) => right.revenue - left.revenue);
  const categorizedRevenue = contributors.reduce((sum, item) => sum + item.revenue, 0);
  const rankedContributors = contributors.map((item) => ({
    ...item,
    share: categorizedRevenue ? Number((item.revenue / categorizedRevenue * 100).toFixed(2)) : 0
  }));
  const topContributor = rankedContributors[0] || null;
  const hhi = categorizedRevenue
    ? Number(rankedContributors.reduce((sum, item) => sum + ((item.share / 100) ** 2), 0).toFixed(4))
    : null;
  const uncategorizedShare = totalRevenue ? Number((uncategorizedRevenue / totalRevenue * 100).toFixed(2)) : 0;
  const completedQuarters = getCompletedQuarterRows(quarterlyRows, now);
  const forecast = calculateDashboardForecast(quarterlyRows, now);
  const enoughQuarterData = completedQuarters.length >= REVENUE_RISK_THRESHOLDS.minimumCompletedQuarters;
  const latestQuarter = completedQuarters.at(-1);
  const previousQuarter = completedQuarters.at(-2);
  const adjacentQuarters = latestQuarter && previousQuarter
    && (Number(latestQuarter._id.year) * 4 + Number(latestQuarter._id.quarter))
      - (Number(previousQuarter._id.year) * 4 + Number(previousQuarter._id.quarter)) === 1;
  const qoqChange = enoughQuarterData && adjacentQuarters
    ? percentChange(latestQuarter.revenue, previousQuarter.revenue)
    : null;
  const fourQuarterAverage = completedQuarters.length >= 4
    ? completedQuarters.slice(-4).reduce((sum, row) => sum + Number(row.revenue || 0), 0) / 4
    : null;
  const forecastVsAverage = forecast && fourQuarterAverage > 0
    ? (forecast.expected - fourQuarterAverage) / fourQuarterAverage * 100
    : null;
  const indicators = {
    qoqChange: {
      value: qoqChange,
      level: enoughQuarterData ? getRevenueRiskLevel('qoqChange', qoqChange) : 'Not enough data',
      reason: !enoughQuarterData
        ? `Fewer than ${REVENUE_RISK_THRESHOLDS.minimumCompletedQuarters} completed quarters are available.`
        : !adjacentQuarters
          ? 'QoQ is n/a because the latest completed quarters are not consecutive.'
          : qoqChange === null ? 'QoQ is n/a because the prior completed quarter has no positive revenue.' : null
    },
    concentrationHhi: {
      value: hhi,
      level: enoughQuarterData ? getRevenueRiskLevel('concentrationHhi', hhi) : 'Not enough data'
    },
    topContributorShare: {
      value: topContributor?.share ?? null,
      contributor: topContributor?.name || null,
      level: enoughQuarterData ? getRevenueRiskLevel('topContributorShare', topContributor?.share) : 'Not enough data'
    },
    forecastVsFourQuarterAverage: {
      value: forecastVsAverage,
      average: fourQuarterAverage,
      forecast: forecast?.expected ?? null,
      level: enoughQuarterData ? getRevenueRiskLevel('forecastVsFourQuarterAverage', forecastVsAverage) : 'Not enough data'
    }
  };
  const indicatorLabels = {
    qoqChange: 'quarter-over-quarter change',
    concentrationHhi: 'revenue concentration (HHI)',
    topContributorShare: 'top contributor share',
    forecastVsFourQuarterAverage: 'forecast versus the four-quarter average'
  };
  const riskOrder = ['Normal', 'Moderate', 'High'];
  const highest = Object.entries(indicators)
    .filter(([, indicator]) => riskOrder.includes(indicator.level))
    .sort((left, right) => riskOrder.indexOf(right[1].level) - riskOrder.indexOf(left[1].level))[0];
  const overallRisk = enoughQuarterData
    ? {
      level: highest?.[1].level || 'Not enough data',
      reason: highest ? indicatorLabels[highest[0]] : 'No risk indicators could be calculated'
    }
    : { level: 'Not enough data', reason: 'fewer than five completed quarters are available' };
  const byCategory = groupRevenueByCategory(entries);
  const riskByCategory = byCategory.filter((item) => String(item._id).toLowerCase() !== 'uncategorized');
  const riskCategoryRevenue = riskByCategory.reduce((sum, item) => sum + item.revenue, 0);
  const topCategory = riskByCategory[0] || null;

  return {
    totalRevenue,
    byCategory: byCategory.map((item) => ({
      ...item,
      percentage: totalRevenue ? item.revenue / totalRevenue * 100 : 0
    })),
    riskByCategory: riskByCategory.map((item) => ({
      ...item,
      percentage: riskCategoryRevenue ? item.revenue / riskCategoryRevenue * 100 : 0
    })),
    topCategory: topCategory?._id || null,
    concentration: topCategory && riskCategoryRevenue
      ? (topCategory.revenue / riskCategoryRevenue * 100).toFixed(2)
      : '0.00',
    uncategorized: { revenue: uncategorizedRevenue, share: uncategorizedShare },
    contributors: rankedContributors,
    indicators,
    overallRisk,
    completedQuarterCount: completedQuarters.length,
    officialForecast: forecast,
    thresholds: REVENUE_RISK_THRESHOLDS
  };
}

function parseManilaDateBound(value, endOfDay = false) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getRevenueEntries({ Order, Reservation, ServiceRequest, Product, startDate, endDate } = {}) {
  const from = parseManilaDateBound(startDate);
  const through = parseManilaDateBound(endDate, true);
  const pipelines = buildRevenuePipelines({ startDate: from, endDate: through });
  const [orders, reservations, services] = await Promise.all([
    Order.aggregate(pipelines.orders),
    Reservation.aggregate(pipelines.reservations),
    ServiceRequest.aggregate(pipelines.services)
  ]);
  const productIds = [...orders, ...reservations].flatMap((record) => (record.items || [])
    .map((item) => item.productId)
    .filter(Boolean));
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } }).select('_id category').lean()
    : [];
  const productCategories = Object.fromEntries(products.map((product) => [
    String(product._id),
    product.category
  ]));
  return normalizeRevenueSources({
    orders: orders.map((row) => ({ ...row, source: 'order' })),
    reservations: reservations.map((row) => ({ ...row, source: 'reservation' })),
    services: services.map((row) => ({ ...row, source: 'service' })),
    productCategories
  });
}

module.exports = {
  REVENUE_TIMEZONE,
  REVENUE_RISK_THRESHOLDS,
  buildRevenuePipelines,
  getManilaDateParts,
  normalizeRevenueSources,
  groupRevenueByPeriod,
  summarizeRevenue,
  groupRevenueByCategory,
  groupRevenueContributors,
  projectNextQuarter,
  getRevenueRiskLevel,
  calculateDashboardForecast,
  getCompletedQuarterRows,
  calculateRevenueRisk,
  parseManilaDateBound,
  getRevenueEntries
};
