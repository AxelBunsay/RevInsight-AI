const { revenueCoverage } = require('./revenueCoverage');
const {
  groupRevenueContributors, groupRevenueByPeriod, calculateRevenueRisk,
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
  const totalRevenue = entries.reduce((sum, row) => sum + row.revenue, 0);
  const ranked = groupRevenueContributors(entries).filter(row => row.contributorType !== 'Uncategorized' && row.revenue > 0);
  const analyzedRevenue = ranked.reduce((sum, row) => sum + row.revenue, 0);
  const share = amount => analyzedRevenue ? amount / analyzedRevenue * 100 : null;
  const round = (number, digits) => number == null ? null : Number(number.toFixed(digits));
  const contributors = ranked.map(row => ({ ...row, share: round(share(row.revenue), 2) }));
  const topOneShare = round(share(ranked[0]?.revenue || 0), 2);
  const topThreeShare = round(share(ranked.slice(0, 3).reduce((sum, row) => sum + row.revenue, 0)), 2);
  const hhi = analyzedRevenue ? round(ranked.reduce((sum, row) => sum + (row.revenue / analyzedRevenue) ** 2, 0), 4) : null;
  const levels = ['Normal', 'Moderate', 'High'];
  const concentrationLevel = analyzedRevenue ? [
    getRevenueRiskLevel('concentrationHhi', hhi),
    getRevenueRiskLevel('topContributorShare', topOneShare)
  ].sort((a, b) => levels.indexOf(b) - levels.indexOf(a))[0] : 'Not enough data';
  const concentration = {
    scope, coverage, totalRevenue, analyzedRevenue, uncategorized: risk.uncategorized, contributors,
    indicators: { topOneShare, topThreeShare, hhi, concentrationLevel, thresholds: REVENUE_RISK_THRESHOLDS },
    dependentOnLimitedContributors: ['Moderate', 'High'].includes(concentrationLevel)
  };
  // History-based growth and forecasting remain explicitly separate from the
  // selected-scope concentration classification.
  risk.scope = scope;
  risk.coverage = coverage;
  risk.contributors = contributors;
  risk.indicators.concentrationHhi = { value: hhi, level: analyzedRevenue ? getRevenueRiskLevel('concentrationHhi', hhi) : 'Not enough data' };
  risk.indicators.topContributorShare = { value: topOneShare, level: analyzedRevenue ? getRevenueRiskLevel('topContributorShare', topOneShare) : 'Not enough data' };
  risk.overallRisk = { level: concentrationLevel, reason: 'concentration of recorded revenue in ' + scope.label };
  const records = new Map();
  for (const row of entries) {
    const key = row.source + ':' + row.recordId;
    const record = records.get(key) || {
      _id: key, sourceId: row.recordId, recordType: row.source === 'service' ? 'service' : 'item',
      completedAt: row.dateLabel + 'T00:00:00+08:00', itemNames: new Set(), amount: 0, status: 'completed'
    };
    record.itemNames.add(row.name);record.amount += row.revenue;records.set(key, record);
  }
  const reportRecords = [...records.values()].map(({ itemNames, ...row }) => ({ ...row, itemName: [...itemNames].join(', ') }));
  return { scope, coverage, concentration, risk, quarters, entries, reportRecords };
}

module.exports = { resolveRevenueScope, buildScopedRevenue };
