import { salesPeriodLabels } from './salesPeriodLabels';

function SalesSummary({ period, series }) {
  const labels = salesPeriodLabels[period];
  const values = series.map((item) => Number(item.value || 0));
  const latest = values.at(-1) || 0;
  const previous = values.at(-2) || 0;
  const delta = previous ? ((latest - previous) / previous) * 100 : 0;
  const deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
  const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

  return (
    <div className="admin-sales-summary">
      <div className="admin-sales-summary__total">
        <span>{labels.heading}</span>
        <strong>{peso.format(latest)}</strong>
        <small>Latest {peso.format(latest)} · {deltaText} {labels.comparison}</small>
      </div>
    </div>
  );
}

export default SalesSummary;
