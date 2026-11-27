import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductRevenueSummary, ScopedRevenueFigures } from './AIRevenueAnalysis';
import { createRevenueFiguresFingerprint } from './revenueAnalysisFingerprint';

const source = readFileSync(new URL('./AIRevenueAnalysis.jsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const cardMarkup = source.split('<div className="ai-revenue-cards">')[1].split('</div>\n            </div>')[0];

describe('scoped revenue card', () => {
  it('explains a manual item total without implying a known product or zero service sales', () => {
    const concentration = { totalRevenue:250, salesMix:{
      itemSales:250, manualItemSales:250, manualWithoutProductBreakdown:250, products:[],
      knownProductRevenue:0, percentOfEligible:0, serviceRevenue:0,
      productNotice:'Product breakdown unavailable', serviceNotice:'Services were not tracked during this period.'
    }};
    const markup = renderToStaticMarkup(<ProductRevenueSummary concentration={concentration} />);
    expect(markup).toContain('Item sales · ₱250');
    expect(markup).toContain('Product breakdown unavailable');
    expect(markup).toContain('₱0 of ₱250 eligible revenue (0%)');
    expect(markup).toContain('Services were not tracked during this period.');
    expect(markup).not.toContain('Leading product');
  });
  it.each([
    ['selectedQuarter', '2026-Q2', 103.75, 1, 'Quarter revenue · 2026 Q2', '₱103.75', '1 eligible transaction'],
    ['allRecords', 'allRecords', 1240, 4, 'Total recorded revenue · All recorded quarters', '₱1,240', '4 eligible transactions'],
    ['selectedQuarter', '2024-Q4', 0, 0, 'Quarter revenue · 2024 Q4', '₱0', '0 eligible transactions']
  ])('renders the concentration response for %s (%s)', (mode, key, totalRevenue, includedTransactions, title, amount, count) => {
    const concentration = { scope: { mode, key }, totalRevenue, coverage: { includedTransactions } };
    const markup = renderToStaticMarkup(<ScopedRevenueFigures concentration={concentration} qoq={includedTransactions ? 10 : null} yoy={null} />);
    expect(markup).toContain(title);
    expect(markup).toContain(`<strong>${amount}</strong>`);
    expect(markup).toContain(count);
    expect(markup.includes('QoQ')).toBe(mode === 'selectedQuarter' && includedTransactions > 0);
    expect(markup.includes('YoY')).toBe(mode === 'selectedQuarter');
  });
});

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
    expect(source).toContain('No insight available.');
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
