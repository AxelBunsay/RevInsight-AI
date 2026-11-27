const { resolveRevenueScope } = require('../../utils/revenueScope');
const { summarizeSalesMix } = require('../../utils/historicalMerchandise');
const { createHash } = require('crypto');
const {
  CARD_INSIGHT_FIELDS,
  CARD_INSIGHT_KEYS,
  generateCardInsights,
  generateRevenueChartType,
  generateRevenueInsights,
  isValidCardInsights
} = require('../../services/aiService');
const dashboardController = require('./dashboardController');
const { newRevenueAIRequestId } = require('../../utils/revenueAIError');
const {
  REVENUE_TIMEZONE,
  REVENUE_RISK_THRESHOLDS,
  calculateDashboardForecast,
  buildRevenueChartData,
  groupRevenueContributors
} = require('../../utils/revenue');

const CARD_INSIGHT_CACHE_TTL_MS = 15 * 60 * 1000;
const CARD_INSIGHT_REFRESH_COOLDOWN_MS = 30 * 1000;
const cardInsightCache = new Map();
const cardInsightRefreshes = new Map();
const cardInsightRequests = new Map();

function formatRevenueAnswer(answer) {
  return String(answer).replace(/\$(?=\d)/g, '₱');
}

function getRecentMonthlyRevenue(rows, now = new Date(), monthCount = 24) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REVENUE_TIMEZONE,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const latestIndex = year * 12 + month - 1;
  const firstIndex = latestIndex - monthCount + 1;
  const rowsByMonth = new Map((Array.isArray(rows) ? rows : []).flatMap((row) => {
    const rowYear = Number(row?._id?.year);
    const rowMonth = Number(row?._id?.month);
    const index = rowYear * 12 + rowMonth - 1;
    if (!Number.isInteger(rowYear) || !Number.isInteger(rowMonth)
      || rowMonth < 1 || rowMonth > 12
      || index < firstIndex || index > latestIndex) return [];
    return [[index, row]];
  }));
  return Array.from({ length: monthCount }, (_, offset) => {
    const index = firstIndex + offset;
    const currentYear = Math.floor(index / 12);
    const currentMonth = index % 12 + 1;
    return rowsByMonth.get(index) || {
      _id: { year: currentYear, month: currentMonth },
      revenue: 0,
      count: 0
    };
  });
}

async function getControllerResult(controller, req) {
  let result;
  let statusCode = 200;
  const response = {
    json: (data) => {
      result = data;
      return data;
    },
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => {
          result = { ...data, status: code };
          return result;
        }
      };
    }
  };

  await controller(req, response);
  if (statusCode >= 400 || result?.success !== true) {
    throw new Error(result?.message || `Dashboard data request failed with status ${statusCode}.`);
  }
  if (!Array.isArray(result.data) && (result.data === undefined || result.data === null)) {
    throw new Error('Dashboard controller returned an invalid response.');
  }
  return result;
}


function selectedRevenueQuarter(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[1-9]\d{3}-Q[1-4]$/.test(value)) {
    throw Object.assign(new Error('Choose a valid revenue quarter (YYYY-Q1 to YYYY-Q4).'), { statusCode: 400 });
  }
  return { key: value, year: Number(value.slice(0, 4)), quarter: Number(value.slice(-1)) };
}

function quarterRevenueContext(entries, period) {
  if (!period) return null;
  const rows = entries.filter(row => row.year === period.year && row.quarter === period.quarter);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const contributors = groupRevenueContributors(rows).filter(row => row.contributorType !== 'Uncategorized' && row.revenue > 0);
  const analyzedRevenue = contributors.reduce((sum, row) => sum + row.revenue, 0);
  const fraction = value => analyzedRevenue ? value / analyzedRevenue : 0;
  return {
    ...period, totalRevenue, analyzedRevenue, salesMix: summarizeSalesMix(rows, totalRevenue),
    contributors: contributors.map(row => ({ ...row, share: Number((fraction(row.revenue) * 100).toFixed(2)) })),
    topOneShare: analyzedRevenue ? Number((fraction(contributors[0]?.revenue || 0) * 100).toFixed(2)) : null,
    topThreeShare: analyzedRevenue ? Number((fraction(contributors.slice(0, 3).reduce((sum, row) => sum + row.revenue, 0)) * 100).toFixed(2)) : null,
    hhi: analyzedRevenue ? Number(contributors.reduce((sum, row) => sum + fraction(row.revenue) ** 2, 0).toFixed(4)) : null
  };
}

