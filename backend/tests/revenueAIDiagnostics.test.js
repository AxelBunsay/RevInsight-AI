import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { generateRevenueInsights, generateCardInsights } = require('../services/aiService');
const { askRevenueAI, getRevenueCardInsights, gatherRevenueAnalysisData, selectedRevenueQuarter } = require('../controllers/adminControllers/aiController');
const { calculateRevenueRisk } = require('../utils/revenue');

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.data = data; return data; } });
const card = { summary: 'Recorded data is available.', recommendation: 'Review the sales mix.', ifFollowed: 'Revenue diversity may improve.', ifIgnored: 'Concentration could persist.' };
const insights = Object.fromEntries(['trend', 'risk', 'concentration', 'service', 'forecast'].map(k => [k, card]));
const entries = [[2026, 2, [4000, 3000, 2000, 1000]], [2026, 3, [6000, 2500, 1000, 500]]]
  .flatMap(([year, quarter, amounts]) => amounts.map((revenue, i) => ({ year, quarter, source: i === 3 ? 'service' : 'reservation', name: ['Pads', 'Battery', 'Cable', 'Tune up'][i], contributorType: i === 3 ? 'Labor service' : 'Parts', revenue })));
const ok = data => async (_req, res) => res.json({ success: true, data });
const dashboard = {
  getDashboardStats: ok({ totalRevenue: 20000 }),
  getQuarterlyData: ok([{ _id: { year: 2026, quarter: 2 }, revenue: 10000 }, { _id: { year: 2026, quarter: 3 }, revenue: 10000 }]),
  getRevenueRisk: ok({ overallRisk: { level: 'High' } }),
  getRevenueConcentration: ok({ totalRevenue: 20000, contributors: [] }),
  getRevenueData: ok([]), getRevenueChartEntries: ok(entries)
};

