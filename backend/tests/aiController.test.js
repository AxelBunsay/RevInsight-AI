import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const express = require('express');
const jwt = require('jsonwebtoken');
const supertest = require('supertest');
const {
  getControllerResult,
  getRecentMonthlyRevenue,
  askRevenueAI,
  clearRevenueCardInsightCache,
  formatRevenueAnswer,
  getRevenueCardInsights
} = require('../controllers/adminControllers/aiController');
const aiRoutes = require('../routes/adminRoutes/ai');
const {
  REVENUE_RISK_THRESHOLDS,
  calculateDashboardForecast
} = require('../utils/revenue');

afterEach(() => {
  clearRevenueCardInsightCache();
});

describe('revenue AI controller helpers', () => {
  it('rejects failed dashboard controller responses', async () => {
    const controller = async (_req, res) => res.status(500).json({
      success: false,
      message: 'Revenue data unavailable.'
    });

    await expect(getControllerResult(controller, {})).rejects.toThrow('Revenue data unavailable.');
  });

  it('includes exactly the latest 24 Manila calendar months and fills missing buckets', () => {
    const rows = [
      { _id: { year: 2024, month: 5 }, revenue: 5, count: 1 },
      { _id: { year: 2024, month: 6 }, revenue: 6, count: 2 },
      { _id: { year: 2026, month: 5 }, revenue: 50, count: 3 },
      { _id: { year: 2026, month: 6 }, revenue: 60, count: 4 }
    ];

    const result = getRecentMonthlyRevenue(rows, new Date('2026-04-30T17:00:00.000Z'));

    expect(result).toHaveLength(24);
    expect(result[0]).toMatchObject({ _id: { year: 2024, month: 6 }, revenue: 6, count: 2 });
    expect(result[1]).toMatchObject({ _id: { year: 2024, month: 7 }, revenue: 0, count: 0 });
    expect(result.at(-1)).toMatchObject({ _id: { year: 2026, month: 5 }, revenue: 50, count: 3 });
  });

  it('rejects questions longer than 500 characters with HTTP 400', async () => {
    let statusCode;
    let responseBody;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        responseBody = body;
        return body;
      }
    };

    await askRevenueAI({ body: { question: 'x'.repeat(501) } }, res);

    expect(statusCode).toBe(400);
    expect(responseBody).toMatchObject({
      success: false,
      message: 'Question must be 500 characters or fewer.'
    });
  });

  it('formats dollar-prefixed model amounts as Philippine pesos', () => {
    expect(formatRevenueAnswer('Revenue was $1,234 this month.')).toBe('Revenue was ₱1,234 this month.');
  });

  it('returns a peso-formatted answer from the revenue AI endpoint', async () => {
    let responseBody;
    const successController = async (_req, res) => res.json({ success: true, data: [] });
    const dashboardController = {
      getDashboardStats: successController,
      getQuarterlyData: successController,
      getRevenueRisk: successController,
      getRevenueConcentration: successController,
      getRevenueData: successController
    };
    const res = {
      json(body) {
        responseBody = body;
        return body;
      },
      status(code) {
        throw new Error(`Unexpected status ${code}`);
      }
    };

    await askRevenueAI({ body: { question: 'How much did we earn?' } }, res, {
      dashboardController,
      generateRevenueInsights: async () => 'Revenue reached $1,234.'
    });

    expect(responseBody).toMatchObject({ success: true, answer: 'Revenue reached ₱1,234.', chart: null });
  });

  it('builds selected chart labels and values from recorded revenue, not model data', async () => {
    let responseBody;
    const quarterly = [
      { _id: { year: 2025, quarter: 1 }, revenue: 50 },
      { _id: { year: 2025, quarter: 2 }, revenue: 60 },
      { _id: { year: 2025, quarter: 3 }, revenue: 70 },
      { _id: { year: 2025, quarter: 4 }, revenue: 80 },
      { _id: { year: 2026, quarter: 1 }, revenue: 100 },
      { _id: { year: 2026, quarter: 2 }, revenue: 9999 }
    ];
    const successController = async (_req, res) => res.json({ success: true, data: {} });
    const dashboardController = {
      getDashboardStats: successController,
      getQuarterlyData: async (_req, res) => res.json({ success: true, data: quarterly }),
      getRevenueRisk: successController,
      getRevenueConcentration: successController,
      getRevenueData: async (_req, res) => res.json({ success: true, data: [] }),
      getRevenueChartEntries: async (_req, res) => res.json({
        success: true,
        data: [
          { year: 2026, quarter: 1, source: 'order', category: 'Parts', contributorType: 'Parts', name: 'Brake pads', revenue: 75 },
          { year: 2026, quarter: 1, source: 'order', category: 'Gear', contributorType: 'Gear', name: 'Helmet', revenue: 25 },
          { year: 2026, quarter: 2, source: 'order', category: 'Future', contributorType: 'Future', name: 'Not completed', revenue: 9999 }
        ]
      })
    };
    const res = {
      json(body) {
        responseBody = body;
        return body;
      },
      status(code) {
        throw new Error(`Unexpected status ${code}`);
      }
    };

    await askRevenueAI({ body: { question: 'Show category share.' } }, res, {
      dashboardController,
      now: new Date('2026-04-15T00:00:00+08:00'),
      generateRevenueInsights: async () => 'Parts lead the completed-quarter mix.',
      generateRevenueChartType: async () => 'category_share'
    });

    expect(responseBody.chart).toEqual({
      type: 'category_share',
      title: 'Revenue share by category · 2026 Q1',
      labels: ['Parts', 'Gear'],
      datasets: [{ label: 'Revenue share', data: [75, 25] }]
    });
    expect(responseBody.answer).toBe('Parts lead the completed-quarter mix.');
  });

  it('returns no chart for an invalid or none chart selection', async () => {
    const successController = async (_req, res) => res.json({ success: true, data: [] });
    const dashboardController = {
      getDashboardStats: successController,
      getQuarterlyData: successController,
      getRevenueRisk: successController,
      getRevenueConcentration: successController,
      getRevenueData: successController,
      getRevenueChartEntries: successController
    };
    const callWithChartType = async (chartType) => {
      let responseBody;
      const res = {
        json(body) { responseBody = body; return body; },
        status(code) { throw new Error(`Unexpected status ${code}`); }
      };
      await askRevenueAI({ body: { question: 'What is the revenue outlook?' } }, res, {
        dashboardController,
        generateRevenueInsights: async () => 'Revenue answer.',
        generateRevenueChartType: async () => chartType
      });
      return responseBody;
    };

    await expect(callWithChartType('made_up')).resolves.toMatchObject({ answer: 'Revenue answer.', chart: null });
    await expect(callWithChartType(null)).resolves.toMatchObject({ answer: 'Revenue answer.', chart: null });
  });

  it('keeps the text answer when chart selection fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const successController = async (_req, res) => res.json({ success: true, data: [] });
    const dashboardController = {
      getDashboardStats: successController,
      getQuarterlyData: successController,
      getRevenueRisk: successController,
      getRevenueConcentration: successController,
      getRevenueData: successController,
      getRevenueChartEntries: successController
    };
    let responseBody;
    const res = {
      json(body) { responseBody = body; return body; },
      status(code) { throw new Error(`Unexpected status ${code}`); }
    };

    await askRevenueAI({ body: { question: 'Compare revenue.' } }, res, {
      dashboardController,
      generateRevenueInsights: async () => 'The text answer remains available.',
      generateRevenueChartType: async () => { throw new Error('Chart selection unavailable.'); }
    });

    expect(responseBody).toMatchObject({
      success: true,
      answer: 'The text answer remains available.',
      chart: null
    });
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it('includes the dashboard forecast, official risk levels, shared thresholds, and uncategorized share in the AI payload', async () => {
    let responseBody;
    let aiPayload;
    const now = new Date('2026-04-15T00:00:00+08:00');
    const quarterly = [
      { _id: { year: 2025, quarter: 1 }, revenue: 100 },
      { _id: { year: 2025, quarter: 2 }, revenue: 110 },
      { _id: { year: 2025, quarter: 3 }, revenue: 120 },
      { _id: { year: 2025, quarter: 4 }, revenue: 130 },
      { _id: { year: 2026, quarter: 1 }, revenue: 140 },
      { _id: { year: 2026, quarter: 2 }, revenue: 3 }
    ];
    const replies = {
      getDashboardStats: { totalRevenue: 600 },
      getQuarterlyData: quarterly,
      getRevenueRisk: {
        indicators: {
          qoqChange: { value: 7.69, level: 'Normal' },
          concentrationHhi: { value: 0.2, level: 'Moderate' },
          topContributorShare: { value: 45, contributor: 'Brake pads', level: 'Moderate' },
          forecastVsFourQuarterAverage: { value: 10, level: 'Normal' }
        },
        overallRisk: { level: 'Moderate', reason: 'revenue concentration (HHI)' },
        uncategorized: { revenue: 60, share: 10 }
      },
      getRevenueConcentration: { indicators: { hhi: 0.2 }, uncategorized: { revenue: 60, share: 10 } },
      getRevenueData: []
    };
    const controller = (name) => async (_req, res) => res.json({ success: true, data: replies[name] });
    const dashboardController = Object.fromEntries(
      Object.keys(replies).map((name) => [name, controller(name)])
    );
    const res = {
      json(body) {
        responseBody = body;
        return body;
      },
      status(code) {
        throw new Error(`Unexpected status ${code}`);
      }
    };

    await askRevenueAI({ body: { question: 'What is the next quarter outlook?' } }, res, {
      dashboardController,
      now,
      generateRevenueInsights: async (_question, payload) => {
        aiPayload = payload;
        return 'Forecast available.';
      }
    });

    expect(aiPayload.officialForecast).toEqual(calculateDashboardForecast(quarterly, now));
    expect(aiPayload.officialForecast).toMatchObject({
      target: '2026 Q2',
      targetLabel: 'Forecast for 2026 Q2',
      baseRevenue: 140,
      quarterToDate: { quarter: '2026 Q2', revenue: 3, percentElapsed: 15 }
    });
    expect(aiPayload.riskLevels).toMatchObject({
      qoqChange: { level: 'Normal' },
      concentrationHhi: { level: 'Moderate' }
    });
    expect(aiPayload.overallRisk).toMatchObject({ level: 'Moderate' });
    expect(aiPayload.thresholds).toEqual(REVENUE_RISK_THRESHOLDS);
    expect(aiPayload.uncategorizedShare).toEqual({ revenue: 60, share: 10 });
    expect(responseBody.success).toBe(true);
  });

  it('caches card insights by server-computed analysis data', async () => {
    let generationCount = 0;
    const successController = async (_req, res) => res.json({ success: true, data: {} });
    const dashboardController = {
      getDashboardStats: successController,
      getQuarterlyData: async (_req, res) => res.json({ success: true, data: [] }),
      getRevenueRisk: successController,
      getRevenueConcentration: successController,
      getRevenueData: async (_req, res) => res.json({ success: true, data: [] })
    };
    const dependencies = {
      dashboardController,
      generateCardInsights: async () => {
        generationCount += 1;
        const card = {
          summary: 'Revenue is stable.',
          recommendation: 'Review the next quarterly sales plan.',
          ifFollowed: 'Reviewing the plan may preserve stability.',
          ifIgnored: 'Ignoring it could leave emerging changes unaddressed.'
        };
        return {
          insights: Object.fromEntries(['trend', 'risk', 'concentration', 'service', 'forecast'].map((key) => [key, card])),
          source: 'ai'
        };
      },
      now: new Date('2026-11-04T00:00:00.000Z'),
      cache: new Map(),
      refreshes: new Map(),
      requests: new Map()
    };
    const call = async (query = {}) => {
      let result;
      const res = {
        json(body) {
          result = body;
          return body;
        },
        status(code) {
          this.statusCode = code;
          return this;
        }
      };
      await getRevenueCardInsights({ query, admin: { id: 'admin-1' } }, res, dependencies);
      return { result, statusCode: res.statusCode || 200 };
    };

    const first = await call();
    const second = await call();
    expect(first.result).toEqual(second.result);
    expect(first.result).toMatchObject({ source: 'ai', generatedAt: '2026-11-04T00:00:00.000Z' });
    expect(first.result.insights.trend).toEqual({
      summary: 'Revenue is stable.',
      recommendation: 'Review the next quarterly sales plan.',
      ifFollowed: 'Reviewing the plan may preserve stability.',
      ifIgnored: 'Ignoring it could leave emerging changes unaddressed.'
    });
    expect(generationCount).toBe(1);

    dependencies.now = new Date('2026-11-04T00:00:31.000Z');
    const refreshed = await call({ refresh: 'true' });
    const throttled = await call({ refresh: 'true' });
    expect(refreshed.statusCode).toBe(200);
    expect(throttled.statusCode).toBe(429);
    expect(generationCount).toBe(2);
  });

  it('protects the card-insights endpoint with admin authentication', async () => {
    const previousSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'test-secret-for-admin-card-insights';
    const app = express();
    app.use('/api/admin', aiRoutes);
    try {
      const client = supertest(app);
      expect((await client.post('/api/admin/ai/card-insights')).status).toBe(401);
      const customerToken = jwt.sign({ role: 'customer', id: 'customer-1' }, process.env.JWT_SECRET);
      expect((await client.post('/api/admin/ai/card-insights').set('Authorization', `Bearer ${customerToken}`)).status).toBe(403);
    } finally {
      if (previousSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousSecret;
    }
  });
});
