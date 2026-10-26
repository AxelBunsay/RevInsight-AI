import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../services/adminApi';

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const defaultThresholds = { topCategory: 40, highTop: 60, topTwo: 70, highTopTwo: 85 };

function quarterName(year, quarter) {
  return `${year} Q${quarter}`;
}

function quarterLabel(year, quarter) {
  return quarterName(year, quarter);
}

function quarterStart(year, quarter) {
  return new Date(year, (quarter - 1) * 3, 1);
}

function nextQuarter(year, quarter) {
  return quarter === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: quarter + 1 };
}

function percentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function signedPercent(value) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function getQuarterRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      year: Number(row?._id?.year),
      quarter: Number(row?._id?.quarter),
      revenue: Number(row?.revenue || 0),
      count: Number(row?.count || 0)
    }))
    .filter((row) => Number.isInteger(row.year) && row.year > 0
      && Number.isInteger(row.quarter) && row.quarter >= 1 && row.quarter <= 4)
    .sort((left, right) => left.year - right.year || left.quarter - right.quarter);
}

function fillQuarterGaps(rows, throughQuarter) {
  if (!rows.length) return [];
  const byKey = new Map(rows.map((row) => [`${row.year}-Q${row.quarter}`, row]));
  const first = rows[0];
  const last = rows[rows.length - 1];
  const end = last.year > throughQuarter.year
    || (last.year === throughQuarter.year && last.quarter >= throughQuarter.quarter)
    ? last
    : throughQuarter;
  const filled = [];
  let year = first.year;
  let quarter = first.quarter;
  while (year < end.year || (year === end.year && quarter <= end.quarter)) {
    const key = `${year}-Q${quarter}`;
    filled.push(byKey.get(key) || { year, quarter, revenue: 0, count: 0 });
    ({ year, quarter } = nextQuarter(year, quarter));
  }
  return filled;
}

function normalizeContributors(items, getName) {
  const contributors = (Array.isArray(items) ? items : [])
    .map((item) => ({
      name: String(getName(item) || 'Uncategorized'),
      value: Number(item?.revenue || 0),
      contributorType: item?.contributorType || ''
    }))
    .filter((item) => Number.isFinite(item.value) && item.value > 0);
  const total = contributors.reduce((sum, item) => sum + item.value, 0);
  return contributors
    .map((item) => ({ ...item, share: total ? item.value / total * 100 : 0 }))
    .sort((left, right) => right.value - left.value);
}

function getTier(items, thresholds) {
  const top = items[0]?.share || 0;
  const topTwo = (items[0]?.share || 0) + (items[1]?.share || 0);
  if (top > thresholds.highTop || topTwo > thresholds.highTopTwo) return 'High';
  if (top >= thresholds.topCategory || topTwo >= thresholds.topTwo) return 'Moderate';
  return 'Normal';
}

function calculateEstimate(rows, index, availableQuarterCount) {
  if (availableQuarterCount < 5 || index < 0) return null;
  const values = rows.slice(0, index + 1).map((row) => row.revenue);
  const growthRates = values.slice(1).flatMap((value, rateIndex) => {
    const previous = values[rateIndex];
    return previous > 0 ? [(value - previous) / previous] : [];
  });
  const averageGrowth = growthRates.length
    ? growthRates.reduce((sum, value) => sum + value, 0) / growthRates.length
    : 0;
  const variance = growthRates.length
    ? growthRates.reduce((sum, value) => sum + (value - averageGrowth) ** 2, 0) / growthRates.length
    : 0;
  const current = rows[index];
  const target = nextQuarter(current.year, current.quarter);
  const expected = Math.max(0, Math.round(current.revenue * (1 + averageGrowth)));
  const range = Math.sqrt(variance);
  return {
    expected,
    low: Math.max(0, Math.round(expected * (1 - range))),
    high: Math.round(expected * (1 + range)),
    target: quarterName(target.year, target.quarter),
    targetLabel: 'Estimate'
  };
}

