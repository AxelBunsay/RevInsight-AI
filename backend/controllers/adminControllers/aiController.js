const { generateRevenueInsights } = require('../../services/aiService');
const dashboardController = require('./dashboardController');
const {
  REVENUE_TIMEZONE,
  REVENUE_RISK_THRESHOLDS,
  calculateDashboardForecast
} = require('../../utils/revenue');

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
    const mockReq = { ...req, query: {} };
    const [statsRes, quarterlyRes, riskRes, concentrationRes, monthlyRes] = await Promise.all([
      getControllerResult(dashboard.getDashboardStats, mockReq),
      getControllerResult(dashboard.getQuarterlyData, mockReq),
      getControllerResult(dashboard.getRevenueRisk, mockReq),
      getControllerResult(dashboard.getRevenueConcentration, mockReq),
      getControllerResult(dashboard.getRevenueData, mockReq)
    ]);

    const revenueData = {
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

module.exports = { askRevenueAI, formatRevenueAnswer, getControllerResult, getRecentMonthlyRevenue };