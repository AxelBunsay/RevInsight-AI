import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RevenueCardInsights from './RevenueCardInsights';

const fallbackInsights = {
  summary: 'Completed-quarter revenue changed based on available data.',
  recommendation: 'Review completed-quarter results before adjusting promotions.',
  ifFollowed: 'Reviewing the decline may help stabilize revenue momentum.',
  ifIgnored: 'Ignoring the decline could prolong weaker completed-quarter sales.'
};

describe('RevenueCardInsights', () => {
  it('renders an unlabeled summary, recommendation, and conditional outcomes from templates on failure', () => {
    const markup = renderToStaticMarkup(<RevenueCardInsights
      error="AI service unavailable."
      fallbackInsights={fallbackInsights}
    />);

    expect(markup).toContain('Completed-quarter revenue changed based on available data.');
    expect(markup).toContain('Recommendation');
    expect(markup).toContain('Possible outcome');
    expect(markup).toContain('<strong>If you act:</strong>');
    expect(markup).toContain('<strong>If you ignore it:</strong>');
    expect(markup).toContain('Ignoring the decline could prolong weaker completed-quarter sales.');
    expect(markup).not.toContain('Descriptive');
    expect(markup).not.toContain('Predictive');
    expect(markup).not.toContain('Prescriptive');
    expect(markup).not.toContain('AI service unavailable.');
  });

  it('keeps the summary unlabeled and shows both outcome lines in the standard rows', () => {
    const markup = renderToStaticMarkup(<RevenueCardInsights
      insights={fallbackInsights}
      fallbackInsights={{}}
    />);

    expect(markup).toContain('Recommendation');
    expect(markup).toContain('Possible outcome');
    expect(markup).toContain('Reviewing the decline may help stabilize revenue momentum.');
  });

  it('shows skeleton rows while insights are loading', () => {
    const markup = renderToStaticMarkup(<RevenueCardInsights
      isLoading
      fallbackInsights={fallbackInsights}
    />);

    expect(markup).toContain('Loading card insights');
    expect(markup).toContain('ai-revenue-card__skeleton');
    expect(markup).not.toContain('Completed-quarter revenue changed based on available data.');
  });
});