async function gatherRevenueAnalysisData(req, dashboard, now, { includeChartEntries = false } = {}) {
  const period = selectedRevenueQuarter(req.body?.selectedQuarter);
  if (req.body?.scope) resolveRevenueScope(req.body);
  const mockReq = { ...req, query: {} };
  const [statsRes, quarterlyRes, riskRes, concentrationRes, monthlyRes, chartEntriesRes] = await Promise.all([
    getControllerResult(dashboard.getDashboardStats, mockReq),
    getControllerResult(dashboard.getQuarterlyData, mockReq),
    getControllerResult(dashboard.getRevenueRisk, mockReq),
    getControllerResult(dashboard.getRevenueConcentration, mockReq),
    getControllerResult(dashboard.getRevenueData, mockReq),
    (includeChartEntries || period) && dashboard.getRevenueChartEntries
      ? getControllerResult(dashboard.getRevenueChartEntries, mockReq)
      : Promise.resolve({ data: [] })
  ]);

  if (req.body?.scope) {
    const scope = resolveRevenueScope(req.body);
    const scoped = (await getControllerResult(dashboard.getScopedRevenue, { ...req, query: req.body })).data;
    return {
      stats: { totalRevenue: scoped.concentration.totalRevenue, totalTransactions: scoped.coverage.includedTransactions },
      coverage: scoped.coverage,
      analysisScopes: { concentration: scope.label, overallRisk: scope.label, trend: 'All recorded completed quarters', forecast: 'All recorded completed quarters', selectedQuarter: period?.key || null },
      selectedQuarter: scope.mode === 'selectedQuarter'
        ? { ...period, ...scoped.concentration, ...scoped.concentration.indicators }
        : quarterRevenueContext(chartEntriesRes.data, period),
      quarterly: quarterlyRes.data,
      ...(includeChartEntries ? { chartEntries: scoped.entries } : {}),
      revenueRisk: scoped.risk, revenueConcentration: scoped.concentration,
      monthly: getRecentMonthlyRevenue(monthlyRes.data, now),
      officialForecast: riskRes.data.officialForecast || calculateDashboardForecast(quarterlyRes.data, now),
      riskLevels: scoped.risk.indicators, overallRisk: scoped.risk.overallRisk,
      thresholds: REVENUE_RISK_THRESHOLDS, uncategorizedShare: scoped.concentration.uncategorized
    };
  }
  const { totalRevenue, totalTransactions, collected, outstanding } = statsRes.data;
  return {
    // Keep volatile timestamps and unrelated account/inventory counts out of the
    // AI payload so identical revenue data has a stable 15-minute cache key.
    stats: { totalRevenue, totalTransactions, collected, outstanding },
    analysisScopes: { concentration: 'all_recorded_revenue', overallRisk: 'all_recorded_revenue_and_latest_completed_trend', selectedQuarter: period?.key || null },
    selectedQuarter: quarterRevenueContext(chartEntriesRes.data, period),
    quarterly: quarterlyRes.data,
    ...(includeChartEntries ? { chartEntries: chartEntriesRes.data } : {}),
    revenueRisk: riskRes.data,
    revenueConcentration: concentrationRes.data,
    monthly: getRecentMonthlyRevenue(monthlyRes.data, now),
    officialForecast: riskRes.data.officialForecast || calculateDashboardForecast(quarterlyRes.data, now),
    riskLevels: riskRes.data.indicators || {},
    overallRisk: riskRes.data.overallRisk || { level: 'Not enough data', reason: 'risk data is unavailable' },
    thresholds: REVENUE_RISK_THRESHOLDS,
    uncategorizedShare: riskRes.data.uncategorized || concentrationRes.data.uncategorized || { revenue: 0, share: 0 }
  };
}

function hashAnalysisData(analysisData) {
  return createHash('sha256').update(JSON.stringify(analysisData)).digest('hex');
}

