import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
    expect(source.match(/adminApi\.getRevenueCardInsights\(/g)).toHaveLength(2);
  });
});
