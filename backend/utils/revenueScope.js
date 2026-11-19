const { revenueCoverage } = require('./revenueCoverage');
const { summarizeSalesMix } = require('./historicalMerchandise');
const {
  groupRevenueByPeriod, calculateRevenueRisk,
  getRevenueRiskLevel, REVENUE_RISK_THRESHOLDS
} = require('./revenue');

function resolveRevenueScope(input = {}) {
  const mode = input.scope || 'allRecords';
  if (!['selectedQuarter', 'allRecords'].includes(mode)) {
    throw Object.assign(new Error('Choose Selected quarter or All records.'), { statusCode: 400 });
  }
  const key = input.selectedQuarter;
  if (key != null && (typeof key !== 'string' || !/^[1-9]\d{3}-Q[1-4]$/.test(key))) {
    throw Object.assign(new Error('Choose a valid revenue quarter (YYYY-Q1 to YYYY-Q4).'), { statusCode: 400 });
  }
  if (mode === 'selectedQuarter' && !key) {
    throw Object.assign(new Error('Selected quarter is required.'), { statusCode: 400 });
  }
  const year = key ? Number(key.slice(0, 4)) : null;
  const quarter = key ? Number(key.slice(-1)) : null;
  return {
    mode, key: mode === 'allRecords' ? 'allRecords' : key,
    label: mode === 'allRecords' ? 'All records' : 'Selected quarter · ' + key.replace('-', ' '),
    timezone: 'Asia/Manila',
    startDate: mode === 'allRecords' ? null : year + '-' + String((quarter - 1) * 3 + 1).padStart(2, '0') + '-01',
    endDateExclusive: mode === 'allRecords' ? null : (quarter === 4 ? year + 1 : year) + '-' + String(quarter === 4 ? 1 : quarter * 3 + 1).padStart(2, '0') + '-01'
  };
}

function buildScopedRevenue(allEntries, input = {}, now = new Date()) {
  const scope = resolveRevenueScope(input);
  const entries = scope.mode === 'allRecords' ? allEntries : allEntries.filter(row =>
    row.dateLabel >= scope.startDate && row.dateLabel < scope.endDateExclusive);
  const coverage = revenueCoverage(entries, scope, now);
  const quarters = groupRevenueByPeriod(allEntries, 'quarter');
  const risk = calculateRevenueRisk(entries, quarters, now);
  const { totalRevenue, contributors } = risk;
  const salesMix = summarizeSalesMix(entries, totalRevenue);
  const analyzedRevenue = contributors.reduce((sum, row) => sum + row.revenue, 0);
  const round = (number, digits) => number == null ? null : Number(number.toFixed(digits));
  const classified = amount => ({ amount, percentOfEligible: totalRevenue > 0 ? round(100 * amount / totalRevenue, 2) : null });
  const classification = {
    contributors: classified(analyzedRevenue),
    categories: classified(risk.riskByCategory.reduce((sum, row) => sum + row.revenue, 0))
  };
  const topOneShare = risk.indicators.topContributorShare.value;
  const topThreeRevenue = contributors.slice(0, 3).reduce((sum, row) => sum + row.revenue, 0);
  const topThreeShare = analyzedRevenue ? round(topThreeRevenue / analyzedRevenue * 100, 2) : null;
  const hhi = risk.indicators.concentrationHhi.value;
  const levels = ['Normal', 'Moderate', 'High'];
  const concentrationLevel = analyzedRevenue ? [
    getRevenueRiskLevel('concentrationHhi', hhi),
    getRevenueRiskLevel('topContributorShare', topOneShare)
  ].sort((a, b) => levels.indexOf(b) - levels.indexOf(a))[0] : 'Not enough data';
  let unavailableReason = null;
  if (!analyzedRevenue) {
    if (coverage.empty) unavailableReason = 'No eligible transactions were recorded in this scope.';
    else if (totalRevenue === 0) unavailableReason = 'Eligible transactions in this scope total zero revenue.';
    else unavailableReason = salesMix.productNotice || 'None of the eligible revenue can be attributed to a classified product or service.';
  }
  const concentration = {
    scope, coverage, totalRevenue, analyzedRevenue, classification, salesMix, unavailableReason, uncategorized: risk.uncategorized, contributors,
    indicators: { topOneShare, topThreeShare, hhi, concentrationLevel, thresholds: REVENUE_RISK_THRESHOLDS },
    dependentOnLimitedContributors: ['Moderate', 'High'].includes(concentrationLevel)
  };
  // History-based growth and forecasting remain explicitly separate from the
  // selected-scope concentration classification.
  risk.scope = scope;
  risk.coverage = coverage;
  for (const key of ['concentrationHhi', 'topContributorShare']) {
    const indicator = risk.indicators[key];
    indicator.level = analyzedRevenue ? getRevenueRiskLevel(key, indicator.value) : 'Not enough data';
    indicator.reason = unavailableReason;
  }
  risk.overallRisk = { level: concentrationLevel, reason: unavailableReason || 'concentration of classified contributor revenue in ' + scope.label };
  const records = new Map();
  for (const row of entries) {
    const key = row.source + ':' + row.recordId;
    const record = records.get(key) || {
      _id: key, sourceId: row.recordId, recordType: row.source === 'service' ? 'service' : 'item',
      completedAt: row.dateLabel + 'T00:00:00+08:00', itemNames: new Set(), types: new Set(), amount: 0, status: 'completed'
    };
    record.types.add(row.revenueType || record.recordType);
    record.itemNames.add(row.manualMerchandise && !row.productName && !row.productId ? 'Product breakdown unavailable' : row.name);
    record.amount += row.revenue;
    records.set(key, record);
  }
  const reportRecords = [...records.values()].map(({ itemNames, types, ...row }) => ({
    ...row, recordType: types.size === 1 ? [...types][0] : 'mixed', itemName: [...itemNames].join(', ')
  }));
  return { scope, coverage, concentration, risk, quarters, entries, reportRecords };
}

module.exports = { resolveRevenueScope, buildScopedRevenue };
