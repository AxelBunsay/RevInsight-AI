import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RevenueCardInsights from './RevenueCardInsights';

const fallbackInsights = {
  descriptive: 'Revenue changed based on completed-quarter data.',
  predictive: 'Not enough data yet for an official revenue projection.',
  prescriptive: 'Review the current figures before making a plan.'
};

describe('RevenueCardInsights', () => {
  it('renders the three labeled rows and uses template content when loading fails', () => {
    const markup = renderToStaticMarkup(<RevenueCardInsights
      error="AI service unavailable."
      fallbackInsights={fallbackInsights}
    />);

    expect(markup).toContain('Descriptive');
    expect(markup).toContain('Predictive');
    expect(markup).toContain('Prescriptive');
    expect(markup).toContain('Not enough data yet for an official revenue projection.');
    expect(markup).not.toContain('AI service unavailable.');
  });
});
