const { createHash } = require('crypto');
const { generateCardInsights, generateRevenueInsights } = require('../../services/aiService');
const dashboardController = require('./dashboardController');
const {
  REVENUE_TIMEZONE,
  REVENUE_RISK_THRESHOLDS,
  calculateDashboardForecast
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

async function gatherRevenueAnalysisData(req, dashboard, now) {
  const mockReq = { ...req, query: {} };
  const [statsRes, quarterlyRes, riskRes, concentrationRes, monthlyRes] = await Promise.all([
    getControllerResult(dashboard.getDashboardStats, mockReq),
    getControllerResult(dashboard.getQuarterlyData, mockReq),
    getControllerResult(dashboard.getRevenueRisk, mockReq),
    getControllerResult(dashboard.getRevenueConcentration, mockReq),
    getControllerResult(dashboard.getRevenueData, mockReq)
  ]);

  return {
    stats: statsRes.data,
    quarterly: quarterlyRes.data,
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

  try {
    const revenueData = await gatherRevenueAnalysisData(req, dashboard, now);

    const answer = formatRevenueAnswer(await revenueInsights(question, revenueData));

    res.json({
      success: true,
      question,
      answer,
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error('[askRevenueAI] error', error);
    res.status(500).json({ success: false, message: 'Failed to generate AI insights' });
  }
}

async function getRevenueCardInsights(req, res, dependencies = {}) {
  const dashboard = dependencies.dashboardController || dashboardController;
  const insightGenerator = dependencies.generateCardInsights || generateCardInsights;
  const now = dependencies.now || new Date();
  const cache = dependencies.cache || cardInsightCache;
  const refreshes = dependencies.refreshes || cardInsightRefreshes;
  const requests = dependencies.requests || cardInsightRequests;
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
      return res.json(cached.result);
    }

    let generation = !refresh ? requests.get(cacheKey) : null;
    if (!generation) {
      generation = Promise.resolve(insightGenerator(analysisData)).then((generated) => ({
        insights: generated.insights,
        source: generated.source,
        generatedAt: now.toISOString()
      }));
      requests.set(cacheKey, generation);
    }

    try {
      const result = await generation;
      cache.set(cacheKey, { result, expiresAt: now.getTime() + CARD_INSIGHT_CACHE_TTL_MS });
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
  hashAnalysisData
};