function scopedFacts(data, question) {
  const { scope, contributors, indicators, totalRevenue, coverage } = data.revenueConcentration;
  const money = value => '₱' + value.toLocaleString('en-PH', { maximumFractionDigits: 2 });
  const top = contributors[0];
  const facts = [`${scope.label}: ${money(totalRevenue)} across ${coverage.includedTransactions} eligible transactions.`];
  if (top) facts.push(`${top.name} led with ${money(top.revenue)} (${indicators.topOneShare}% of classified contributor revenue). Top three: ${indicators.topThreeShare}%. HHI: ${indicators.hhi}. Concentration risk: ${indicators.concentrationLevel}.`);
  else facts.push(data.revenueConcentration.unavailableReason);
  facts.push(coverage.completeness === 'reviewed' ? 'The closed quarter was reviewed.' : 'Coverage is unverified.');
  const change = data.riskLevels?.qoqChange?.value;
  if (/chang|trend|compar/i.test(question) && Number.isFinite(change)) {
    facts.push(`Latest completed-quarter change (all-records history): ${change}%.`);
  }
  const forecast = data.officialForecast;
  if (/forecast|likely next|predict/i.test(question)) {
    facts.push(forecast ? `${forecast.targetLabel} (all-records history): ${money(forecast.expected)}, likely range ${money(forecast.low)}–${money(forecast.high)}.` : 'An official forecast is unavailable.');
    if (forecast?.quarterToDate) facts.push(`${forecast.quarterToDate.quarter} to date: ${money(forecast.quarterToDate.revenue)} at ${forecast.quarterToDate.percentElapsed}% elapsed.`);
  }
  return facts.filter(Boolean).join(' ');
}

async function askRevenueAI(req, res, dependencies = {}) {
  const revenueInsights = dependencies.generateRevenueInsights || generateRevenueInsights;
  const dashboard = dependencies.dashboardController || dashboardController;
  const now = dependencies.now || new Date();
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question) {
    return res.status(400).json({ success: false, message: 'Question is required' });
  }
  if (question.length > 500) {
    return res.status(400).json({ success: false, message: 'Question must be 500 characters or fewer.' });
  }

  const requestId = newRevenueAIRequestId();
  try {
    const revenueData = await gatherRevenueAnalysisData(req, dashboard, now, { includeChartEntries: true });
    const { chartEntries, ...aiRevenueData } = revenueData;
    const facts = req.body?.scope ? scopedFacts(aiRevenueData, question) : '';
    let answer, availability;
    let source = 'ai';
    try {
      const generated = await revenueInsights(question, aiRevenueData, { requestId });
      answer = formatRevenueAnswer(generated);
      if (facts && /[\d₱$%]/u.test(answer)) {
        // The verified statement can replace a model's numeric opening while
        // retaining its distinct, qualitative recommendation and outcomes.
        const advice = answer.match(/\*\*Recommendation\b[\s\S]+/i)?.[0];
        if (advice && /If you act:/i.test(advice) && /If you ignore it:/i.test(advice)) answer = advice;
      }
      // The dashboard supplies the figures. Never publish a second, unbound
      // numerical claim from model prose alongside that authoritative snapshot.
      if (facts && (!answer.trim() || /[\d₱$%]/u.test(answer))) {
        availability = { code: 'UNVERIFIED_MODEL_FIGURES' };
      }
    } catch (error) {
      if (!facts || !error.revenueAI) throw error;
      availability = { code: error.code, message: error.message };
    }
    if (availability) {
      source = 'template';
      answer = '**Recommendation**\nReview contributor dependence and verify transaction coverage before changing purchasing plans.\n\n**Possible outcome**\nIf you act: Better coverage may improve planning.\nIf you ignore it: Gaps could obscure changes in demand.';
    }
    if (facts) answer = facts + '\n\n' + answer;
    if (!answer.trim()) throw new Error('Revenue AI returned an empty answer.');
    let chart = null;
    let chartType = null;
    try {
      const selectChartType = dependencies.generateRevenueChartType || generateRevenueChartType;
      chartType = await selectChartType(question);
    } catch (selectionError) {
      let detail = String(selectionError?.message || selectionError);
      if (process.env.GEMINI_API_KEY) {
        detail = detail.split(process.env.GEMINI_API_KEY).join('[redacted]');
      }
      console.warn(`[askRevenueAI] Chart selection failed; returning the text answer without a chart: ${detail}`);
    }
    if (chartType) {
      try {
        const { scope, salesMix } = revenueData.revenueConcentration;
        chart = buildRevenueChartData(chartType, chartEntries, revenueData.quarterly, now, scope, salesMix);
      } catch (chartError) {
        console.error('[askRevenueAI] chart data error', chartError);
      }
    }

    res.json({
      success: true,
      question,
      answer,
      source,
      cached: false,
      ...(availability ? { availability } : {}),
      chart,
      timestamp: now.toISOString()
    });
  } catch (error) {
    if (error.statusCode === 400) return res.status(400).json({ success: false, message: error.message });
    if (error.revenueAI) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code, requestId });
    console.error('[askRevenueAI] request failed', { requestId, code: 'INTERNAL_ERROR' });
    res.status(500).json({ success: false, message: 'Failed to generate AI insights', requestId });
  }
}

