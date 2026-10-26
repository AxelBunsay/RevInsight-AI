import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { getControllerResult, getRecentMonthlyRevenue, askRevenueAI } = require('../controllers/adminControllers/aiController');

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
});
