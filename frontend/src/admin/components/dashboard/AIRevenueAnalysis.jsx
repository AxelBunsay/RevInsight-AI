import ContributorList from './ContributorList';
import QuarterCompletenessReview from './QuarterCompletenessReview';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RevenueAnswerChart from './RevenueAnswerChart';
import { adminApi } from '../../services/adminApi';
import MarkdownAnswer from './MarkdownAnswer';
import { askRevenueQuestion, handleQuestionKeyDown } from './askRevenueQuestion';
import { AdminModalPortal } from '../../pages/ManagementPageComponents';
import useAdminModalEffects from '../useAdminModalEffects';
import RevenueCardInsights from './RevenueCardInsights';
import { createRevenueFiguresFingerprint } from './revenueAnalysisFingerprint';
import riskThresholds from '../../../../../shared/revenueRiskConfig.json';

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const recordedPeso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const qoqModerateRange = `${riskThresholds.qoqChange.moderateMin}% to ${riskThresholds.qoqChange.normalMin}%`;
const hhiModerateRange = `${riskThresholds.concentrationHhi.normalMaxExclusive}–${riskThresholds.concentrationHhi.moderateMaxInclusive}`;
const contributorModerateRange = `${riskThresholds.topContributorShare.normalMaxExclusive}–${riskThresholds.topContributorShare.moderateMaxInclusive}%`;
const forecastModerateRange = `${riskThresholds.forecastVsFourQuarterAverage.moderateMin}% to ${riskThresholds.forecastVsFourQuarterAverage.normalMin}%`;
const riskThresholdTooltip = [
  `QoQ: Normal ≥ ${riskThresholds.qoqChange.normalMin}%; Moderate ${qoqModerateRange}; High < ${riskThresholds.qoqChange.moderateMin}%.`,
  `HHI: Normal < ${riskThresholds.concentrationHhi.normalMaxExclusive}; Moderate ${hhiModerateRange}; High > ${riskThresholds.concentrationHhi.moderateMaxInclusive}.`,
  `Top contributor: Normal < ${riskThresholds.topContributorShare.normalMaxExclusive}%; Moderate ${contributorModerateRange}; High > ${riskThresholds.topContributorShare.moderateMaxInclusive}%.`,
  `Forecast vs 4-quarter average: Normal ≥ ${riskThresholds.forecastVsFourQuarterAverage.normalMin}%; Moderate ${forecastModerateRange}; High < ${riskThresholds.forecastVsFourQuarterAverage.moderateMin}%.`
].join('\n');

function RiskChip({ level, why }) {
  const tone = ['Normal', 'Moderate', 'High'].includes(level) ? level.toLowerCase() : 'unknown';
  return <span className="ai-revenue-risk">
    <span className={`ai-revenue-risk__chip is-${tone}`}>{level || 'Not enough data'}</span>
    <span className="ai-revenue-risk__info" tabIndex={0} title={why ? `${why}\n${riskThresholdTooltip}` : riskThresholdTooltip} aria-label={`${why ? why + ' ' : ''}Risk thresholds. ${riskThresholdTooltip.replaceAll('\n', ' ')}`}>i</span>
  </span>;
}

function quarterName(year, quarter) {
  return `${year} Q${quarter}`;
}

function quarterLabel(year, quarter) {
  return quarterName(year, quarter);
}

export function ScopedRevenueFigures({ concentration, qoq, yoy }) {
  if (!concentration?.coverage) return null;
  const { scope, totalRevenue, coverage } = concentration;
  const count = coverage.includedTransactions;
  const quarterMode = scope.mode === 'selectedQuarter';
  return <div>
    <span>{quarterMode ? 'Quarter revenue' : 'Total recorded revenue'} · {quarterMode ? scope.key.replace('-', ' ') : 'All recorded quarters'}</span>
    <strong>{recordedPeso.format(totalRevenue)}</strong>
    {quarterMode && qoq != null && <em className={qoq >= 0 ? 'is-positive' : 'is-negative'}>
      {qoq >= 0 ? '▲' : '▼'} {Math.abs(qoq).toFixed(1)}% QoQ
    </em>}
    <small>{count} eligible {count === 1 ? 'transaction' : 'transactions'}{count > 0 && ' · avg ' + peso.format(totalRevenue / count) + ' per transaction'}</small>
    {quarterMode && <small>Coverage may differ across quarters. {yoy == null ? 'YoY comparison unavailable' : `${signedPercent(yoy)} vs same quarter last year`}</small>}
  </div>;
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

function classifiedCoverage(classified, total) {
  if (!classified) return '';
  const percent = classified.percentOfEligible;
  return recordedPeso.format(classified.amount) + ' of ' + recordedPeso.format(total)
    + ' eligible revenue' + (percent == null ? '' : ' (' + percent + '%)');
}

export function ProductRevenueSummary({ concentration }) {
  const mix = concentration?.salesMix;
  if (!mix) return null;
  const known = classifiedCoverage({ amount: mix.knownProductRevenue, percentOfEligible: mix.percentOfEligible }, concentration.totalRevenue);
  return <div className="ai-revenue-product-summary">
    <p><strong>Item sales · {recordedPeso.format(mix.itemSales)}</strong>{mix.productNotice && ' · ' + mix.productNotice}</p>
    <p>Known product breakdown · {known}</p>
    {mix.products.length > 0 && <p>Leading product · {mix.products[0].name} · Top one {mix.topOneShare}% · Top three {mix.topThreeShare}% · HHI {mix.hhi} of identified product sales</p>}
    {mix.manualWithoutProductBreakdown > 0 && mix.knownProductRevenue > 0 && <p>Historical manual item sales · {recordedPeso.format(mix.manualWithoutProductBreakdown)} · Product breakdown unavailable</p>}
    {mix.serviceRevenue > 0 && <p>Recorded services · {recordedPeso.format(mix.serviceRevenue)}</p>}
    {mix.mixedRevenue > 0 && <p>Mixed sales without an item and service split · {recordedPeso.format(mix.mixedRevenue)}</p>}
    {mix.unclassifiedRevenue > 0 && <p>Unclassified revenue type · {recordedPeso.format(mix.unclassifiedRevenue)}</p>}
    {mix.serviceNotice && <p>{mix.serviceNotice}</p>}
  </div>;
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
      label: 'Forecast',
      value: estimate.expected,
      count: null,
      inProgress: false,
      selected: false,
      estimate: true
    }] : [])
  ];
  const max = Math.max(...chartBars.map((bar) => bar.value || 0), 1);
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
          <title>{`${bar.label}: ${(bar.count === 0 ? 'No recorded transactions; completeness unknown' : peso.format(bar.value))} · ${countLabel}${bar.inProgress ? ' · in progress' : ''}`}</title>
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