async function getRevenueCardInsights(req, res, dependencies = {}) {
  const dashboard = dependencies.dashboardController || dashboardController;
  const insightGenerator = dependencies.generateCardInsights || generateCardInsights;
  const now = dependencies.now || new Date();
  const cache = dependencies.cache || cardInsightCache;
  const refreshes = dependencies.refreshes || cardInsightRefreshes;
  const requests = dependencies.requests || cardInsightRequests;
  try { selectedRevenueQuarter(req.body?.selectedQuarter); } catch (error) {
    return res.status(400).json({ message: error.message });
  }
  const requestId = newRevenueAIRequestId();
  const refresh = req.query?.refresh === 'true' || req.query?.refresh === '1';
  const adminId = String(req.admin?.id || req.ip || 'admin');

  if (refresh) {
    const lastRefreshAt = refreshes.get(adminId) || 0;
    const elapsed = now.getTime() - lastRefreshAt;
    if (elapsed < CARD_INSIGHT_REFRESH_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((CARD_INSIGHT_REFRESH_COOLDOWN_MS - elapsed) / 1000);
      return res.status(429).json({
        message: 'Please wait before refreshing revenue insights again.',
        retryAfterSeconds
      });
    }
    refreshes.set(adminId, now.getTime());
  }

  try {
    const analysisData = await gatherRevenueAnalysisData(req, dashboard, now);
    const cacheKey = hashAnalysisData(analysisData);
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now.getTime()) cache.delete(key);
    }
    const cached = cache.get(cacheKey);
    if (!refresh && cached && cached.expiresAt > now.getTime()) {
      return res.json({ ...cached.result, cached: true });
    }

    let generation = !refresh ? requests.get(cacheKey) : null;
    if (!generation) {
      generation = Promise.resolve(insightGenerator(analysisData, { requestId })).then((generated) => {
        if (!isValidCardInsights(generated?.insights)) {
          throw new Error('Card insight generator returned an invalid response schema.');
        }
        const insights = Object.fromEntries(CARD_INSIGHT_KEYS.map((key) => [
          key,
          Object.fromEntries(CARD_INSIGHT_FIELDS.map((field) => [field, generated.insights[key][field]]))
        ]));
        return {
          insights,
          source: generated.source || 'unknown',
          cached: false,
          generatedAt: now.toISOString(),
          ...(generated.availability ? { availability: generated.availability } : {}),
          requestId
        };
      });
      requests.set(cacheKey, generation);
    }

    try {
      const result = await generation;
      if (result.source === 'ai') cache.set(cacheKey, { result, expiresAt: now.getTime() + CARD_INSIGHT_CACHE_TTL_MS });
      return res.json(result);
    } finally {
      if (requests.get(cacheKey) === generation) requests.delete(cacheKey);
    }
  } catch (error) {
    console.error('[getRevenueCardInsights] error', error);
    return res.status(500).json({ message: 'Failed to generate revenue card insights.' });
  }
}

function clearRevenueCardInsightCache() {
  cardInsightCache.clear();
  cardInsightRefreshes.clear();
  cardInsightRequests.clear();
}

module.exports = {
  askRevenueAI,
  clearRevenueCardInsightCache,
  formatRevenueAnswer,
  getControllerResult,
  getRecentMonthlyRevenue,
  getRevenueCardInsights,
  gatherRevenueAnalysisData,
  selectedRevenueQuarter,
  quarterRevenueContext,
  hashAnalysisData
};
