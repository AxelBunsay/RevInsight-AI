import Panel from '../common/Panel';
import EmptyState from '../common/EmptyState';
import Skeleton from '../common/Skeleton';
import StatCell from './StatCell';

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const periodLabels = {
  daily: 'Last 7 days',
  weekly: 'Last 8 weeks',
  monthly: 'Last 12 months'
};
const formatJobCount = (count) => `${count} ${count === 1 ? 'job' : 'jobs'}`;

function ServiceRevenue({ period, state }) {
  const data = state.data;

  return (
    <Panel title="Service revenue" className="admin-category-panel admin-service-revenue-panel">
      <p className="admin-service-revenue__period">{periodLabels[period]}</p>
      {state.error && (
        <div className="admin-inline-error" role="alert">
          <span>{state.error}</span>
          <button type="button" onClick={state.retry}>Retry</button>
        </div>
      )}
      <div className="admin-stat-strip admin-service-revenue__stats" aria-label="Service revenue summary">
        <StatCell label="Service revenue" value={data?.totalServiceRevenue} detail={state.loading ? 'Loading' : periodLabels[period]} formatValue={(value) => peso.format(value)} />
        <StatCell label="Completed jobs" value={data?.completedJobs} detail={state.loading ? 'Loading' : 'Completed services'} />
        <StatCell label="Share of total revenue" value={data?.percentOfTotalRevenue} detail={state.loading ? 'Loading' : 'Of total revenue'} formatValue={(value) => `${value.toFixed(1)}%`} />
      </div>
      {state.loading ? <Skeleton className="admin-panel-skeleton" label="Loading service revenue" /> : !data?.completedJobs ? (
        <EmptyState>No completed services in this period.</EmptyState>
      ) : (
        <>
          <div className="admin-service-revenue__section">
            <h3>Revenue by service category</h3>
            <div className="admin-category-list">
              {data.categories.map((category) => (
                <div className="admin-category-row" key={category.name}>
                  <div className="admin-category-row__top">
                    <strong>{category.name}</strong>
                    <span>{peso.format(category.revenue)} <small>{formatJobCount(category.jobs)} · {category.percent.toFixed(1)}%</small></span>
                  </div>
                  <div className="admin-category-track" role="progressbar" aria-label={`${category.name} share of service revenue`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={category.percent}>
                    <span style={{ width: `${category.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="admin-service-revenue__section">
            <h3>Top services</h3>
            <ol className="admin-service-revenue__top-list">
              {data.topServices.map((service) => (
                <li key={service.name}>
                  <strong>{service.name}</strong>
                  <span>{peso.format(service.revenue)} <small>{formatJobCount(service.jobs)}</small></span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </Panel>
  );
}

export default ServiceRevenue;