function formatRecordDate(record) {
  const date = new Date(record.completedAt || record.createdAt);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: '2-digit', year: 'numeric' });
}

function mapBusinessRecord(record) {
  return {
    id: String(record._id || record.sourceId || '—'),
    date: formatRecordDate(record),
    type: ({ service: 'Service', item: 'Item sales', mixed: 'Mixed sale' })[record.recordType] || 'Unclassified',
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

function insightLabel(source, cached) {
  const label = source === 'ai' ? 'Generated by Gemini' : source === 'template' ? 'System-generated summary' : 'Source unknown';
  return label + (cached === true ? ' · Cached' : cached === false ? ' · Fresh' : '');
}

function AskRevenueAIPanel({ onActivityChange, selectedQuarter, revenueScope }) {
  const suggestions = [
    'Why did revenue change last quarter?',
    'What are the biggest revenue risks?',
    'How concentrated is revenue among contributors?'
  ];
  const [question, setQuestion] = useState('');
  const [answerLabel, setAnswerLabel] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerChart, setAnswerChart] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [answerTimestamp, setAnswerTimestamp] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const inFlightRef = useRef(false);
  const lastQuestionRef = useRef('');
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; onActivityChange?.(false); };
  }, [onActivityChange]);
  const questionFocusedRef = useRef(false);
  const updateActivity = () => { if (activeRef.current) onActivityChange?.(questionFocusedRef.current || inFlightRef.current); };

  const submitQuestion = async (value = question) => {
    const trimmedQuestion = value.trim();
    if (!trimmedQuestion || inFlightRef.current) return;
    lastQuestionRef.current = trimmedQuestion;
    setCopyMessage('');
    const requestedQuarter = selectedQuarter;
    const request = askRevenueQuestion({
      question: trimmedQuestion,
      inFlightRef,
      request: question => adminApi.askRevenueAI(question, requestedQuarter, revenueScope),
      setIsLoading,
      setAnswer,
      setMetadata: response => setAnswerLabel(insightLabel(response.source, response.cached)),
      setChart: setAnswerChart,
      setTimestamp: setAnswerTimestamp,
      setError
    });
    updateActivity();
    await request;
    updateActivity();
  };

  const submitForm = (event) => {
    event.preventDefault();
    submitQuestion(question);
  };

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(answer);
      setCopyMessage('Answer copied.');
    } catch {
      setCopyMessage('Could not copy the answer. Select and copy the text instead.');
    }
  };

  return <section className="ai-revenue-modal ai-revenue-ai-panel" aria-labelledby="ai-revenue-ai-title">
    <p className="ai-revenue-modal__eyebrow">Revenue analysis</p>
    <h2 id="ai-revenue-ai-title">Ask AI</h2>
    <p className="ai-revenue-modal__detail">Concentration scope: {revenueScope === 'selectedQuarter' ? selectedQuarter?.replace('-', ' ') : 'All records'}. Trend and forecast use all-records history.</p>
    <div className="ai-revenue-ai-suggestions" aria-label="Suggested questions">
      {suggestions.map((suggestion) => <button
        type="button"
        className="ai-revenue-ai-suggestion"
        key={suggestion}
        disabled={isLoading}
        onClick={() => {
          setQuestion(suggestion);
          submitQuestion(suggestion);
        }}
      >{suggestion}</button>)}
    </div>
    <form onSubmit={submitForm}>
      <div className="ai-revenue-thresholds">
        <label htmlFor="ai-revenue-question">Your question
          <textarea
            id="ai-revenue-question"
            className="ai-revenue-ai-question"
            value={question}
            maxLength={500}
            rows={3}
            placeholder="Ask about revenue trends, risk, or concentration..."
            onChange={(event) => {
              const textarea = event.currentTarget;
              setQuestion(textarea.value);
              textarea.style.height = 'auto';
              textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
              textarea.style.overflowY = textarea.scrollHeight > 160 ? 'auto' : 'hidden';
            }}
            onFocus={() => {
              questionFocusedRef.current = true;
              updateActivity();
            }}
            onBlur={() => {
              questionFocusedRef.current = false;
              updateActivity();
            }}
            onKeyDown={(event) => handleQuestionKeyDown(event, () => submitQuestion(question))}
          />
        </label>
      </div>
      <div className="ai-revenue-ai-controls">
        <div className="ai-revenue-ai-question-meta">
          <small>{question.length}/500</small>
          <small>Enter to send, Shift+Enter for a new line</small>
        </div>
        <button className="ai-revenue-settings__primary" type="submit" disabled={isLoading || !question.trim()}>
          {isLoading ? 'Thinking...' : 'Ask AI'}
        </button>
      </div>
    </form>
    {isLoading && <div className="ai-revenue-ai-skeleton" role="status" aria-label="Analyzing revenue data">
      <span /><span /><span />
    </div>}
    {error && <div className="ai-revenue-ai-error" role="alert">
      <p>{error}</p>
      <button type="button" onClick={() => submitQuestion(lastQuestionRef.current)}>Try again</button>
    </div>}
    {answer && <div className="ai-revenue-ai-answer-wrap" aria-live="polite">
      <MarkdownAnswer markdown={answer} />
      {answerChart && <RevenueAnswerChart chart={answerChart} />}
      <footer className="ai-revenue-ai-answer-footer">
        <span>{answerLabel} · {new Intl.DateTimeFormat('en-PH', {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Manila'
        }).format(new Date(answerTimestamp))}. Check important figures in the Revenue analysis cards.</span>
        <button type="button" onClick={copyAnswer}>Copy answer</button>
        {copyMessage && <small role="status">{copyMessage}</small>}
      </footer>
    </div>}
  </section>;
}

