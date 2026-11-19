const BusinessRecord = require('../models/businessRecord');

const firstDate = '2022-01-01';
const endExclusive = '2026-04-01';
const inManualSalesPeriod = date => date >= firstDate && date < endExclusive;

// The real_orders exports and their real_businessrecords companions share
// order._id = businessRecord.sourceId. The sample imports use different notes.
async function confirmedManualOrders(orders) {
  const candidates = orders.filter(row => row.isSampleData === false && Number.isInteger(row.orNumber)
    && inManualSalesPeriod(row.dateLabel));
  if (!candidates.length) return new Set();
  const ordersById = new Map(candidates.map(row => [String(row._id), row]));
  const rows = await BusinessRecord.collection.find({ sourceId: { $in: candidates.map(row => row._id) } },
    { projection: { sourceId: 1, recordType: 1, laborFee: 1, isSampleData: 1, notes: 1 } }).toArray();
  const confirmed = new Set();
  const seen = new Set();
  for (const row of rows) {
    const id = String(row.sourceId);
    const order = ordersById.get(id);
    // Some imported daily totals reference several receipts separated by "-" or "/".
    // Only the first number was stored as the order's orNumber.
    const marker = /^HISTORICAL RECORD (\d{4}) - ORD (\d+)(?:\s*[-/]\s*\d+)*$/.exec(row.notes);
    // A second linked record can describe another component of the sale.
    if (!seen.has(id) && marker && marker[1] === order.dateLabel.slice(0, 4)
      && Number(marker[2]) === order.orNumber && row.isSampleData === false
      && row.recordType === 'product' && row.laborFee === 0) confirmed.add(id);
    else confirmed.delete(id);
    seen.add(id);
  }
  return confirmed;
}

const genericNames = new Set(['item sales', 'unknown', 'uncategorized', 'daily sales (historical record)',
  'product sales', 'reserved products']);
function productName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  return name && !genericNames.has(name.toLowerCase()) ? name : null;
}

function summarizeSalesMix(entries, totalRevenue) {
  let itemSales = 0, serviceRevenue = 0, manualItemSales = 0, unclassifiedRevenue = 0, mixedRevenue = 0;
  let hasManualSales = false, hasOtherRecords = false, manualKnownProductRevenue = 0;
  const products = new Map();
  const idsByName = new Map();
  for (const row of entries) {
    if (!row.productName || !row.productId) continue;
    const key = row.productName.toLowerCase();
    const ids = idsByName.get(key) || new Set();
    ids.add(row.productId);
    idsByName.set(key, ids);
  }
  for (const row of entries) {
    if (row.revenueType === 'service') serviceRevenue += row.revenue;
    else if (row.revenueType === 'item') itemSales += row.revenue;
    else if (row.revenueType === 'mixed') mixedRevenue += row.revenue;
    else unclassifiedRevenue += row.revenue;
    if (row.manualMerchandise) {
      hasManualSales = true;
      manualItemSales += row.revenue;
    } else {
      hasOtherRecords = true;
    }
    if (row.revenueType !== 'item' || !row.productName && !row.productId || row.revenue <= 0) continue;
    const nameKey = row.productName?.toLowerCase();
    const ids = idsByName.get(nameKey);
    if (!row.productId && ids?.size > 1) continue;
    const id = row.productId || (ids?.size === 1 && [...ids][0]);
    const key = id ? 'id:' + id : 'name:' + nameKey;
    const product = products.get(key) || { name: row.productName || 'Product ' + id, revenue: 0 };
    product.revenue += row.revenue;
    if (row.manualMerchandise) manualKnownProductRevenue += row.revenue;
    products.set(key, product);
  }
  const ranked = [...products.values()].sort((a, b) => b.revenue - a.revenue);
  const knownProductRevenue = ranked.reduce((sum, row) => sum + row.revenue, 0);
  const share = value => knownProductRevenue ? Number((100 * value / knownProductRevenue).toFixed(2)) : null;
  let serviceNotice = null;
  if (hasManualSales) serviceNotice = !hasOtherRecords
    ? 'Services were not tracked during this period.'
    : 'Services were not tracked in the historical manual sales records. Service figures cover separately recorded services.';
  return {
    itemSales, serviceRevenue, mixedRevenue, unclassifiedRevenue, manualItemSales, knownProductRevenue,
    manualWithoutProductBreakdown: manualItemSales - manualKnownProductRevenue,
    percentOfEligible: totalRevenue > 0 ? Number((100 * knownProductRevenue / totalRevenue).toFixed(2)) : null,
    products: ranked.map(row => ({ ...row, share: share(row.revenue) })),
    topOneShare: share(ranked[0]?.revenue || 0),
    topThreeShare: share(ranked.slice(0, 3).reduce((sum, row) => sum + row.revenue, 0)),
    hhi: knownProductRevenue ? Number(ranked.reduce((sum, row) => sum + (row.revenue / knownProductRevenue) ** 2, 0).toFixed(4)) : null,
    productNotice: itemSales > 0 && !knownProductRevenue ? 'Product breakdown unavailable' : null,
    serviceNotice
  };
}

module.exports = { confirmedManualOrders, inManualSalesPeriod, productName, summarizeSalesMix };
