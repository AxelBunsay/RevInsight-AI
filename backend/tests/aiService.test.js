import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  CARD_INSIGHT_KEYS,
  buildTemplateCardInsights,
  generateCardInsights,
  generateRevenueChartType,
  generateRevenueInsights,
  isValidCardInsights
} = require('../services/aiService');

function validInsights() {
  return Object.fromEntries(CARD_INSIGHT_KEYS.map((key) => [key, {
    summary: `${key} numbers are available.`,
    recommendation: `Review the ${key} figures before planning next quarter.`,
    ifFollowed: `Responding to the ${key} signal may support revenue stability.`,
    ifIgnored: `Ignoring the ${key} signal could leave the current issue unresolved.`
  }]));
}

function createFakeClient(replies) {
  const configurations = [];
  let call = 0;
  return {
    configurations,
    client: {
      getGenerativeModel(configuration) {
        configurations.push(configuration);
        const reply = replies[call];
        call += 1;
        return {
          generateContent: async () => ({
            response: { text: () => reply }
          })
        };
      }
    }
  };
}

describe('AI revenue insight generation', () => {
  it('returns validated JSON insights for every revenue card', async () => {
    const fake = createFakeClient([JSON.stringify(validInsights())]);

    const result = await generateCardInsights({ riskLevels: {} }, {
      client: fake.client,
      modelNames: ['primary-test']
    });

    expect(result.source).toBe('ai');
    expect(Object.keys(result.insights)).toEqual(CARD_INSIGHT_KEYS);
    expect(fake.configurations[0].generationConfig.responseMimeType).toBe('application/json');
  });

  it('tries the fallback model after invalid JSON and returns distinct, valid card-specific templates', async () => {
    const fake = createFakeClient(['not json', '{"trend":{}}']);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const analysisData = {
      riskLevels: {
        qoqChange: { value: -12.5, level: 'High' },
        concentrationHhi: { value: 0.34, level: 'Moderate' },
        topContributorShare: { value: 80, level: 'High' },
        forecastVsFourQuarterAverage: { value: -15, level: 'High' }
      },
      overallRisk: { level: 'High', reason: 'revenue concentration (HHI)' },
      revenueConcentration: {
        indicators: {},
        contributors: [{
          name: 'Long service contributor name used for truncation validation',
          contributorType: 'service',
          share: 45
        }]
      },
      officialForecast: {
        targetLabel: 'Forecast for 2026 Q4',
        expected: 100000,
        low: 80000,
        high: 120000
      }
    };

    const result = await generateCardInsights(analysisData, {
      client: fake.client,
      modelNames: ['primary-test', 'fallback-test']
    });

    expect(fake.configurations.map(({ model }) => model)).toEqual(['primary-test', 'fallback-test']);
    expect(result.source).toBe('template');
    expect(Object.keys(result.insights)).toEqual(CARD_INSIGHT_KEYS);
    expect(isValidCardInsights(result.insights)).toBe(true);
    for (const card of Object.values(result.insights)) {
      expect(Object.values(card)).toHaveLength(4);
      expect(Object.values(card).every((sentence) => typeof sentence === 'string' && sentence.length > 0)).toBe(true);
    }
    expect(new Set(CARD_INSIGHT_KEYS.map((key) => result.insights[key].recommendation)).size).toBe(CARD_INSIGHT_KEYS.length);
    expect(new Set(CARD_INSIGHT_KEYS.map((key) => result.insights[key].ifFollowed)).size).toBe(CARD_INSIGHT_KEYS.length);
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0][0]).toContain('fallback-test');
    expect(warning.mock.calls[0][0]).toContain('card insight schema');
    warning.mockRestore();
  });

  it('uses different fallback recommendations and outcomes for Normal, Moderate, and High risk levels', () => {
    const makeAnalysis = (riskLevel) => ({
      riskLevels: {
        qoqChange: { value: -12, level: riskLevel },
        concentrationHhi: { value: 0.3, level: riskLevel },
        topContributorShare: { value: 70, level: riskLevel },
        forecastVsFourQuarterAverage: { value: -10, level: riskLevel }
      },
      overallRisk: { level: riskLevel, reason: 'top contributor share' },
      revenueConcentration: {
        contributors: [{ name: 'Repair Service', contributorType: 'service', share: 35 }]
      },
      officialForecast: {
        targetLabel: 'Forecast for 2026 Q4',
        expected: 100000
      }
    });
    const tiers = ['Normal', 'Moderate', 'High'].map((riskLevel) => buildTemplateCardInsights(makeAnalysis(riskLevel)));

    expect(tiers.every(isValidCardInsights)).toBe(true);
    for (const key of CARD_INSIGHT_KEYS) {
      expect(new Set(tiers.map((insights) => insights[key].recommendation)).size).toBe(3);
      expect(new Set(tiers.map((insights) => insights[key].ifFollowed)).size).toBe(3);
      expect(new Set(tiers.map((insights) => insights[key].ifIgnored)).size).toBe(3);
    }
  });

  it('instructs question answers to use an unheaded summary, recommendation, and conditional outcomes', async () => {
    const fake = createFakeClient(['Current data is available.\n\n**Recommendation**\nReview the figures.\n\n**Possible outcome**\nIf you act: stability may improve.\nIf you ignore it: risk could persist.']);

    const answer = await generateRevenueInsights('Summarize revenue.', {}, {
      client: fake.client,
      modelNames: ['primary-test']
    });

    expect(fake.configurations[0].systemInstruction).toContain('opening paragraph of one to three sentences and no heading');
    expect(fake.configurations[0].systemInstruction).toContain('**Recommendation**');
    expect(fake.configurations[0].systemInstruction).toContain('**Possible outcome**');
    expect(fake.configurations[0].systemInstruction).toContain('"If you act:" and "If you ignore it:"');
    expect(answer).toContain('**Possible outcome**');
  });

  it('accepts only whitelisted chart types and maps none or invalid output to no chart', async () => {
    const trend = createFakeClient(['quarterly_trend']);
    const invalid = createFakeClient(['category_share with 100 values']);
    const none = createFakeClient(['none']);
    const options = { modelNames: ['primary-test'] };

    await expect(generateRevenueChartType('Show a trend.', { ...options, client: trend.client }))
      .resolves.toBe('quarterly_trend');
    await expect(generateRevenueChartType('Explain a risk.', { ...options, client: invalid.client }))
      .resolves.toBeNull();
    await expect(generateRevenueChartType('Explain a risk.', { ...options, client: none.client }))
      .resolves.toBeNull();
  });
});