function AIRevenueAnalysis({ dashboardData }) {
  const [analysis, setAnalysis] = useState({ quarters: [], risk: null, concentration: null });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshError, setRefreshError] = useState(false);
  const [dataUpdatedAt, setDataUpdatedAt] = useState(null);
  const [collectedAmount, setCollectedAmount] = useState(Number(dashboardData?.stats?.collected || 0));
  const [outstandingAmount, setOutstandingAmount] = useState(Number(dashboardData?.stats?.outstanding || 0));
  const [cardInsights, setCardInsights] = useState({});
  const [cardSourceLabel, setCardSourceLabel] = useState('');
  const [cardInsightGeneratedAt, setCardInsightGeneratedAt] = useState('');
  const [cardInsightsLoading, setCardInsightsLoading] = useState(true);
  const [cardInsightsError, setCardInsightsError] = useState('');
  const [cardInsightsNotice, setCardInsightsNotice] = useState('');
  const [cardInsightRequestInFlight, setCardInsightRequestInFlight] = useState(false);
  const [refreshRemainingSeconds, setRefreshRemainingSeconds] = useState(0);
  const [selectedQuarterKey, setSelectedQuarterKey] = useState(currentQuarterProgress().key);
  const [reviewOpen, setReviewOpen] = useState(false);
  const quarterTabsRef = useRef(null);
  const [revenueScope, setRevenueScope] = useState('selectedQuarter');
  const scopeLabel = revenueScope === 'allRecords' ? 'All records' : 'Selected quarter · ' + selectedQuarterKey.replace('-', ' ');
  const changeRevenueScope = (quarter, mode = revenueScope) => {
    if (quarter === selectedQuarterKey && mode === revenueScope) return;
    ++cardInsightRequestIdRef.current;
    ++reviewReloadIdRef.current;
    setCardInsights({});
    setCardInsightsNotice('');
    setCardInsightGeneratedAt('');
    setCardInsightsError('');
    setAnalysis(previous => ({ ...previous, risk: null, concentration: null }));
    setIsLoading(true);
    setModalId(null);
    setReportData(null);
    setSelectedQuarterKey(quarter);
    setRevenueScope(mode);
  };
  const [modalId, setModalId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const [reportData, setReportData] = useState(null);
  const [reportError, setReportError] = useState('');
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportCardPage, setReportCardPage] = useState(1);
  const cardInsightRequestInFlightRef = useRef(false);
  const cardInsightRequestScopeRef = useRef(null);
  const cardInsightRequestIdRef = useRef(0);
  const reviewReloadIdRef = useRef(0);
  const askAIActiveRef = useRef(false);
  const onAskActivityChange = useCallback(isActive => { askAIActiveRef.current = isActive; }, []);
  const latestFiguresFingerprintRef = useRef('');
  const lastAIRequestFingerprintRef = useRef('');
  const lastAIRequestAtRef = useRef(0);
  const lastDataRefreshStartedAtRef = useRef(0);
  const openAnalysis = (cardId) => setModalId(cardId);
  const handleCardKeyDown = (event, cardId) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAnalysis(cardId);
    }
  };

  useAdminModalEffects(settingsOpen, () => setSettingsOpen(false));
  useAdminModalEffects(reportOpen, () => setReportOpen(false));
  useAdminModalEffects(Boolean(modalId), () => setModalId(null));

  const refreshAfterReview = async () => {
    const request = ++reviewReloadIdRef.current;
    ++cardInsightRequestIdRef.current;
    cardInsightRequestInFlightRef.current = false;
    setCardInsightRequestInFlight(false);
    setCardInsightsLoading(false);
    setCardInsights({});
    setCardSourceLabel('');
    setCardInsightsError('');
    setCardInsightsNotice('');
    setCardInsightGeneratedAt('');
    try {
      const result = await adminApi.getRevenueAnalysisData(selectedQuarterKey, revenueScope);
      if (request !== reviewReloadIdRef.current) return;
      setAnalysis({
        quarters:getQuarterRows(result.quarterly?.data),
        risk:result.risk?.data || null,
        concentration:result.concentration?.data || null
      });
      setDataUpdatedAt(new Date());
      setReportData(null);
      setReportOpen(false);
    } catch {
      if (request === reviewReloadIdRef.current) setRefreshError(true);
    }
  };

  const requestCardInsights = useCallback(async ({ fingerprint, forceRefresh = false, showLoading = false } = {}) => {
    const quarter = selectedQuarterKey || currentQuarterProgress().key;
    const scope = revenueScope + ':' + quarter;
    if (cardInsightRequestInFlightRef.current && cardInsightRequestScopeRef.current === scope) return false;
    const requestId = ++cardInsightRequestIdRef.current;
    cardInsightRequestScopeRef.current = scope;
    cardInsightRequestInFlightRef.current = true;
    setCardInsightRequestInFlight(true);
    lastAIRequestAtRef.current = Date.now();
    lastAIRequestFingerprintRef.current = fingerprint || latestFiguresFingerprintRef.current;
    if (showLoading) {
      setCardInsightsLoading(true);
      setCardInsightsError('');
    }
    try {
      const result = await adminApi.getRevenueCardInsights(forceRefresh, quarter, revenueScope);
      if (requestId !== cardInsightRequestIdRef.current) return false;
      setCardInsights(result.insights || {});
      setCardSourceLabel(insightLabel(result.source, result.cached));
      setCardInsightGeneratedAt(result.generatedAt || '');
      setCardInsightsNotice(result.availability?.message || '');
      setCardInsightsError('');
      if (forceRefresh) setRefreshRemainingSeconds(30);
      return true;
    } catch (error) {
      if (requestId !== cardInsightRequestIdRef.current) return false;
      setCardInsightsNotice('');
      setCardInsights({});
      setCardSourceLabel('');
      setCardInsightGeneratedAt('');
      setCardInsightsError(error.message || 'AI insights are unavailable.');
      if (forceRefresh) setRefreshRemainingSeconds(Number(error.details?.retryAfterSeconds || 0));
      return false;
    } finally {
      if (requestId === cardInsightRequestIdRef.current) {
        cardInsightRequestInFlightRef.current = false;
        setCardInsightRequestInFlight(false);
        if (showLoading) setCardInsightsLoading(false);
      }
    }
  }, [selectedQuarterKey, revenueScope]);

  useEffect(() => {
    if (!refreshRemainingSeconds) return undefined;
    const timer = window.setInterval(() => {
      setRefreshRemainingSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [refreshRemainingSeconds]);

  useEffect(() => {
    let active = true;
    let refreshTimer = null;
    let refreshInFlight = false;

    const refreshData = async (initial = false) => {
      if (!active || refreshInFlight) return;
      if (!initial && (document.hidden || askAIActiveRef.current)) return;
      const now = Date.now();
      if (!initial && now - lastDataRefreshStartedAtRef.current < 1000) return;
      refreshInFlight = true;
      if (!initial) lastDataRefreshStartedAtRef.current = now;

      try {
        const [result, statsResponse] = await Promise.all([
          adminApi.getRevenueAnalysisData(selectedQuarterKey, revenueScope),
          adminApi.getDashboardStats()
        ]);
        if (!active) return;
        const nextAnalysis = {
          quarters: getQuarterRows(result.quarterly?.data),
          risk: result.risk?.data || null,
          concentration: result.concentration?.data || null
        };
        const nextCollected = Number(statsResponse.data?.collected || 0);
        const nextOutstanding = Number(statsResponse.data?.outstanding || 0);
        const fingerprint = createRevenueFiguresFingerprint({
          analysis: nextAnalysis,
          collectedAmount: nextCollected,
          outstandingAmount: nextOutstanding
        });
        const figuresChanged = Boolean(latestFiguresFingerprintRef.current)
          && fingerprint !== latestFiguresFingerprintRef.current;
        latestFiguresFingerprintRef.current = fingerprint;
        setAnalysis(nextAnalysis);
        setCollectedAmount(nextCollected);
        setOutstandingAmount(nextOutstanding);
        setDataUpdatedAt(new Date());
        setRefreshError(false);
        setLoadError('');

        if (figuresChanged) {
          setCardInsights({});
          setCardSourceLabel('');
          setCardInsightGeneratedAt('');
          setCardInsightsError('');
        }

        if (initial) {
          void requestCardInsights({ fingerprint, showLoading: true });
        } else if (
          fingerprint !== lastAIRequestFingerprintRef.current
          && Date.now() - lastAIRequestAtRef.current >= 5 * 60 * 1000
        ) {
          void requestCardInsights({ fingerprint, forceRefresh: true });
        }
      } catch (error) {
        if (!active) return;
        if (initial) {
          setLoadError(error.message || 'Revenue analysis could not be loaded.');
          setCardInsightsLoading(false);
        } else {
          setRefreshError(true);
        }
      } finally {
        refreshInFlight = false;
        if (active && initial) setIsLoading(false);
      }
    };

    const stopRefreshTimer = () => {
      if (refreshTimer !== null) {
        window.clearInterval(refreshTimer);
        refreshTimer = null;
      }
    };
    const startRefreshTimer = () => {
      if (refreshTimer === null && !document.hidden) {
        refreshTimer = window.setInterval(() => { void refreshData(); }, 60 * 1000);
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopRefreshTimer();
        return;
      }
      startRefreshTimer();
      void refreshData();
    };
    const onWindowFocus = () => {
      if (!document.hidden) void refreshData();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);
    startRefreshTimer();
    void refreshData(true);

    return () => {
      active = false;
      stopRefreshTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [requestCardInsights, revenueScope, selectedQuarterKey]);

  const todayQuarter = currentQuarterProgress();
  const quarters = useMemo(
    () => {
      const filled = fillQuarterGaps(analysis.quarters, {
      year: Number(todayQuarter.key.slice(0, 4)),
      quarter: Number(todayQuarter.key.slice(-1))
      });
      const selected = {year:Number(selectedQuarterKey.slice(0,4)),quarter:Number(selectedQuarterKey.slice(-1)),revenue:0,count:0};
      if (!filled.some(row => row.year === selected.year && row.quarter === selected.quarter)) filled.push(selected);
      return filled.sort((a,b) => a.year-b.year || a.quarter-b.quarter);
    },
    [analysis.quarters, todayQuarter.key, selectedQuarterKey]
  );
  const matchingQuarterIndex = quarters.findIndex((row) => `${row.year}-Q${row.quarter}` === selectedQuarterKey);
  useEffect(() => {
    const tabs = quarterTabsRef.current;
    const activeTab = tabs?.querySelector('[aria-selected="true"]');
    if (!activeTab) return;
    const bounds = tabs.getBoundingClientRect();
    const activeBounds = activeTab.getBoundingClientRect();
    if (activeBounds.right > bounds.right) tabs.scrollLeft += activeBounds.right - bounds.right + 4;
    else if (activeBounds.left < bounds.left) tabs.scrollLeft -= bounds.left - activeBounds.left + 4;
  }, [selectedQuarterKey, quarters.length, analysis.quarters.length]);
  const currentQuarterIndex = quarters.findIndex((row) => `${row.year}-Q${row.quarter}` === todayQuarter.key);
  const selectedIndex = matchingQuarterIndex >= 0
    ? matchingQuarterIndex
    : currentQuarterIndex >= 0
      ? currentQuarterIndex
      : Math.max(quarters.length - 1, 0);
  const current = quarters[selectedIndex];
  const previous = quarters[selectedIndex - 1];
  const yearAgo = current && quarters.find((row) => row.year === current.year - 1 && row.quarter === current.quarter);
  const qoq = current?.count && previous?.count ? percentChange(current.revenue, previous.revenue) : null;
  const yoy = current?.count && yearAgo?.count ? percentChange(current.revenue, yearAgo.revenue) : null;
  const coverage = analysis.concentration?.coverage;
  const estimate = analysis.risk?.officialForecast || null;
  const chartEstimate = estimate;
  const currentQuarterKey = todayQuarter.key;
  const categoryItems = useMemo(
    () => normalizeContributors(analysis.risk?.riskByCategory || analysis.risk?.byCategory, (item) => item?._id),
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
      setReportData(null);
      try {
        const response = await adminApi.getScopedRevenue(selectedQuarterKey, revenueScope);
        if (active) setReportData({
          rows: (response.data?.reportRecords || []).map(mapBusinessRecord),
          concentration: response.data?.concentration
        });
      } catch (error) {
        if (active) setReportError(error.message || 'Business records could not be loaded.');
      } finally {
        if (active) setIsReportLoading(false);
      }
    };
    loadRecords();
    return () => { active = false; };
  }, [reportOpen, reportQuarterNumber, reportYear, selectedQuarterKey, revenueScope]);

  const reportRows = reportData?.rows || [];
  const reportConcentration = reportData?.concentration;
  const reportCoverage = reportConcentration?.coverage;
  const reportIndicators = reportConcentration?.indicators;
  const reportTotal = reportRows.reduce((sum, row) => sum + row.amount, 0);
  const reportCardPageSize = 20;
  const reportCardTotalPages = Math.max(1, Math.ceil(reportRows.length / reportCardPageSize));
  const visibleReportCards = reportRows.slice((reportCardPage - 1) * reportCardPageSize, reportCardPage * reportCardPageSize);
  const reportPaid = reportRows.filter((row) => ['paid', 'completed'].includes(row.status.toLowerCase()))
    .reduce((sum, row) => sum + row.amount, 0);
  const reportOutstanding = reportTotal - reportPaid;
  const selectedAnalysis = modalId === 'risk'
    ? { title: 'Revenue risk by category · ' + scopeLabel, items: categoryItems }
    : modalId === 'concentration'
      ? { title: 'Revenue concentration · ' + scopeLabel, items: contributorItems }
      : { title: 'Service type concentration · ' + scopeLabel, items: serviceItems };
  const indicators = analysis.risk?.indicators || {};
  const overallRisk = analysis.risk?.overallRisk || {
    level: 'Not enough data',
    reason: isLoading ? 'Loading concentration figures…' : 'Concentration figures could not be loaded.'
  };
  const concentration = analysis.concentration;
  const unavailableReason = concentration?.unavailableReason;
  const contributorCoverage = classifiedCoverage(concentration?.classification?.contributors, concentration?.totalRevenue);
  const categoryCoverage = classifiedCoverage(concentration?.classification?.categories, concentration?.totalRevenue);
  const metrics = concentration?.indicators;
  const overallRiskWhy = metrics?.hhi != null
    ? `HHI ${metrics.hhi} · Top contributor ${metrics.topOneShare}% · Top three ${metrics.topThreeShare}%`
    : unavailableReason || overallRisk.reason;
  const selectedTier = modalId === 'risk'
    ? overallRisk.level
    : modalId === 'concentration'
      ? indicators.concentrationHhi?.level || 'Not enough data'
      : indicators.topContributorShare?.level || 'Not enough data';
  const selectedTop = selectedAnalysis.items[0];
  const topContributorIndicator = indicators.topContributorShare;
  const getRiskWhy = (key, fallback) => {
    const indicator = indicators[key];
    if (indicator?.reason) return indicator.reason;
    if (!indicator || indicator.level === 'Not enough data') {
      if (key === 'concentrationHhi' || key === 'topContributorShare') return overallRiskWhy;
      return `Fewer than ${riskThresholds.minimumCompletedQuarters} completed quarters are available.`;
    }
    if (key === 'qoqChange') return `completed-quarter revenue changed ${signedPercent(indicator.value)}.`;
    if (key === 'concentrationHhi') return `HHI is ${Number(indicator.value).toFixed(3)}.`;
    if (key === 'topContributorShare') return `${indicator.contributor || 'The top contributor'} represents ${Number(indicator.value).toFixed(1)}% of categorized revenue.`;
    if (key === 'forecastVsFourQuarterAverage') return `the official forecast is ${signedPercent(indicator.value)} versus the four-quarter average.`;
    return fallback;
  };
  const cardDetails = [
    {
      id: 'risk',
      title: 'Revenue risk by category · ' + scopeLabel,
      icon: '✣',
      items: categoryItems,
      riskLevel: overallRisk.level,
      why: overallRiskWhy,
      description: categoryCoverage ? 'By known category · ' + categoryCoverage : 'Category coverage is unavailable.'
    },
    {
      id: 'concentration',
      title: 'Revenue concentration · ' + scopeLabel,
      icon: '●',
      items: contributorItems,
      riskLevel: indicators.concentrationHhi?.level || 'Not enough data',
      why: getRiskWhy('concentrationHhi'),
      description: overallRiskWhy
    },
    ...(serviceItems.length ? [{
      id: 'service',
      title: 'Service type concentration · ' + scopeLabel,
      icon: '⌁',
      items: serviceItems,
      riskLevel: topContributorIndicator?.level || 'Not enough data',
      why: getRiskWhy('topContributorShare'),
      description: `${serviceItems[0].share.toFixed(1)}% from ${serviceItems[0].name}`
    }] : [])
  ];
  const refreshCardInsights = async () => {
    if (cardInsightRequestInFlightRef.current) return;
    await requestCardInsights({
      fingerprint: latestFiguresFingerprintRef.current,
      forceRefresh: true,
      showLoading: true
    });
  };

  const renderCardInsight = (cardKey) => {
    const updatedAt = cardInsightGeneratedAt
      ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(cardInsightGeneratedAt))
      : '';
    return <section className="ai-revenue-modal-insight" aria-label="AI insight">
      <div className="ai-revenue-modal-insight__header">
        <h3>AI insight</h3>
        <span>{cardSourceLabel}{updatedAt && ` · Updated ${updatedAt}`}</span>
      </div>
      {!cardInsightsLoading && !cardInsights[cardKey]?.summary ? <p role="status">{cardInsightsError || 'No insight available.'}</p> : <RevenueCardInsights
        insights={cardInsights[cardKey]}

        isLoading={cardInsightsLoading}
      />}
    </section>;
  };

  return <>
  <section className="ai-revenue-analysis" aria-labelledby="ai-revenue-title">
    <div className="ai-revenue-analysis__header">
      <div className="ai-revenue-analysis__title"><span className="ai-revenue-analysis__mark">✦</span><div><h2 id="ai-revenue-title">Revenue Analysis</h2><p>Revenue trends, concentration risk, and forecasts</p>{dataUpdatedAt && <small className="ai-revenue-analysis__updated">Updated {dataUpdatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>}{refreshError && <small className="ai-revenue-analysis__refresh-error" role="status">Could not refresh</small>}</div></div>
      <div className="ai-revenue-toolbar">
        <button type="button" className="ai-revenue-toolbar__action" onClick={() => setSettingsOpen(true)}>ⓘ Risk thresholds</button>
        <button type="button" className="ai-revenue-toolbar__action" onClick={() => { setReportCardPage(1); setReportOpen(true); }}>⬇ Export report</button>
      </div>
    </div>
    <div className="ai-revenue-overall-risk">
      <div className="ai-revenue-overall-risk__heading">
        <div className="ai-revenue-overall-risk__title">
          <strong>Concentration risk — {scopeLabel}</strong>
          <button
            type="button"
            className="ai-revenue-overall-risk__info"
            aria-label="Show revenue risk thresholds"
            aria-haspopup="dialog"
            onClick={() => setSettingsOpen(true)}
          >i</button>
        </div>
        <div className="ai-revenue-tabs ai-revenue-scope" role="group" aria-label="Revenue concentration scope">
          <button type="button" aria-pressed={revenueScope === 'selectedQuarter'} onClick={() => changeRevenueScope(selectedQuarterKey, 'selectedQuarter')}>Selected quarter</button>
          <button type="button" aria-pressed={revenueScope === 'allRecords'} onClick={() => changeRevenueScope(selectedQuarterKey, 'allRecords')}>All records</button>
        </div>
      </div>
      <span className={`ai-revenue-overall-risk__chip is-${['Normal', 'Moderate', 'High'].includes(overallRisk.level) ? overallRisk.level.toLowerCase() : 'unknown'}`}>
        {overallRisk.level === 'Not enough data' ? 'Unrated' : overallRisk.level}
      </span>
      <p className="ai-revenue-overall-risk__why">{overallRiskWhy}</p>
      <ContributorList key={revenueScope + ':' + selectedQuarterKey} concentration={analysis.concentration} />
      {contributorCoverage && <p className="ai-revenue-overall-risk__why">By known contributor · {contributorCoverage}</p>}
      {concentration?.salesMix && <details className="ai-revenue-breakdown">
        <summary>Product mix and data coverage</summary>
        <ProductRevenueSummary concentration={concentration} />
      </details>}
    </div>

    {analysis.quarters.length > 0 && (
      <div ref={quarterTabsRef} className="ai-revenue-tabs" role="tablist" aria-label="Revenue analysis quarter">
        {quarters.map((row, index) => {
          const key = `${row.year}-Q${row.quarter}`;
          return <button type="button" role="tab" aria-selected={selectedIndex === index} className={selectedIndex === index ? 'is-active' : ''} key={key} onClick={() => {
            changeRevenueScope(key);
          }}>{quarterLabel(row.year, row.quarter)}</button>;
        })}
      </div>
    )}
    <div className="ai-revenue-completeness-banner">
      <div className="ai-revenue-completeness-banner__copy" role="status" aria-label="Revenue data completeness">
        <strong>Quarter for review: {selectedQuarterKey.replace('-', ' ')} · {selectedQuarterKey === todayQuarter.key
          ? 'In progress (' + todayQuarter.percent + '% elapsed)' : selectedQuarterKey < todayQuarter.key ? 'Closed quarter' : 'Future quarter'}</strong>
        {coverage && <span>
          {revenueScope === 'allRecords' && 'All records · '}
          {coverage.empty ? 'No recorded transactions' : coverage.includedTransactions + ' included transactions'}
          {coverage.firstRecordedDate && ' · ' + coverage.firstRecordedDate}
          {coverage.lastRecordedDate !== coverage.firstRecordedDate && ' to ' + coverage.lastRecordedDate}
          {revenueScope === 'allRecords' && !coverage.empty && ' · ' + recordedPeso.format(analysis.concentration.totalRevenue) + ' recorded'}
        </span>}
        <span>{coverage?.notice || 'Coverage is unverified. Missing records may affect comparisons.'}
          {coverage?.confirmedZeroSales === true && ' Zero sales confirmed for all three months.'}</span>
      </div>
      <button type="button" className="ai-revenue-toolbar__action" aria-expanded={reviewOpen} aria-controls="revenue-quarter-review"
        onClick={() => setReviewOpen(open => !open)}>{reviewOpen ? 'Close review' : 'Review quarter'}</button>
    </div>
    <div id="revenue-quarter-review" hidden={!reviewOpen}>
      <QuarterCompletenessReview key={selectedQuarterKey} selectedQuarter={selectedQuarterKey} onQuarterChange={changeRevenueScope} onReviewed={refreshAfterReview} revision={dataUpdatedAt?.getTime()} />
    </div>

    {isLoading ? <p className="ai-revenue-empty" role="status">Loading revenue analysis…</p>
      : loadError ? <p className="ai-revenue-report__error" role="alert">{loadError}</p>
        : <>
            <div className="ai-revenue-summary">
              <ScopedRevenueFigures concentration={analysis.concentration} qoq={qoq} yoy={yoy} />
              {analysis.quarters.length === 0 ? <p className="ai-revenue-empty" role="status">No quarterly revenue data is available yet.</p> : <div className="ai-revenue-summary__chart">
                <QuarterlyBarChart
                  quarters={quarters}
                  estimate={chartEstimate}
                  selectedKey={`${current.year}-Q${current.quarter}`}
                  currentKey={currentQuarterKey}
                />
                {chartEstimate
                  ? <><p className="ai-revenue-estimate-note">{chartEstimate.targetLabel}: {peso.format(chartEstimate.expected)} · likely {peso.format(chartEstimate.low)} to {peso.format(chartEstimate.high)}</p><div className="ai-revenue-estimate-legend"><span><i className="is-actual" />Actual</span><span><i className="is-estimate" />Forecast</span><span>Current quarter is marked in progress</span></div></>
                  : <p className="ai-revenue-estimate-note">Estimate needs at least {riskThresholds.minimumCompletedQuarters} quarters of data. {analysis.quarters.length} available.</p>}
              </div>}
            </div>
          </>}
    {!isLoading && !loadError && analysis.quarters.length > 0 && <>
            <details className="ai-revenue-collection-details">
              <summary>Collection status · all records</summary>
              <div className="ai-revenue-collected-row">
                <div><span>Collected · all records</span><strong>{peso.format(collectedAmount)}</strong></div>
                <div><span>Outstanding · all records</span><strong>{peso.format(outstandingAmount)}</strong></div>
                <div><span>Collection</span><strong>{collectedAmount + outstandingAmount ? Math.round(collectedAmount / (collectedAmount + outstandingAmount) * 100) : 0}%</strong></div>
              </div>
            </details>
            <div className="ai-revenue-insights-toolbar">
              <span role="status">
                {cardSourceLabel}
                {cardInsightsNotice && (' · ' + cardInsightsNotice)}
                {cardInsightsError ? ' · Insights unavailable.' : ''}
                {cardInsightGeneratedAt && ` · Updated ${new Intl.DateTimeFormat('en-PH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(cardInsightGeneratedAt))}`}
              </span>
              <button type="button" className="ai-revenue-toolbar__action" onClick={refreshCardInsights} disabled={cardInsightsLoading || cardInsightRequestInFlight || refreshRemainingSeconds > 0}>
                {refreshRemainingSeconds > 0 ? `Refresh insights (${refreshRemainingSeconds}s)` : 'Refresh insights'}
              </button>
            </div>
              {refreshRemainingSeconds > 0 && <p role="status">Please wait before refreshing revenue insights again.</p>}
              <div className="ai-revenue-cards">
              <div className="ai-revenue-card" role="button" tabIndex={0} onClick={() => openAnalysis('trend')} onKeyDown={(event) => handleCardKeyDown(event, 'trend')}>
                <div className="ai-revenue-card__top"><span className="ai-revenue-card__heading"><span className="ai-revenue-card__icon">↗</span><strong className="ai-revenue-card__title">Revenue trend &amp; growth · all-records history</strong></span><RiskChip level={indicators.qoqChange?.level || 'Not enough data'} why={getRiskWhy('qoqChange')} /></div>
                <b>{peso.format(current.revenue)}</b>
                <small>Coverage unverified; recorded-revenue comparisons only. {yoy === null ? 'YoY comparison unavailable' : `${signedPercent(yoy)} vs same quarter last year`}</small>
                <a className="ai-revenue-card__view" href="#trend-analysis" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openAnalysis('trend'); }}>View analysis <span aria-hidden="true">›</span></a>
              </div>
              {cardDetails.map((card) => {
                return <div className="ai-revenue-card" role="button" tabIndex={0} key={card.id} onClick={() => openAnalysis(card.id)} onKeyDown={(event) => handleCardKeyDown(event, card.id)}>
                  <div className="ai-revenue-card__top"><span className="ai-revenue-card__heading"><span className="ai-revenue-card__icon">{card.icon}</span><strong className="ai-revenue-card__title">{card.title}</strong></span><RiskChip level={card.riskLevel} why={card.why} /></div>
                  <b>{card.items.length ? `${card.items[0].share.toFixed(1)}% from ${card.items[0].name}` : 'No data'}</b>
                  <small>{card.description}</small>
                  <a className="ai-revenue-card__view" href={`#${card.id}-analysis`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openAnalysis(card.id); }}>View analysis <span aria-hidden="true">›</span></a>
                </div>;
              })}
              <div className="ai-revenue-card" role="button" tabIndex={0} onClick={() => openAnalysis('estimate')} onKeyDown={(event) => handleCardKeyDown(event, 'estimate')}>
                <div className="ai-revenue-card__top"><span className="ai-revenue-card__heading"><span className="ai-revenue-card__icon">◌</span><strong className="ai-revenue-card__title">{estimate?.targetLabel || 'Quarterly forecast'}</strong></span><RiskChip level={indicators.forecastVsFourQuarterAverage?.level || 'Not enough data'} why={getRiskWhy('forecastVsFourQuarterAverage')} /></div>
                <b>{estimate ? `${peso.format(estimate.expected)} expected` : 'Limited history'}</b>
                <small>{estimate ? `Likely range ${peso.format(estimate.low)} to ${peso.format(estimate.high)}` : `At least ${riskThresholds.minimumCompletedQuarters} completed quarters are required.`}</small>
                <a className="ai-revenue-card__view" href="#estimate-analysis" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openAnalysis('estimate'); }}>View analysis <span aria-hidden="true">›</span></a>
              </div>
            </div>
            {(analysis.risk?.completedQuarterCount || 0) < riskThresholds.minimumCompletedQuarters && <p className="ai-revenue-empty" role="status">Fewer than {riskThresholds.minimumCompletedQuarters} completed quarters are available. The quarterly trend is shown; the forecast will appear after more data is recorded.</p>}
          </>}

    {settingsOpen && <AdminModalPortal><div className="ai-revenue-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
      <section className="ai-revenue-modal ai-revenue-settings" role="dialog" aria-modal="true" aria-labelledby="ai-thresholds-title">
        <header className="ai-revenue-modal__header">
          <div><p className="ai-revenue-modal__eyebrow">Reference</p><h2 id="ai-thresholds-title">Risk thresholds</h2></div>
          <button type="button" className="ai-revenue-modal__close" aria-label="Close thresholds" onClick={() => setSettingsOpen(false)}>×</button>
        </header>
        <div className="ai-revenue-modal__body">
          <div className="ai-revenue-thresholds__reference">
            <p><strong>Quarter-over-quarter change:</strong> Normal ≥ {riskThresholds.qoqChange.normalMin}%; Moderate {qoqModerateRange}%; High &lt; {riskThresholds.qoqChange.moderateMin}%.</p>
            <p><strong>Concentration (HHI):</strong> Normal &lt; {riskThresholds.concentrationHhi.normalMaxExclusive}; Moderate {hhiModerateRange}; High &gt; {riskThresholds.concentrationHhi.moderateMaxInclusive}.</p>
            <p><strong>Top contributor share:</strong> Normal &lt; {riskThresholds.topContributorShare.normalMaxExclusive}%; Moderate {contributorModerateRange}; High &gt; {riskThresholds.topContributorShare.moderateMaxInclusive}%.</p>
            <p><strong>Forecast vs. last four completed-quarter average:</strong> Normal ≥ {riskThresholds.forecastVsFourQuarterAverage.normalMin}%; Moderate {forecastModerateRange}; High &lt; {riskThresholds.forecastVsFourQuarterAverage.moderateMin}%.</p>
            <p>The concentration badge uses the higher of the HHI and top contributor risk levels. Both use revenue attributed to classified contributors. Category shares use revenue with a known category.</p>
          </div>
        </div>
        <div className="ai-revenue-modal__footer">
          <button type="button" className="ai-revenue-settings__primary" onClick={() => setSettingsOpen(false)}>Close</button>
        </div>
      </section>
    </div></AdminModalPortal>}

    {reportOpen && reportYear && reportQuarterNumber && <AdminModalPortal><div className="ai-revenue-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportOpen(false); }}>
      <section className="ai-revenue-modal ai-revenue-report" role="dialog" aria-modal="true" aria-labelledby="ai-report-title">
        <header className="ai-revenue-modal__header">
          <div><p className="ai-revenue-modal__eyebrow">Export</p><h2 id="ai-report-title">Recorded revenue — {scopeLabel}</h2></div>
          <button type="button" className="ai-revenue-modal__close" aria-label="Close report" onClick={() => setReportOpen(false)}>×</button>
        </header>
        <div className="ai-revenue-modal__body">
        <div className="ai-revenue-report__summary">
          {reportCoverage && <span>{reportCoverage.includedTransactions ?? 0} included transactions · {reportCoverage.firstRecordedDate || 'No recorded dates'} to {reportCoverage.lastRecordedDate || '—'} · {reportCoverage.completeness === 'reviewed' ? 'Closed quarter reviewed by Admin' : 'Completeness unknown'}{reportCoverage.quarterInProgress ? '; quarter still in progress' : ''}. {reportCoverage.notice}</span>}
          <strong>{scopeLabel} · same records as concentration</strong>
          <ProductRevenueSummary concentration={reportConcentration} />
          {reportIndicators?.hhi != null && <span>Leading contributor: {reportConcentration.contributors[0]?.name} · Top one {reportIndicators.topOneShare}% · Top three {reportIndicators.topThreeShare}% · HHI {reportIndicators.hhi} · {reportIndicators.concentrationLevel}</span>}
          <span>Generated {new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })} · Total: {peso.format(reportTotal)} ({peso.format(reportPaid)} paid, {peso.format(reportOutstanding)} outstanding)</span>
          {reportError && <span className="ai-revenue-report__error" role="alert">{reportError}</span>}
        </div>
        <div className="ai-revenue-report-card-list" aria-label="Business record cards">
          {isReportLoading
            ? <p className="ai-revenue-report-card-state" role="status">Loading business records…</p>
            : reportRows.length
              ? visibleReportCards.map((row) => <article className="ai-revenue-report-card" key={`${row.id}-${row.date}`}>
                <div className="ai-revenue-report-card__top">
                  <strong>{row.customer}</strong>
                  <div><span className={`transaction-type-badge ${row.type === 'Service' ? 'is-service' : 'is-item'}`}>{row.type}</span><span className="status-badge">{row.status}</span></div>
                </div>
                <p className="ai-revenue-report-card__items" title={row.items}>{row.items}</p>
                <div className="ai-revenue-report-card__details"><span>{row.date}</span><span title={`Full record ID: ${row.id}`}>ID {row.id.length > 12 ? row.id.slice(-8) : row.id}</span>{row.mechanic !== '—' && <span>Mechanic: {row.mechanic}</span>}</div>
                <strong className="ai-revenue-report-card__amount">Amount {peso.format(row.amount)}</strong>
              </article>)
              : <p className="ai-revenue-report-card-state" role={reportError ? 'alert' : 'status'}>{reportError ? 'Business records could not be loaded.' : 'No business records for this period.'}</p>}
        </div>
        {!isReportLoading && reportRows.length > reportCardPageSize && <nav className="ai-revenue-report-card-pagination" aria-label="Business record card pagination">
          <button type="button" disabled={reportCardPage === 1} onClick={() => setReportCardPage((page) => page - 1)}>Previous</button>
          <span>Page {reportCardPage} of {reportCardTotalPages}</span>
          <button type="button" disabled={reportCardPage >= reportCardTotalPages} onClick={() => setReportCardPage((page) => page + 1)}>Next</button>
        </nav>}
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
        </div>
        <div className="ai-revenue-modal__footer ai-revenue-settings__actions--report"><button type="button" className="ai-revenue-settings__primary" onClick={() => window.print()} disabled={!reportRows.length}>Print / Save as PDF</button></div>
      </section>
    </div></AdminModalPortal>}

    {modalId && modalId !== 'risk' && modalId !== 'concentration' && modalId !== 'service' && <AdminModalPortal><div className="ai-revenue-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalId(null); }}>
      <section className="ai-revenue-modal" role="dialog" aria-modal="true" aria-labelledby="ai-analysis-modal-title">
        <header className="ai-revenue-modal__header">
          <div><p className="ai-revenue-modal__eyebrow">{quarterName(current.year, current.quarter)} analysis</p><h2 id="ai-analysis-modal-title">{modalId === 'estimate' ? 'Quarterly forecast' : 'Revenue trend & growth'}</h2></div>
          <button type="button" className="ai-revenue-modal__close" aria-label="Close analysis" onClick={() => setModalId(null)}>×</button>
        </header>
        <div className="ai-revenue-modal__body">
          <strong className="ai-revenue-modal__headline">{modalId === 'estimate' ? estimate ? `${peso.format(estimate.expected)} estimate for ${estimate.target}` : 'Limited history' : `${peso.format(current.revenue)} revenue`}</strong>
          <p className="ai-revenue-modal__detail">{modalId === 'estimate' ? estimate ? `Likely range: ${peso.format(estimate.low)} to ${peso.format(estimate.high)}.` : `At least ${riskThresholds.minimumCompletedQuarters} quarters are needed for an estimate.` : `QoQ change: ${signedPercent(qoq)} · YoY change: ${signedPercent(yoy)}`}</p>
          <QuarterlyBarChart quarters={quarters.slice(0, selectedIndex + 1)} estimate={estimate} selectedKey={`${current.year}-Q${current.quarter}`} currentKey={currentQuarterKey} />
          <div className="ai-revenue-callout is-normal">Estimate is a simple planning aid based on average observed quarter-over-quarter growth, not a target.</div>
          {renderCardInsight(modalId === 'estimate' ? 'forecast' : 'trend')}
        </div>
      </section>
    </div></AdminModalPortal>}

    {(modalId === 'risk' || modalId === 'concentration' || modalId === 'service') && <AdminModalPortal><div className="ai-revenue-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalId(null); }}>
      <section className="ai-revenue-modal" role="dialog" aria-modal="true" aria-labelledby="ai-risk-modal-title">
        <header className="ai-revenue-modal__header">
          <div><p className="ai-revenue-modal__eyebrow">Revenue risk</p><h2 id="ai-risk-modal-title">{selectedAnalysis.title}</h2></div>
          <button type="button" className="ai-revenue-modal__close" aria-label="Close analysis" onClick={() => setModalId(null)}>×</button>
        </header>
        <div className="ai-revenue-modal__body">
          {selectedAnalysis.items.length ? <>
            <div className="ai-revenue-tier-tabs">{['Normal', 'Moderate', 'High'].map((tier) => <span className={selectedTier === tier ? 'is-active' : ''} key={tier}>{tier}</span>)}</div>
            <div className={`ai-revenue-callout is-${selectedTier.toLowerCase()}`}><strong>{selectedTier} concentration</strong><span>{selectedTop?.name} contributes {selectedTop?.share.toFixed(1)}% of the displayed revenue mix.</span></div>
            <HorizontalBars items={selectedAnalysis.items} />
            <div className="ai-revenue-thresholds__note">Threshold reference: Normal &lt; {riskThresholds.topContributorShare.normalMaxExclusive}%; Moderate through {riskThresholds.topContributorShare.moderateMaxInclusive}%; High above {riskThresholds.topContributorShare.moderateMaxInclusive}%.</div>
          </> : <p className="ai-revenue-empty">{modalId === 'risk' && categoryCoverage ? 'By known category · ' + categoryCoverage : overallRiskWhy}</p>}
          {renderCardInsight(modalId)}
        </div>
      </section>
    </div></AdminModalPortal>}
  </section>
  <AskRevenueAIPanel key={revenueScope + ':' + selectedQuarterKey} selectedQuarter={current ? current.year + '-Q' + current.quarter : null} revenueScope={revenueScope} onActivityChange={onAskActivityChange} />
  </>;
}

export default AIRevenueAnalysis;