function QuarterlyBarChart({ quarters, estimate, selectedKey, currentKey }) {
  const minWidth = 700;
  const height = 190;
  if (!quarters.length) return null;
  const chartBars = [
    ...quarters.map((row) => ({
      key: `${row.year}-Q${row.quarter}`,
      label: quarterLabel(row.year, row.quarter),
      value: row.revenue,
      count: row.count,
      inProgress: `${row.year}-Q${row.quarter}` === currentKey,
      selected: `${row.year}-Q${row.quarter}` === selectedKey,
      estimate: false
    })),
    ...(estimate ? [{
      key: estimate.target,
      label: 'Estimate',
      value: estimate.expected,
      count: null,
      inProgress: false,
      selected: false,
      estimate: true
    }] : [])
  ];
  const max = Math.max(...chartBars.map((bar) => bar.value), 1);
  const width = Math.max(minWidth, chartBars.length * 45);
  const baseline = height - 28;
  const plotHeight = height - 48;
  const slotWidth = width / chartBars.length;
  const barWidth = Math.max(5, Math.min(36, slotWidth * 0.58));

  return <div className={`ai-revenue-chart${estimate ? ' has-estimate' : ''}`} role="img" aria-label="Quarterly revenue bar chart. Hover or focus a bar for revenue and transaction count.">
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ minWidth: `${width}px` }}>
      <line className="ai-revenue-chart__baseline" x1="0" y1={baseline} x2={width} y2={baseline} />
      {chartBars.map((bar, index) => {
        const barHeight = bar.value > 0 ? Math.max(2, bar.value / max * plotHeight) : 1;
        const x = index * slotWidth + (slotWidth - barWidth) / 2;
        const y = baseline - barHeight;
        const classes = [
          'ai-revenue-chart__bar',
          bar.inProgress ? 'is-in-progress' : '',
          bar.selected ? 'is-selected' : '',
          bar.estimate ? 'is-estimate' : ''
        ].filter(Boolean).join(' ');
        const countLabel = bar.count === null ? 'transaction count unavailable for estimate' : `${bar.count} ${bar.count === 1 ? 'transaction' : 'transactions'}`;
        return <rect
          key={bar.key}
          className={classes}
          x={x}
          y={y}
          width={barWidth}
          height={barHeight}
          rx="2"
          tabIndex="0"
        >
          <title>{`${bar.label}: ${peso.format(bar.value)} · ${countLabel}${bar.inProgress ? ' · in progress' : ''}`}</title>
        </rect>;
      })}
    </svg>
    <div className="ai-revenue-chart__labels" style={{ minWidth: `${width}px` }}>
      {chartBars.map((bar) => <span className={`${bar.inProgress ? 'is-in-progress' : ''}${bar.estimate ? ' is-estimate' : ''}`} key={bar.key}>{bar.inProgress ? `${bar.label} · in progress` : bar.label}</span>)}
    </div>
  </div>;
}

function HorizontalBars({ items }) {
  const max = Math.max(...items.map((item) => item.share), 1);
  return <div className="ai-revenue-bars">{items.map((item) => (
    <div className="ai-revenue-bar" key={`${item.contributorType}:${item.name}`}>
      <div className="ai-revenue-bar__top"><strong>{item.name}</strong><span>{item.share.toFixed(1)}%</span></div>
      <div className="ai-revenue-bar__track"><span style={{ width: `${(item.share / max) * 100}%` }} /></div>
    </div>
  ))}</div>;
}

function getQuarterDateRange(year, quarter, monthOffset = null) {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth + (monthOffset ?? 0), 1);
  const end = monthOffset === null
    ? new Date(year, startMonth + 3, 0)
    : new Date(year, startMonth + monthOffset + 1, 0);
  const dateOnly = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { startDate: dateOnly(start), endDate: dateOnly(end) };
}

