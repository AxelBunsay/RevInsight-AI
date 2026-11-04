const insightLabels = [
  ['descriptive', 'Descriptive'],
  ['predictive', 'Predictive'],
  ['prescriptive', 'Prescriptive']
];

export default function RevenueCardInsights({ insights, fallbackInsights, isLoading, error }) {
  if (isLoading) {
    return <span className="ai-revenue-card__insights" role="status" aria-label="Loading card insights">
      {insightLabels.map(([key, label]) => <span className="ai-revenue-card__insight-row" key={key}>
        <strong>{label}</strong>
        <span className="ai-revenue-card__skeleton" aria-hidden="true" />
      </span>)}
    </span>;
  }

  const content = error ? fallbackInsights : insights || fallbackInsights;
  return <span className="ai-revenue-card__insights" aria-label="Revenue insights">
    {insightLabels.map(([key, label]) => <span className="ai-revenue-card__insight-row" key={key}>
      <strong>{label}</strong>
      <span>{content?.[key] || fallbackInsights?.[key] || 'Not enough data yet.'}</span>
    </span>)}
  </span>;
}