describe('revenue AI failures and recovery', () => {
  it('traces both 20-second aborts and returns a safe 504 without SDK URL/key leakage', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(0);
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const client = { getGenerativeModel: vi.fn((_config, options) => ({
      generateContent: async () => {
        vi.setSystemTime(Date.now() + options.timeout);
        throw new Error('Request aborted at https://provider.invalid?key=never-log-this-secret');
      }
    })) };
    const res = response();
    await askRevenueAI({ body: { question: 'Explain concentration.' } }, res, {
      dashboardController: dashboard,
      generateRevenueInsights: (q, data, context) => generateRevenueInsights(q, data, { ...context, client, modelNames: ['primary', 'fallback'] })
    });
    expect(res.statusCode).toBe(504);
    expect(res.data).toMatchObject({ code: 'AI_TIMEOUT', message: 'AI service timed out. Please try again.' });
    expect(res.data.requestId).toBeTruthy();
    expect(client.getGenerativeModel).toHaveBeenCalledTimes(2);
    const logs = log.mock.calls.map(([s]) => JSON.parse(s.slice('[revenueAI] '.length)));
    expect(logs).toHaveLength(2);
    expect(logs.map(x => x.elapsedMs)).toEqual([20000, 20000]);
    expect(logs.every(x => x.requestId === res.data.requestId && x.code === 'AI_TIMEOUT' && x.providerStatus === null)).toBe(true);
    expect(JSON.stringify([logs, res.data])).not.toContain('never-log-this-secret');
    expect(JSON.stringify([logs, res.data])).not.toContain('provider.invalid');
  });

  it('distinguishes provider quota from the local refresh cooldown', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = { getGenerativeModel: () => ({ generateContent: async () => { throw Object.assign(new Error('private provider detail'), { status: 429 }); } }) };
    await expect(generateRevenueInsights('Revenue?', {}, { client, modelNames: ['primary'] }))
      .rejects.toMatchObject({ code: 'AI_QUOTA_EXCEEDED', statusCode: 503 });
    const fallback = await generateCardInsights({}, { client, modelNames: ['primary'] });
    expect(fallback).toMatchObject({ source: 'template', availability: { code: 'AI_QUOTA_EXCEEDED' } });
    expect(JSON.stringify(fallback)).not.toContain('private provider detail');
  });

  it('does not cache a transient template; a subsequent request can recover and cache genuine insights', async () => {
    const generate = vi.fn().mockResolvedValueOnce({ insights, source: 'template', availability: { code: 'AI_TIMEOUT' } })
      .mockResolvedValue({ insights, source: 'ai' });
    const dependencies = { dashboardController: dashboard, generateCardInsights: generate, cache: new Map(), requests: new Map(), refreshes: new Map() };
    const call = async () => { const res = response(); await getRevenueCardInsights({ body: {}, query: {}, admin: { id: 'qa' } }, res, dependencies); return res.data; };
    expect((await call()).source).toBe('template');
    expect((await call()).source).toBe('ai');
    expect((await call()).source).toBe('ai');
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

describe('selected quarter and global concentration context', () => {
  it('keeps independently known Q2/Q3 proportions separate from global values in both AI paths', async () => {
    const q2 = await gatherRevenueAnalysisData({ body: { selectedQuarter: '2026-Q2' } }, dashboard, new Date());
    const q3 = await gatherRevenueAnalysisData({ body: { selectedQuarter: '2026-Q3' } }, dashboard, new Date());
    expect(q2.selectedQuarter).toMatchObject({ key: '2026-Q2', totalRevenue: 10000, topOneShare: 40, topThreeShare: 90, hhi: 0.3 });
    expect(q3.selectedQuarter).toMatchObject({ key: '2026-Q3', totalRevenue: 10000, topOneShare: 60, topThreeShare: 95, hhi: 0.435 });
    expect(q2.stats.totalRevenue).toBe(20000);
    expect(q3.stats.totalRevenue).toBe(20000);
    expect(q3.analysisScopes.concentration).toBe('all_recorded_revenue');
    expect(q3).not.toHaveProperty('chartEntries');
    const request = { body: { selectedQuarter: '2026-Q3', question: 'Explain the quarter and overall mix.' }, query: {}, admin: { id: 'qa' } };
    const ask = vi.fn().mockResolvedValue('The scopes differ.');
    await askRevenueAI(request, response(), { dashboardController: dashboard, generateRevenueInsights: ask, generateRevenueChartType: async () => null });
    expect(ask.mock.calls[0][1].selectedQuarter.topOneShare).toBe(60);
    expect(ask.mock.calls[0][1]).not.toHaveProperty('chartEntries');
    const generate = vi.fn().mockResolvedValue({ insights, source: 'ai' });
    const deps = { dashboardController: dashboard, generateCardInsights: generate, cache: new Map(), requests: new Map(), refreshes: new Map() };
    await getRevenueCardInsights(request, response(), deps);
    await getRevenueCardInsights({ ...request, body: { selectedQuarter: '2026-Q2' } }, response(), deps);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls.map(x => x[0].selectedQuarter.topOneShare)).toEqual([60, 40]);
  });

  it('rejects invalid quarter input before calling analytics or Gemini', async () => {
    expect(selectedRevenueQuarter('2026-Q3')).toEqual({ key: '2026-Q3', year: 2026, quarter: 3 });
    for (const selectedQuarter of ['2026-Q0', '2026-Q5', 'quarter', {}, []]) {
      const generate = vi.fn(), res = response();
      await askRevenueAI({ body: { question: 'Revenue?', selectedQuarter } }, res, { generateRevenueInsights: generate });
      expect(res.statusCode).toBe(400);
      expect(generate).not.toHaveBeenCalled();
    }
  });

  it('computes HHI from unrounded revenue fractions', () => {
    const rows = [1, 1, 1, 3].map((revenue, i) => ({ source: 'order', contributorType: 'Parts', name: 'Part ' + i, revenue }));
    const risk = calculateRevenueRisk(rows, [], new Date());
    expect(risk.indicators.concentrationHhi.value).toBe(0.3333);
  });
});