function formatRecordDate(record) {
  const date = new Date(record.completedAt || record.createdAt);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function mapBusinessRecord(record) {
  return {
    id: String(record._id || record.sourceId || '—'),
    date: formatRecordDate(record),
    type: record.recordType === 'service' ? 'Service' : 'Item',
    customer: record.customer || '—',
    items: record.itemName || '—',
    amount: Number(record.amount || 0),
    status: record.status || '—',
    mechanic: record.mechanicName || '—'
  };
}

function currentQuarterProgress(today = new Date()) {
  const year = today.getFullYear();
  const quarter = Math.floor(today.getMonth() / 3) + 1;
  const start = quarterStart(year, quarter);
  const next = nextQuarter(year, quarter);
  const end = quarterStart(next.year, next.quarter);
  return {
    key: `${year}-Q${quarter}`,
    label: quarterName(year, quarter),
    percent: Math.min(100, Math.max(0, Math.floor((today - start) / (end - start) * 100)))
  };
}

function AskRevenueAIPanel() {
  const suggestions = [
    'Why did revenue change last quarter?',
    'What are the biggest revenue risks?',
    'How concentrated is revenue among contributors?'
  ];
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const submitQuestion = async (event) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setError('Enter a question about revenue.');
      return;
    }
    setIsLoading(true);
    setError('');
    setAnswer('');
    try {
      const response = await adminApi.askRevenueAI(trimmedQuestion);
      if (typeof response?.answer !== 'string' || !response.answer.trim()) {
        throw new Error('The AI returned an empty answer. Please try again.');
      }
      setAnswer(response.answer);
    } catch (requestError) {
      setError(requestError.message || 'Could not generate a revenue answer. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return <section className="ai-revenue-modal ai-revenue-ai-panel" aria-labelledby="ai-revenue-ai-title">
    <p className="ai-revenue-modal__eyebrow">Revenue analysis</p>
    <h2 id="ai-revenue-ai-title">Ask AI</h2>
    <p className="ai-revenue-modal__detail">Ask a question about your revenue data.</p>
    <div className="ai-revenue-toolbar" aria-label="Suggested questions">
      {suggestions.map((suggestion) => <button
        type="button"
        className="ai-revenue-toolbar__action"
        key={suggestion}
        disabled={isLoading}
        onClick={() => setQuestion(suggestion)}
      >{suggestion}</button>)}
    </div>
    <form onSubmit={submitQuestion}>
      <div className="ai-revenue-thresholds">
        <label htmlFor="ai-revenue-question">Your question
          <textarea
            id="ai-revenue-question"
            className="ai-revenue-ai-question"
            value={question}
            maxLength={500}
            rows={3}
            placeholder="Ask about revenue trends, risk, or concentration..."
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
      </div>
      <div className="ai-revenue-settings__actions">
        <small>{question.length}/500</small>
        <button className="ai-revenue-settings__primary" type="submit" disabled={isLoading || !question.trim()}>
          {isLoading ? 'Thinking...' : 'Ask AI'}
        </button>
      </div>
    </form>
    {isLoading && <p className="ai-revenue-empty" role="status">Analyzing revenue data...</p>}
    {error && <p className="ai-revenue-report__error" role="alert">{error}</p>}
    {answer && <div className="ai-revenue-callout" aria-live="polite"><strong>Answer</strong><p>{answer}</p></div>}
  </section>;
}

function AIRevenueAnalysis({ dashboardData }) {
  const [analysis, setAnalysis] = useState({ quarters: [], risk: null, concentration: null });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedQuarterKey, setSelectedQuarterKey] = useState(null);
  const [modalId, setModalId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(null);
  const [reportRows, setReportRows] = useState([]);
  const [reportError, setReportError] = useState('');
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [thresholds, setThresholds] = useState(defaultThresholds);

  useEffect(() => {
    let active = true;
    adminApi.getRevenueAnalysisData()
      .then((result) => {
        if (!active) return;
        setAnalysis({
          quarters: getQuarterRows(result.quarterly?.data),
          risk: result.risk?.data || null,
          concentration: result.concentration?.data || null
        });
        setLoadError('');
      })
      .catch((error) => {
        if (active) setLoadError(error.message || 'Revenue analysis could not be loaded.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const todayQuarter = currentQuarterProgress();
  const quarters = useMemo(
    () => fillQuarterGaps(analysis.quarters, {
      year: Number(todayQuarter.key.slice(0, 4)),
      quarter: Number(todayQuarter.key.slice(-1))
    }),
    [analysis.quarters, todayQuarter.key]
  );
  const matchingQuarterIndex = quarters.findIndex((row) => `${row.year}-Q${row.quarter}` === selectedQuarterKey);
  const currentQuarterIndex = quarters.findIndex((row) => `${row.year}-Q${row.quarter}` === todayQuarter.key);
  const selectedIndex = matchingQuarterIndex >= 0
    ? matchingQuarterIndex
    : currentQuarterIndex >= 0
      ? currentQuarterIndex
      : Math.max(quarters.length - 1, 0);
  const current = quarters[selectedIndex];
  const previous = quarters[selectedIndex - 1];
  const yearAgo = current && quarters.find((row) => row.year === current.year - 1 && row.quarter === current.quarter);
  const qoq = current && previous ? percentChange(current.revenue, previous.revenue) : null;
  const yoy = current && yearAgo ? percentChange(current.revenue, yearAgo.revenue) : null;
  const estimate = current
    ? calculateEstimate(quarters, selectedIndex, analysis.quarters.filter((row) => row.year < current.year
      || (row.year === current.year && row.quarter <= current.quarter)).length)
    : null;
  const chartEstimate = quarters.length
    ? calculateEstimate(quarters, quarters.length - 1, analysis.quarters.length)
    : null;
  const currentQuarterKey = todayQuarter.key;
  const categoryItems = useMemo(
    () => normalizeContributors(analysis.risk?.byCategory, (item) => item?._id),
    [analysis.risk]
  );
  const contributorItems = useMemo(
    () => normalizeContributors(analysis.concentration?.contributors, (item) => item?.name),
    [analysis.concentration]
  );
  const serviceItems = useMemo(
    () => contributorItems.filter((item) => /service/i.test(item.contributorType)),
    [contributorItems]
  );

  const reportYear = current?.year;
  const reportQuarterNumber = current?.quarter;
  useEffect(() => {
    if (!reportOpen || !reportYear || !reportQuarterNumber) return undefined;
    let active = true;
    const loadRecords = async () => {
      setIsReportLoading(true);
      setReportError('');
      setReportRows([]);
      try {
        const range = getQuarterDateRange(reportYear, reportQuarterNumber, reportMonth);
        const firstPage = await adminApi.getBusinessRecords({ ...range, page: 1, limit: 100 });
        const records = Array.isArray(firstPage.data) ? [...firstPage.data] : [];
        const totalPages = Math.max(1, Number(firstPage.pagination?.totalPages || 1));
        for (let page = 2; page <= totalPages; page += 1) {
          const response = await adminApi.getBusinessRecords({ ...range, page, limit: 100 });
          records.push(...(Array.isArray(response.data) ? response.data : []));
        }
        if (active) setReportRows(records.map(mapBusinessRecord));
      } catch (error) {
        if (active) setReportError(error.message || 'Business records could not be loaded.');
      } finally {
        if (active) setIsReportLoading(false);
      }
    };
    loadRecords();
    return () => { active = false; };
  }, [reportMonth, reportOpen, reportQuarterNumber, reportYear]);

  useEffect(() => {
    if (!modalId) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') setModalId(null); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modalId]);

  const reportTotal = reportRows.reduce((sum, row) => sum + row.amount, 0);
  const reportPaid = reportRows.filter((row) => ['paid', 'completed'].includes(row.status.toLowerCase()))
    .reduce((sum, row) => sum + row.amount, 0);
  const reportOutstanding = reportTotal - reportPaid;
  const monthNames = reportYear && reportQuarterNumber
    ? [0, 1, 2].map((offset) => new Date(reportYear, (reportQuarterNumber - 1) * 3 + offset, 1).toLocaleString('en-PH', { month: 'short' }))
    : [];
  const collectedAmount = Number(dashboardData?.stats?.collected || 0);
  const outstandingAmount = Number(dashboardData?.stats?.outstanding || 0);
  const selectedAnalysis = modalId === 'risk'
    ? { title: 'Revenue risk by category', items: categoryItems }
    : modalId === 'concentration'
      ? { title: 'Revenue concentration', items: contributorItems }
      : { title: 'Service type concentration', items: serviceItems };
  const selectedTier = getTier(selectedAnalysis.items, thresholds);
  const selectedTop = selectedAnalysis.items[0];
  const cardDetails = [
    {
      id: 'risk',
      title: 'Revenue risk by category',
      icon: '✣',
      items: categoryItems,
      description: analysis.risk?.topCategory
        ? `${analysis.risk.topCategory} is the largest revenue category`
        : 'No category revenue is available'
    },
    {
      id: 'concentration',
      title: 'Revenue concentration',
      icon: '●',
      items: contributorItems,
      description: analysis.concentration?.indicators
        ? `${Number(analysis.concentration.indicators.topOneShare || 0).toFixed(1)}% from the top contributor`
        : 'No contributor data is available'
    },
    ...(serviceItems.length ? [{
      id: 'service',
      title: 'Service type concentration',
      icon: '⌁',
      items: serviceItems,
      description: `${serviceItems[0].share.toFixed(1)}% from ${serviceItems[0].name}`
    }] : [])
  ];

  return <section className="ai-revenue-analysis" aria-labelledby="ai-revenue-title">
    <div className="ai-revenue-analysis__header">
      <div className="ai-revenue-analysis__title"><span className="ai-revenue-analysis__mark">✦</span><div><h2 id="ai-revenue-title">Revenue Analysis</h2><p>Quarterly revenue, risk, and concentration from business data</p></div></div>
      <div className="ai-revenue-toolbar">
        <button type="button" className="ai-revenue-toolbar__action" onClick={() => setSettingsOpen(true)}>⚙️ Thresholds</button>
        <button type="button" className="ai-revenue-toolbar__action" onClick={() => { setReportMonth(null); setReportOpen(true); }}>⬇ Export report</button>
      </div>
    </div>

    {isLoading ? <p className="ai-revenue-empty" role="status">Loading revenue analysis…</p>
      : loadError ? <p className="ai-revenue-report__error" role="alert">{loadError}</p>
        : analysis.quarters.length === 0 ? <p className="ai-revenue-empty" role="status">No quarterly revenue data is available yet.</p>
          : <>
            <div className="ai-revenue-tabs" role="tablist" aria-label="Revenue analysis quarter">
              {quarters.map((row, index) => {
                const key = `${row.year}-Q${row.quarter}`;
                return <button type="button" role="tab" aria-selected={selectedIndex === index} className={selectedIndex === index ? 'is-active' : ''} key={key} onClick={() => setSelectedQuarterKey(key)}>{quarterLabel(row.year, row.quarter)}</button>;
              })}
            </div>
            <div className="ai-revenue-completeness-banner">
              <strong>{todayQuarter.label} is in progress</strong>
              <span>— {todayQuarter.percent}% of the quarter has elapsed.</span>
            </div>
            <div className="ai-revenue-summary">
              <div>
                <span>Total revenue - {quarterName(current.year, current.quarter)}</span>
                <strong>{peso.format(current.revenue)}</strong>
                <em className={qoq === null || qoq >= 0 ? 'is-positive' : 'is-negative'}>{qoq === null ? '—' : `${qoq >= 0 ? '▲' : '▼'} ${Math.abs(qoq).toFixed(1)}% QoQ`}</em>
                <small>{current.count} records · avg {peso.format(current.count ? current.revenue / current.count : 0)} per record</small>
                <small>{yoy === null ? 'YoY comparison unavailable' : `${signedPercent(yoy)} vs same quarter last year`}</small>
              </div>
              <div className="ai-revenue-summary__chart">
                <QuarterlyBarChart
                  quarters={quarters}
                  estimate={chartEstimate}
                  selectedKey={`${current.year}-Q${current.quarter}`}
                  currentKey={currentQuarterKey}
                />
                {chartEstimate
                  ? <><p className="ai-revenue-estimate-note">Next quarter estimate: {peso.format(chartEstimate.expected)} · likely {peso.format(chartEstimate.low)} to {peso.format(chartEstimate.high)}</p><div className="ai-revenue-estimate-legend"><span><i className="is-actual" />Actual</span><span><i className="is-estimate" />Estimate</span><span>Current quarter is marked in progress</span></div></>
                  : <p className="ai-revenue-estimate-note">Estimate needs at least 5 quarters of data. {analysis.quarters.length} available.</p>}
              </div>
            </div>
            <div className="ai-revenue-collected-row">
              <div><span>Collected</span><strong>{peso.format(collectedAmount)}</strong></div>
              <div><span>Outstanding</span><strong>{peso.format(outstandingAmount)}</strong></div>
              <div><span>Collection</span><strong>{collectedAmount + outstandingAmount ? Math.round(collectedAmount / (collectedAmount + outstandingAmount) * 100) : 0}%</strong></div>
            </div>
            <div className="ai-revenue-cards">
              <button type="button" className="ai-revenue-card" onClick={() => setModalId('trend')}>
                <div className="ai-revenue-card__top"><span className="ai-revenue-card__icon">↗</span><em className={`ai-revenue-pill ${qoq !== null && qoq < 0 ? 'is-bad' : 'is-good'}`}>{signedPercent(qoq)} QoQ</em></div>
                <strong>Revenue trend &amp; growth</strong><b>{peso.format(current.revenue)}</b>
                <small>{yoy === null ? 'YoY comparison unavailable' : `${signedPercent(yoy)} vs same quarter last year`}</small>
              </button>
              {cardDetails.map((card) => {
                const tier = getTier(card.items, thresholds);
                return <button type="button" className="ai-revenue-card" key={card.id} onClick={() => setModalId(card.id)}>
                  <div className="ai-revenue-card__top"><span className="ai-revenue-card__icon">{card.icon}</span><em className={`ai-revenue-pill ${tier === 'High' ? 'is-bad' : tier === 'Moderate' ? 'is-warn' : 'is-good'}`}>{card.items.length ? `${tier} risk` : 'No data'}</em></div>
                  <strong>{card.title}</strong>
                  <b>{card.items.length ? `${card.items[0].share.toFixed(1)}% from ${card.items[0].name}` : 'No data'}</b>
                  <small>{card.description}</small>
                </button>;
              })}
              <button type="button" className="ai-revenue-card" onClick={() => setModalId('estimate')}>
                <div className="ai-revenue-card__top"><span className="ai-revenue-card__icon">◌</span><em className={`ai-revenue-pill ${estimate ? 'is-neutral' : 'is-warn'}`}>{estimate ? 'Estimate' : 'Need 5+ quarters'}</em></div>
                <strong>Quarterly estimate</strong><b>{estimate ? `${peso.format(estimate.expected)} expected` : 'Limited history'}</b>
                <small>{estimate ? `Likely range ${peso.format(estimate.low)} to ${peso.format(estimate.high)} for ${estimate.target}` : 'At least five quarters are required.'}</small>
              </button>
            </div>
            {analysis.quarters.length < 5 && <p className="ai-revenue-empty" role="status">Fewer than 5 quarters are available. The quarterly trend is shown; the estimate will appear after more data is recorded.</p>}
          </>}

    <AskRevenueAIPanel />

    {settingsOpen && <div className="ai-revenue-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
      <section className="ai-revenue-modal ai-revenue-settings" role="dialog" aria-modal="true" aria-labelledby="ai-thresholds-title">
        <button type="button" className="ai-revenue-modal__close" aria-label="Close thresholds" onClick={() => setSettingsOpen(false)}>×</button>
        <p className="ai-revenue-modal__eyebrow">Settings</p><h2 id="ai-thresholds-title">Risk thresholds</h2>
        <div className="ai-revenue-thresholds">
          <label><span>Moderate starts at (top category %)</span><input type="number" min="0" max="100" value={thresholds.topCategory} onChange={(event) => setThresholds((value) => ({ ...value, topCategory: Number(event.target.value) || 0 }))} /></label>
          <label><span>High starts at (top category %)</span><input type="number" min="0" max="100" value={thresholds.highTop} onChange={(event) => setThresholds((value) => ({ ...value, highTop: Number(event.target.value) || 0 }))} /></label>
          <label><span>Moderate starts at (top 2 %)</span><input type="number" min="0" max="100" value={thresholds.topTwo} onChange={(event) => setThresholds((value) => ({ ...value, topTwo: Number(event.target.value) || 0 }))} /></label>
          <label><span>High starts at (top 2 %)</span><input type="number" min="0" max="100" value={thresholds.highTopTwo} onChange={(event) => setThresholds((value) => ({ ...value, highTopTwo: Number(event.target.value) || 0 }))} /></label>
        </div>
        <div className="ai-revenue-settings__actions"><button type="button" className="ai-revenue-settings__secondary" onClick={() => setThresholds(defaultThresholds)}>Reset to default</button><button type="button" className="ai-revenue-settings__primary" onClick={() => setSettingsOpen(false)}>Apply</button></div>
      </section>
    </div>}

    {reportOpen && reportYear && reportQuarterNumber && <div className="ai-revenue-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportOpen(false); }}>
      <section className="ai-revenue-modal ai-revenue-report" role="dialog" aria-modal="true" aria-labelledby="ai-report-title">
        <button type="button" className="ai-revenue-modal__close" aria-label="Close report" onClick={() => setReportOpen(false)}>×</button>
        <p className="ai-revenue-modal__eyebrow">Export</p><h2 id="ai-report-title">Sales / Transactions — {quarterName(reportYear, reportQuarterNumber)}</h2>
        <div className="ai-revenue-report__summary">
          <strong>{reportMonth === null ? quarterName(reportYear, reportQuarterNumber) : `${monthNames[reportMonth]} ${reportYear}`} Business Records</strong>
          <span>Generated {new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })} · Total: {peso.format(reportTotal)} ({peso.format(reportPaid)} paid, {peso.format(reportOutstanding)} outstanding)</span>
          {reportError && <span className="ai-revenue-report__error" role="alert">{reportError}</span>}
        </div>
        <div className="ai-revenue-report__month-tabs" role="group" aria-label="Filter report by month">
          <button type="button" className={reportMonth === null ? 'is-active' : ''} aria-pressed={reportMonth === null} onClick={() => setReportMonth(null)}>Full quarter</button>
          {monthNames.map((name, index) => <button type="button" className={reportMonth === index ? 'is-active' : ''} aria-pressed={reportMonth === index} key={name} onClick={() => setReportMonth(index)}>{name}</button>)}
        </div>
        <div className="ai-revenue-report__table-wrap">
          <table className="ai-revenue-report__table">
            <thead><tr><th>Record ID</th><th>Date</th><th>Type</th><th>Customer</th><th>Item / Service</th><th>Amount</th><th>Status</th><th>Mechanic</th></tr></thead>
            <tbody>
              {isReportLoading
                ? <tr><td className="ai-revenue-report__empty" colSpan="8">Loading business records…</td></tr>
                : reportRows.length
                  ? reportRows.map((row) => <tr key={`${row.id}-${row.date}`}><td>{row.id}</td><td>{row.date}</td><td>{row.type}</td><td>{row.customer}</td><td>{row.items}</td><td>{peso.format(row.amount)}</td><td>{row.status}</td><td>{row.mechanic}</td></tr>)
                  : <tr><td className="ai-revenue-report__empty" colSpan="8">{reportError ? 'Business records could not be loaded.' : 'No business records for this period.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ai-revenue-settings__actions ai-revenue-settings__actions--report"><button type="button" className="ai-revenue-settings__primary" onClick={() => window.print()} disabled={!reportRows.length}>Print / Save as PDF</button></div>
      </section>
    </div>}

    {modalId && modalId !== 'risk' && modalId !== 'concentration' && modalId !== 'service' && <div className="ai-revenue-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalId(null); }}>
      <section className="ai-revenue-modal" role="dialog" aria-modal="true" aria-labelledby="ai-analysis-modal-title">
        <button type="button" className="ai-revenue-modal__close" aria-label="Close analysis" onClick={() => setModalId(null)}>×</button>
        <p className="ai-revenue-modal__eyebrow">{quarterName(current.year, current.quarter)} analysis</p>
        <h2 id="ai-analysis-modal-title">{modalId === 'estimate' ? 'Quarterly estimate' : 'Revenue trend & growth'}</h2>
        <strong className="ai-revenue-modal__headline">{modalId === 'estimate' ? estimate ? `${peso.format(estimate.expected)} estimate for ${estimate.target}` : 'Limited history' : `${peso.format(current.revenue)} revenue`}</strong>
        <p className="ai-revenue-modal__detail">{modalId === 'estimate' ? estimate ? `Likely range: ${peso.format(estimate.low)} to ${peso.format(estimate.high)}.` : 'At least five quarters are needed for an estimate.' : `QoQ change: ${signedPercent(qoq)} · YoY change: ${signedPercent(yoy)}`}</p>
        <QuarterlyBarChart quarters={quarters.slice(0, selectedIndex + 1)} estimate={estimate} selectedKey={`${current.year}-Q${current.quarter}`} currentKey={currentQuarterKey} />
        <div className="ai-revenue-callout is-normal">Estimate is a simple planning aid based on average observed quarter-over-quarter growth, not a target.</div>
      </section>
    </div>}

    {(modalId === 'risk' || modalId === 'concentration' || modalId === 'service') && <div className="ai-revenue-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalId(null); }}>
      <section className="ai-revenue-modal" role="dialog" aria-modal="true" aria-labelledby="ai-risk-modal-title">
        <button type="button" className="ai-revenue-modal__close" aria-label="Close analysis" onClick={() => setModalId(null)}>×</button>
        <p className="ai-revenue-modal__eyebrow">Revenue risk</p><h2 id="ai-risk-modal-title">{selectedAnalysis.title}</h2>
        {selectedAnalysis.items.length ? <>
          <div className="ai-revenue-tier-tabs">{['Normal', 'Moderate', 'High'].map((tier) => <span className={selectedTier === tier ? 'is-active' : ''} key={tier}>{tier}</span>)}</div>
          <div className={`ai-revenue-callout is-${selectedTier.toLowerCase()}`}><strong>{selectedTier} concentration</strong><span>{selectedTop?.name} contributes {selectedTop?.share.toFixed(1)}% of the displayed revenue mix.</span></div>
          <HorizontalBars items={selectedAnalysis.items} />
          <div className="ai-revenue-thresholds__note">Threshold reference: Moderate at {thresholds.topCategory}% top category / {thresholds.topTwo}% top two; High at {thresholds.highTop}% top category / {thresholds.highTopTwo}% top two.</div>
        </> : <p className="ai-revenue-empty">There is no backend data for this concentration view.</p>}
      </section>
    </div>}
  </section>;
}

export default AIRevenueAnalysis;
