const REVENUE_TIMEZONE = 'Asia/Manila';
const ORDER_STATUSES = ['completed', 'Paid'];

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
      const fallbackCategory = (row.source === 'reservation'
        ? productCategory || item.category
        : item.category || productCategory) || 'Uncategorized';
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
  buildRevenuePipelines,
  getManilaDateParts,
  normalizeRevenueSources,
  groupRevenueByPeriod,
  summarizeRevenue,
  groupRevenueByCategory,
  groupRevenueContributors,
  projectNextQuarter,
  parseManilaDateBound,
  getRevenueEntries
};
