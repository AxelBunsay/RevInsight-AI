import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  CARD_INSIGHT_KEYS,
  generateCardInsights,
  generateRevenueInsights,
  isValidCardInsights
} = require('../services/aiService');

function validInsights() {
  return Object.fromEntries(CARD_INSIGHT_KEYS.map((key) => [key, {
    descriptive: `${key} numbers are available.`,
    predictive: 'The official projection is a statistical estimate.',
    prescriptive: 'Review the figures before planning next quarter.'
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

  it('tries the fallback model after invalid JSON and returns complete template insights', async () => {
    const fake = createFakeClient(['not json', '{"trend":{}}']);
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
      expect(Object.values(card)).toHaveLength(3);
      expect(Object.values(card).every((sentence) => typeof sentence === 'string' && sentence.length > 0)).toBe(true);
    }
  });

  it('instructs question answers to use descriptive, predictive, and prescriptive headings', async () => {
    const fake = createFakeClient(['**Descriptive**\nCurrent data is available.\n\n**Predictive**\nThe official projection is unavailable.\n\n**Prescriptive**\nReview the current figures.']);

    const answer = await generateRevenueInsights('Summarize revenue.', {}, {
      client: fake.client,
      modelNames: ['primary-test']
    });

    expect(fake.configurations[0].systemInstruction).toContain('**Descriptive**');
    expect(fake.configurations[0].systemInstruction).toContain('**Predictive**');
    expect(fake.configurations[0].systemInstruction).toContain('**Prescriptive**');
    expect(answer).toContain('**Predictive**');
  });
});
