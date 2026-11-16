import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '../../services/api';
import { adminApi, mapRevenueCardInsights } from './adminApi';

vi.mock('../../services/api', () => ({ request: vi.fn() }));
afterEach(() => vi.clearAllMocks());

describe('revenue AI selected-quarter requests', () => {
  it('passes the chosen quarter to Ask AI without changing the question', async () => {
    request.mockResolvedValue({ answer: 'Scoped answer.' });
    await adminApi.askRevenueAI('Explain the mix.', '2026-Q3');
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('/api/admin/revenue/ask-ai');
    expect(JSON.parse(options.body)).toEqual({ question: 'Explain the mix.', selectedQuarter: '2026-Q3' });
  });

  it('preserves quarter context in fresh card requests', async () => {
    request.mockResolvedValue({ source: 'ai', insights: {} });
    await adminApi.getRevenueCardInsights(true, '2026-Q2');
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('/api/admin/ai/card-insights?refresh=true');
    expect(JSON.parse(options.body)).toEqual({ selectedQuarter: '2026-Q2' });
  });

  it('retains the safe fallback reason for the UI to distinguish timeouts from genuine AI output', () => {
    const availability = { code: 'AI_TIMEOUT', message: 'AI service timed out. Please try again.' };
    expect(mapRevenueCardInsights({ source: 'template', availability, insights: {} })).toMatchObject({ source: 'template', availability });
  });
});
