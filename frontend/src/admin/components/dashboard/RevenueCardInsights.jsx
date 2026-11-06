export default function RevenueCardInsights({ insights, fallbackInsights, isLoading, error }) {
  if (isLoading) {
    return <div className="ai-revenue-card__insights" role="status" aria-label="Loading card insights">
      <div className="ai-revenue-card__insight-summary"><span className="ai-revenue-card__skeleton" aria-hidden="true" /></div>
      <div className="ai-revenue-card__insight-row">
        <strong>Recommendation</strong>
        <span className="ai-revenue-card__skeleton" aria-hidden="true" />
      </div>
      <div className="ai-revenue-card__insight-row">
        <strong>Possible outcome</strong>
        <span className="ai-revenue-card__outcomes">
          <span className="ai-revenue-card__skeleton" aria-hidden="true" />
          <span className="ai-revenue-card__skeleton" aria-hidden="true" />
        </span>
      </div>
    </div>;
  }

  const content = error ? fallbackInsights : insights || fallbackInsights;
  return <div className="ai-revenue-card__insights" aria-label="Revenue insights">
    <p className="ai-revenue-card__insight-summary">
      {content?.summary || fallbackInsights?.summary || 'Not enough data yet.'}
    </p>
    <div className="ai-revenue-card__insight-row">
      <strong>Recommendation</strong>
      <span>{content?.recommendation || fallbackInsights?.recommendation || 'Not enough data yet.'}</span>
    </div>
    <div className="ai-revenue-card__insight-row">
      <strong>Possible outcome</strong>
      <span className="ai-revenue-card__outcomes">
        <span><strong>If you act:</strong> {content?.ifFollowed || fallbackInsights?.ifFollowed || 'Not enough data yet.'}</span>
        <span><strong>If you ignore it:</strong> {content?.ifIgnored || fallbackInsights?.ifIgnored || 'Not enough data yet.'}</span>
      </span>
    </div>
  </div>;
}
