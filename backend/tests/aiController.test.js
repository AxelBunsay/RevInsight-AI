import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  getControllerResult,
  getRecentMonthlyRevenue,
  askRevenueAI,
  formatRevenueAnswer
} = require('../controllers/adminControllers/aiController');

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

    expect(responseBody).toMatchObject({ success: true, answer: 'Revenue reached ₱1,234.' });
  });
});
