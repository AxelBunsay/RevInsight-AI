import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import CategoryRevenue from '../components/dashboard/CategoryRevenue';
import ServiceRevenue from '../components/dashboard/ServiceRevenue';
import AIRevenueAnalysis from '../components/dashboard/AIRevenueAnalysis';
import InventoryHealth from '../components/dashboard/InventoryHealth';
import PeriodToggle from '../components/dashboard/PeriodToggle';
import SalesChart from '../components/dashboard/SalesChart';
import SalesSummary from '../components/dashboard/SalesSummary';
import StatStrip from '../components/dashboard/StatStrip';
import EmptyState from '../components/common/EmptyState';
import Panel from '../components/common/Panel';
import Skeleton from '../components/common/Skeleton';
import useMediaQuery from '../hooks/useMediaQuery';
import useSalesSeries from '../hooks/useSalesSeries';
import useServiceRevenue from '../hooks/useServiceRevenue';

function Dashboard() {
  const dashboard = useOutletContext();
  const [period, setPeriod] = useState('daily');
  const seriesState = useSalesSeries(period);
  const serviceRevenueState = useServiceRevenue(period);
  const compactChart = useMediaQuery('(max-width: 540px)');

  if (!dashboard.data && dashboard.error) {
    return (
      <div className="admin-page admin-dashboard">
        <div className="admin-error" role="alert"><p>{dashboard.error}</p><button type="button" onClick={dashboard.retry}>Retry</button></div>
      </div>
    );
  }

  return (
    <div className="admin-page admin-dashboard">
      {dashboard.error && <div className="admin-inline-error" role="alert"><span>{dashboard.error}</span><button type="button" onClick={dashboard.retry}>Retry</button></div>}
      {dashboard.data ? <StatStrip stats={dashboard.data.stats} /> : (
        <section className="admin-stat-strip admin-stat-strip--loading" aria-label="Loading business overview">
          {Array.from({ length: 4 }, (_, index) => <div className="admin-stat-cell admin-stat-cell--skeleton" key={index}><Skeleton label="Loading metric" /></div>)}
        </section>
      )}

      <Panel className="admin-sales-hero">
        <div className="admin-sales-hero__header">
          {seriesState.series.length ? <SalesSummary period={period} series={seriesState.series} /> : <div className="admin-sales-summary"><div className="admin-sales-summary__total"><span>{period === 'daily' ? 'Sales this week' : period === 'weekly' ? 'Sales, last 8 weeks' : 'Sales, last 12 months'}</span><strong>{seriesState.loading ? '—' : '₱0'}</strong><small>{seriesState.error || 'Latest confirmed order sales'}</small></div></div>}
          <PeriodToggle value={period} onChange={setPeriod} />
        </div>
        {seriesState.error && <div className="admin-inline-error" role="alert"><span>{seriesState.error}</span><button type="button" onClick={seriesState.retry}>Retry</button></div>}
        <SalesChart series={seriesState.series} loading={seriesState.loading} period={period} compact={compactChart} />
      </Panel>

      {dashboard.data ? (
        <>
          <div className="admin-dashboard-lower">
            <CategoryRevenue categories={dashboard.data.categories || []} />
            <InventoryHealth inventory={dashboard.data.inventoryHealth} />
          </div>
          <AIRevenueAnalysis dashboardData={dashboard.data} />
        </>
      ) : dashboard.loading ? (
        <div className="admin-dashboard-lower"><Skeleton className="admin-panel-skeleton" /><Skeleton className="admin-panel-skeleton" /></div>
      ) : <EmptyState>No dashboard data is available.</EmptyState>}
      <ServiceRevenue state={serviceRevenueState} />
    </div>
  );
}

export default Dashboard;
