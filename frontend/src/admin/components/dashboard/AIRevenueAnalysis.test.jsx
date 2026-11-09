import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createRevenueFiguresFingerprint } from './revenueAnalysisFingerprint';

const source = readFileSync(new URL('./AIRevenueAnalysis.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const cardMarkup = source.split('<div className="ai-revenue-cards">')[1].split('</div>\n            </div>')[0];

describe('AI revenue card insights placement', () => {
  it('keeps cards compact and opens their matching analysis modal', () => {
    expect(cardMarkup).not.toContain('<RevenueCardInsights');
    expect(cardMarkup).toContain('View analysis');
    expect(cardMarkup).toContain('role="button" tabIndex={0}');
    expect(cardMarkup).toContain("openAnalysis('trend')");
    expect(cardMarkup).toContain("openAnalysis('estimate')");
  });

  it('renders the existing insight data in both modal groups without an open-triggered request', () => {
    expect(source).toContain('renderCardInsight(modalId === \'estimate\' ? \'forecast\' : \'trend\')');
    expect(source).toContain('{renderCardInsight(modalId)}');
    expect(source).toContain('insights={cardInsights[cardKey]}');
    expect(source).toContain('isLoading={cardInsightsLoading}');
    expect(source).toContain('error={cardInsightsError}');
    expect(source.match(/adminApi\.getRevenueCardInsights\(/g)).toHaveLength(1);
    expect(source).toContain('Date.now() - lastAIRequestAtRef.current >= 5 * 60 * 1000');
    expect(source).toContain("document.addEventListener('visibilitychange', onVisibilityChange)");
    expect(source).toContain("window.addEventListener('focus', onWindowFocus)");
    expect(source).toContain('askAIActiveRef.current');
  });

  it('changes the small fingerprint when revenue figures sent to AI change', () => {
    const analysis = {
      quarters: [{ year: 2026, quarter: 1, revenue: 1200 }],
      risk: {
        overallRisk: { level: 'Moderate', reason: 'top contributor share' },
        indicators: { topContributorShare: { level: 'Moderate', value: 62 } },
        officialForecast: { targetLabel: '2026 Q2', expected: 1500, low: 1300, high: 1700 }
      },
      concentration: { contributors: [{ name: 'Parts', contributorType: 'item', share: 62, revenue: 744 }] }
    };
    const figures = { analysis, collectedAmount: 800, outstandingAmount: 400 };
    const fingerprint = createRevenueFiguresFingerprint(figures);

    expect(createRevenueFiguresFingerprint(figures)).toBe(fingerprint);
    expect(createRevenueFiguresFingerprint({ ...figures, collectedAmount: 900 })).not.toBe(fingerprint);
    expect(createRevenueFiguresFingerprint({
      ...figures,
      analysis: { ...analysis, risk: { ...analysis.risk, overallRisk: { level: 'High' } } }
    })).not.toBe(fingerprint);
  });
});
