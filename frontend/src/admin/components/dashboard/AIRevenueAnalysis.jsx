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
    <span className="ai-revenue-risk__info" tabIndex={0} title={why ? `${why}\n${riskThresholdTooltip}` : riskThresholdTooltip} aria-label={`Risk thresholds. ${riskThresholdTooltip.replaceAll('\n', ' ')}`}>i</span>
  </span>;
}

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

function getOverallRiskWhy(overallRisk, indicators) {
  if (overallRisk.level === 'Normal') return 'All indicators are within the normal range.';
  if (!['Moderate', 'High'].includes(overallRisk.level)) {
    return overallRisk.reason || 'Not enough data to calculate overall risk.';
  }

  const indicatorLabels = {
    qoqChange: { reason: 'quarter-over-quarter change', label: 'quarter-over-quarter change' },
    concentrationHhi: { reason: 'revenue concentration (HHI)', label: 'revenue concentration (HHI)' },
    topContributorShare: { reason: 'top contributor share', label: 'top contributor share' },
    forecastVsFourQuarterAverage: {
      reason: 'forecast versus the four-quarter average',
      label: 'forecast vs average of the last 4 completed quarters'
    }
  };
  const driver = Object.entries(indicatorLabels)
    .find(([key, detail]) => overallRisk.reason === detail.reason
      && Number.isFinite(Number(indicators[key]?.value)));
  if (!driver) return overallRisk.reason ? `Driven by: ${overallRisk.reason}` : 'Risk driver is unavailable.';

  const [key, detail] = driver;
  const value = Number(indicators[key].value);
  const sign = ['qoqChange', 'forecastVsFourQuarterAverage'].includes(key) && value > 0 ? '+' : '';
  const formattedValue = key === 'concentrationHhi'
    ? value.toFixed(3)
    : `${sign}${Number.isInteger(value) ? value : Number(value.toFixed(1))}%`;
  return `Driven by: ${detail.label} (${formattedValue})`;
}

function getLocalCardInsightTemplates({ current, indicators, overallRisk, concentration, serviceItems, estimate }) {
  const hasNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const formatPercent = (value) => hasNumber(value) ? `${Number(value).toFixed(1)}%` : null;
  const briefName = (value) => {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    return words.length > 5 ? `${words.slice(0, 5).join(' ')}…` : words.join(' ');
  };
  const qoq = indicators.qoqChange;
  const hhi = concentration?.indicators?.hhi;
  const topShare = indicators.topContributorShare?.value;
  const topService = serviceItems[0];
  const forecastChange = indicators.forecastVsFourQuarterAverage?.value;
  const forecastLevel = indicators.forecastVsFourQuarterAverage?.level || 'Not enough data';
  const serviceName = briefName(topService?.name);
  const levelByCard = {
    trend: qoq?.level || 'Not enough data',
    risk: overallRisk.level || 'Not enough data',
    concentration: indicators.concentrationHhi?.level || 'Not enough data',
    service: indicators.topContributorShare?.level || 'Not enough data',
    forecast: forecastLevel
  };
  const summaryByCard = {
    trend: qoq && hasNumber(qoq.value)
      ? `Completed-quarter revenue changed ${formatPercent(qoq.value)}; the risk level is ${levelByCard.trend}.`
      : `Revenue for ${current ? quarterName(current.year, current.quarter) : 'the selected quarter'} is ${peso.format(current?.revenue || 0)}; quarter-over-quarter change is unavailable.`,
    risk: overallRisk.reason
      ? `Overall revenue risk is ${overallRisk.level}, driven by ${briefName(overallRisk.reason)}.`
      : `Overall revenue risk is ${overallRisk.level || 'Not enough data'}.`,
    concentration: hasNumber(hhi) && hasNumber(topShare)
      ? `Revenue concentration HHI is ${Number(hhi).toFixed(3)}, and the top contributor share is ${formatPercent(topShare)}.`
      : 'Not enough data yet to describe revenue concentration.',
    service: topService && formatPercent(topService.share)
      ? `${serviceName} is the leading service contributor at ${formatPercent(topService.share)} of categorized revenue.`
      : 'Not enough data yet to describe service revenue contribution.',
    forecast: hasNumber(forecastChange) && estimate?.targetLabel && hasNumber(estimate.expected)
      ? `The official forecast for ${briefName(estimate.targetLabel)} is ${peso.format(estimate.expected)}, ${formatPercent(forecastChange)} versus the four-quarter average (${forecastLevel} risk).`
      : 'Not enough data yet to compare the official forecast with the four-quarter average.'
  };
  const recommendations = {
    trend: {
      High: 'Compare the last two completed-quarter totals and revise promotions after the revenue decline.',
      Moderate: 'Review completed-quarter revenue monthly and adjust promotions if the change persists.',
      Normal: 'Keep effective promotions in place and verify revenue at the next quarter close.',
      default: 'Record more completed-quarter sales before changing the promotion plan.'
    },
    risk: {
      High: `Review ${briefName(overallRisk.reason || 'the leading risk driver')} and set a corrective pricing or promotion action.`,
      Moderate: `Check ${briefName(overallRisk.reason || 'the leading risk driver')} and choose one targeted sales-mix adjustment.`,
      Normal: 'Review pricing and promotion results before setting the next quarterly sales plan.',
      default: 'Complete revenue risk records before choosing a corrective shop action.'
    },
    concentration: {
      High: 'Promote a secondary revenue category and review the leading contributor’s sales mix.',
      Moderate: 'Run a focused promotion for a smaller category and compare its revenue share.',
      Normal: 'Review category performance and retain the offers supporting a balanced revenue mix.',
      default: 'Complete category revenue records before planning a sales-mix promotion.'
    },
    service: {
      High: serviceName ? `Review staffing and pricing for ${serviceName} before taking additional service bookings.` : 'Compare completed service jobs with shop capacity before adjusting staffing.',
      Moderate: serviceName ? `Check booking capacity for ${serviceName} and test a focused service promotion.` : 'Compare completed service jobs with available capacity before promoting services.',
      Normal: serviceName ? `Keep ${serviceName} visible in the booking menu and review its completed jobs.` : 'Review completed service jobs before changing the service booking menu.',
      default: 'Record completed service jobs before changing staffing or service promotions.'
    },
    forecast: {
      High: 'Review the next-quarter promotion and purchasing plan against the official forecast comparison.',
      Moderate: 'Use the official forecast comparison to revise the next-quarter sales plan.',
      Normal: 'Align the next-quarter staffing plan with the official forecast comparison.',
      default: 'Record more completed quarters before revising the next-quarter shop plan.'
    }
  };
  const outcomes = {
    trend: {
      High: ['Responding to the decline may stabilize quarter-over-quarter revenue momentum.', 'Ignoring the decline could prolong weaker completed-quarter sales.'],
      Moderate: ['Adjusting promotions may support revenue recovery if the change continues.', 'Overlooking the change could delay a response to shifting sales.'],
      Normal: ['Maintaining effective promotions may preserve the current revenue trend.', 'Unnecessary promotion changes could disrupt a stable sales pattern.']
    },
    risk: {
      High: ['Addressing the leading driver may reduce pressure on overall revenue stability.', 'Ignoring the leading driver could leave the current risk unresolved.'],
      Moderate: ['A targeted response may keep the overall risk from increasing.', 'Delaying a response could allow the identified risk to grow.'],
      Normal: ['Reviewing shop pricing and promotions may help preserve stable revenue.', 'Skipping the review could leave new risk signals unnoticed.']
    },
    concentration: {
      High: ['Promoting another category may reduce dependence on the leading contributor.', 'Ignoring the imbalance could keep revenue concentrated in one contributor.'],
      Moderate: ['A secondary-category promotion may gradually broaden the revenue mix.', 'Ignoring the mix could preserve the current contributor imbalance.'],
      Normal: ['Maintaining balanced category offers may support revenue diversity.', 'Changing balanced offers without evidence could weaken the current mix.']
    },
    service: {
      High: ['Adjusting service capacity may improve availability for customer bookings.', 'Ignoring capacity pressure could limit service availability.'],
      Moderate: ['A focused service promotion may help align bookings with shop capacity.', 'Leaving service demand unchecked could create scheduling mismatches.'],
      Normal: ['Keeping the leading service available may sustain its contribution.', 'Removing attention from it could reduce booking visibility.']
    },
    forecast: {
      High: ['Revising the shop plan may better prepare for the projected revenue gap.', 'Ignoring the comparison could leave the next-quarter plan misaligned.'],
      Moderate: ['Using the forecast comparison may improve next-quarter planning.', 'Ignoring the comparison could weaken planning readiness.'],
      Normal: ['Aligning staffing with the projection may support steady operations.', 'Ignoring the projection could leave staffing plans less prepared.']
    }
  };
  const hasData = {
    trend: Boolean(qoq && hasNumber(qoq.value)),
    risk: Boolean(overallRisk.level && overallRisk.level !== 'Not enough data'),
    concentration: Boolean(hasNumber(hhi) && hasNumber(topShare)),
    service: Boolean(topService && hasNumber(topService.share)),
    forecast: Boolean(hasNumber(forecastChange) && estimate?.targetLabel && hasNumber(estimate.expected))
  };

  return Object.fromEntries(Object.keys(summaryByCard).map((cardKey) => {
    const levelTemplates = outcomes[cardKey][levelByCard[cardKey]] || outcomes[cardKey].Normal;
    return [cardKey, {
      summary: summaryByCard[cardKey],
      recommendation: recommendations[cardKey][levelByCard[cardKey]] || recommendations[cardKey].default,
      ifFollowed: hasData[cardKey] ? levelTemplates[0] : `Not enough data yet to estimate how this choice could affect ${cardKey} revenue.`,
      ifIgnored: hasData[cardKey] ? levelTemplates[1] : `Not enough data yet to estimate how ignoring this signal could affect ${cardKey} revenue.`
    }];
  }));
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

function AskRevenueAIPanel({ onActivityChange }) {
  const suggestions = [
    'Why did revenue change last quarter?',
    'What are the biggest revenue risks?',
    'How concentrated is revenue among contributors?'
  ];
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerChart, setAnswerChart] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [answerTimestamp, setAnswerTimestamp] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const inFlightRef = useRef(false);
  const lastQuestionRef = useRef('');
  const questionFocusedRef = useRef(false);
  const updateActivity = () => onActivityChange?.(questionFocusedRef.current || inFlightRef.current);

  const submitQuestion = async (value = question) => {
    const trimmedQuestion = value.trim();
    if (!trimmedQuestion || inFlightRef.current) return;
    lastQuestionRef.current = trimmedQuestion;
    setCopyMessage('');
    const request = askRevenueQuestion({
      question: trimmedQuestion,
      inFlightRef,
      request: adminApi.askRevenueAI,
      setIsLoading,
      setAnswer,
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
    <p className="ai-revenue-modal__detail">Ask a question about your revenue data.</p>
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
        <span>Generated by AI from your revenue data on {new Intl.DateTimeFormat('en-PH', {
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
  const [cardInsightSource, setCardInsightSource] = useState('template');
  const [cardInsightGeneratedAt, setCardInsightGeneratedAt] = useState('');
  const [cardInsightsLoading, setCardInsightsLoading] = useState(true);
  const [cardInsightsError, setCardInsightsError] = useState('');
  const [cardInsightRequestInFlight, setCardInsightRequestInFlight] = useState(false);
  const [refreshRemainingSeconds, setRefreshRemainingSeconds] = useState(0);
  const [selectedQuarterKey, setSelectedQuarterKey] = useState(null);
  const [modalId, setModalId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMonth, setReportMonth] = useState(null);
  const [reportRows, setReportRows] = useState([]);
  const [reportError, setReportError] = useState('');
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [reportCardPage, setReportCardPage] = useState(1);
  const dataRefreshInFlightRef = useRef(false);
  const cardInsightRequestInFlightRef = useRef(false);
  const askAIActiveRef = useRef(false);
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

  const requestCardInsights = useCallback(async ({ fingerprint, forceRefresh = false, showLoading = false } = {}) => {
    if (cardInsightRequestInFlightRef.current) return false;
    cardInsightRequestInFlightRef.current = true;
    setCardInsightRequestInFlight(true);
    lastAIRequestAtRef.current = Date.now();
    lastAIRequestFingerprintRef.current = fingerprint || latestFiguresFingerprintRef.current;
    if (showLoading) {
      setCardInsightsLoading(true);
      setCardInsightsError('');
    }
    try {
      const result = await adminApi.getRevenueCardInsights(forceRefresh);
      setCardInsights(result.insights || {});
      setCardInsightSource(result.source === 'ai' ? 'ai' : 'template');
      setCardInsightGeneratedAt(result.generatedAt || '');
      setCardInsightsError('');
      if (forceRefresh) setRefreshRemainingSeconds(30);
      return true;
    } catch (error) {
      setCardInsights({});
      setCardInsightSource('template');
      setCardInsightGeneratedAt('');
      setCardInsightsError(error.message || 'AI insights are unavailable.');
      if (forceRefresh) setRefreshRemainingSeconds(Number(error.details?.retryAfterSeconds || 0));
      return false;
    } finally {
      cardInsightRequestInFlightRef.current = false;
      setCardInsightRequestInFlight(false);
      if (showLoading) setCardInsightsLoading(false);
    }
  }, []);

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

    const refreshData = async (initial = false) => {
      if (!active || dataRefreshInFlightRef.current) return;
      if (!initial && (document.hidden || askAIActiveRef.current)) return;
      const now = Date.now();
      if (!initial && now - lastDataRefreshStartedAtRef.current < 1000) return;
      dataRefreshInFlightRef.current = true;
      if (!initial) lastDataRefreshStartedAtRef.current = now;

      try {
        const [result, statsResponse] = await Promise.all([
          adminApi.getRevenueAnalysisData(),
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
          setCardInsightSource('template');
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
        dataRefreshInFlightRef.current = false;
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
  }, [requestCardInsights]);

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

  const reportTotal = reportRows.reduce((sum, row) => sum + row.amount, 0);
  const reportCardPageSize = 20;
  const reportCardTotalPages = Math.max(1, Math.ceil(reportRows.length / reportCardPageSize));
  const visibleReportCards = reportRows.slice((reportCardPage - 1) * reportCardPageSize, reportCardPage * reportCardPageSize);
  const reportPaid = reportRows.filter((row) => ['paid', 'completed'].includes(row.status.toLowerCase()))
    .reduce((sum, row) => sum + row.amount, 0);
  const reportOutstanding = reportTotal - reportPaid;
  const monthNames = reportYear && reportQuarterNumber
    ? [0, 1, 2].map((offset) => new Date(reportYear, (reportQuarterNumber - 1) * 3 + offset, 1).toLocaleString('en-PH', { month: 'short' }))
    : [];
  const selectedAnalysis = modalId === 'risk'
    ? { title: 'Revenue risk by category', items: categoryItems }
    : modalId === 'concentration'
      ? { title: 'Revenue concentration', items: contributorItems }
      : { title: 'Service type concentration', items: serviceItems };
  const indicators = analysis.risk?.indicators || {};
  const overallRisk = analysis.risk?.overallRisk || {
    level: 'Not enough data',
    reason: `fewer than ${riskThresholds.minimumCompletedQuarters} completed quarters are available`
  };
  const overallRiskWhy = getOverallRiskWhy(overallRisk, indicators);
  const selectedTier = modalId === 'risk'
    ? overallRisk.level
    : modalId === 'concentration'
      ? indicators.concentrationHhi?.level || 'Not enough data'
      : indicators.topContributorShare?.level || 'Not enough data';
  const selectedTop = selectedAnalysis.items[0];
  const topContributorIndicator = indicators.topContributorShare;
  const uncatShare = Number(analysis.risk?.uncategorized?.share || 0);
  const getRiskWhy = (key, fallback) => {
    const indicator = indicators[key];
    if (key === 'qoqChange' && indicator?.reason) return indicator.reason;
    if (!indicator || indicator.level === 'Not enough data') {
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
      title: 'Revenue risk by category',
      icon: '✣',
      items: categoryItems,
      riskLevel: overallRisk.level,
      why: overallRisk.reason ? `overall risk is driven by ${overallRisk.reason}.` : 'Overall risk is not available.',
      description: analysis.risk?.topCategory
        ? `${analysis.risk.topCategory} is the largest revenue category`
        : 'No category revenue is available'
    },
    {
      id: 'concentration',
      title: 'Revenue concentration',
      icon: '●',
      items: contributorItems,
      riskLevel: indicators.concentrationHhi?.level || 'Not enough data',
      why: getRiskWhy('concentrationHhi'),
      description: analysis.concentration?.indicators
        ? `HHI ${Number(analysis.concentration.indicators.hhi || 0).toFixed(3)} · ${Number(analysis.concentration.indicators.topOneShare || 0).toFixed(1)}% top contributor`
        : 'No contributor data is available'
    },
    ...(serviceItems.length ? [{
      id: 'service',
      title: 'Service type concentration',
      icon: '⌁',
      items: serviceItems,
      riskLevel: topContributorIndicator?.level || 'Not enough data',
      why: getRiskWhy('topContributorShare'),
      description: `${serviceItems[0].share.toFixed(1)}% from ${serviceItems[0].name}`
    }] : [])
  ];
  const localCardInsightTemplates = getLocalCardInsightTemplates({
    current,
    indicators,
    overallRisk,
    concentration: analysis.concentration,
    serviceItems,
    estimate
  });

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
        <span>{cardInsightSource === 'ai' ? 'AI-generated from your data' : 'Auto-generated summary'}{updatedAt && ` · Updated ${updatedAt}`}</span>
      </div>
      <RevenueCardInsights
        insights={cardInsights[cardKey]}
        fallbackInsights={localCardInsightTemplates[cardKey]}
        isLoading={cardInsightsLoading}
        error={cardInsightsError}
      />
    </section>;
  };

  return <>
  <section className="ai-revenue-analysis" aria-labelledby="ai-revenue-title">
    <div className="ai-revenue-analysis__header">
      <div className="ai-revenue-analysis__title"><span className="ai-revenue-analysis__mark">✦</span><div><h2 id="ai-revenue-title">Revenue Analysis</h2><p>Quarterly revenue, risk, and concentration from business data</p>{dataUpdatedAt && <small className="ai-revenue-analysis__updated">Updated {dataUpdatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>}{refreshError && <small className="ai-revenue-analysis__refresh-error" role="status">Could not refresh</small>}</div></div>
      <div className="ai-revenue-toolbar">
        <button type="button" className="ai-revenue-toolbar__action" onClick={() => setSettingsOpen(true)}>ⓘ Risk thresholds</button>
        <button type="button" className="ai-revenue-toolbar__action" onClick={() => { setReportMonth(null); setReportCardPage(1); setReportOpen(true); }}>⬇ Export report</button>
      </div>
    </div>
    <div className="ai-revenue-overall-risk">
      <div className="ai-revenue-overall-risk__title">
        <strong>Overall risk</strong>
        <button
          type="button"
          className="ai-revenue-overall-risk__info"
          aria-label="Show revenue risk thresholds"
          aria-haspopup="dialog"
          onClick={() => setSettingsOpen(true)}
        >i</button>
      </div>
      <span className={`ai-revenue-overall-risk__chip is-${['Normal', 'Moderate', 'High'].includes(overallRisk.level) ? overallRisk.level.toLowerCase() : 'unknown'}`}>
        {overallRisk.level || 'Not enough data'}
      </span>
      <p className="ai-revenue-overall-risk__why">{overallRiskWhy}</p>
    </div>

    {isLoading ? <p className="ai-revenue-empty" role="status">Loading revenue analysis…</p>
      : loadError ? <p className="ai-revenue-report__error" role="alert">{loadError}</p>
        : analysis.quarters.length === 0 ? <p className="ai-revenue-empty" role="status">No quarterly revenue data is available yet.</p>
          : <>
            <div className="ai-revenue-tabs" role="tablist" aria-label="Revenue analysis quarter">
              {quarters.map((row, index) => {
                const key = `${row.year}-Q${row.quarter}`;
                return <button type="button" role="tab" aria-selected={selectedIndex === index} className={selectedIndex === index ? 'is-active' : ''} key={key} onClick={() => {
                  setCardInsightsLoading(true);
                  setCardInsightsError('');
                  setSelectedQuarterKey(key);
                }}>{quarterLabel(row.year, row.quarter)}</button>;
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
                  ? <><p className="ai-revenue-estimate-note">{chartEstimate.targetLabel}: {peso.format(chartEstimate.expected)} · likely {peso.format(chartEstimate.low)} to {peso.format(chartEstimate.high)}</p><div className="ai-revenue-estimate-legend"><span><i className="is-actual" />Actual</span><span><i className="is-estimate" />Forecast</span><span>Current quarter is marked in progress</span></div></>
                  : <p className="ai-revenue-estimate-note">Estimate needs at least {riskThresholds.minimumCompletedQuarters} quarters of data. {analysis.quarters.length} available.</p>}
              </div>
            </div>
            <div className="ai-revenue-collected-row">
              <div><span>Collected</span><strong>{peso.format(collectedAmount)}</strong></div>
              <div><span>Outstanding</span><strong>{peso.format(outstandingAmount)}</strong></div>
              <div><span>Collection</span><strong>{collectedAmount + outstandingAmount ? Math.round(collectedAmount / (collectedAmount + outstandingAmount) * 100) : 0}%</strong></div>
            </div>
            <div className="ai-revenue-insights-toolbar">
              <span role="status">
                {cardInsightSource === 'ai' ? 'AI-generated from your data' : 'Auto-generated summary'}
                {cardInsightsError ? ' · AI unavailable; showing data-based summaries.' : ''}
                {cardInsightGeneratedAt && ` · Updated ${new Intl.DateTimeFormat('en-PH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(cardInsightGeneratedAt))}`}
              </span>
              <button type="button" className="ai-revenue-toolbar__action" onClick={refreshCardInsights} disabled={cardInsightsLoading || cardInsightRequestInFlight || refreshRemainingSeconds > 0}>
                {refreshRemainingSeconds > 0 ? `Refresh insights (${refreshRemainingSeconds}s)` : 'Refresh insights'}
              </button>
            </div>
            <div className="ai-revenue-cards">
              <div className="ai-revenue-card" role="button" tabIndex={0} onClick={() => openAnalysis('trend')} onKeyDown={(event) => handleCardKeyDown(event, 'trend')}>
                <div className="ai-revenue-card__top"><span className="ai-revenue-card__heading"><span className="ai-revenue-card__icon">↗</span><strong className="ai-revenue-card__title">Revenue trend &amp; growth</strong></span><RiskChip level={indicators.qoqChange?.level || 'Not enough data'} why={getRiskWhy('qoqChange')} /></div>
                <b>{peso.format(current.revenue)}</b>
                <small>{yoy === null ? 'YoY comparison unavailable' : `${signedPercent(yoy)} vs same quarter last year`}</small>
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
            <p className="ai-revenue-uncategorized">Uncategorized (historical): {uncatShare.toFixed(1)}% of revenue</p>
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
            <p>Overall risk is the highest indicator level. Uncategorized historical revenue is excluded from concentration calculations and shown separately.</p>
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
          <div><p className="ai-revenue-modal__eyebrow">Export</p><h2 id="ai-report-title">Sales / Transactions — {quarterName(reportYear, reportQuarterNumber)}</h2></div>
          <button type="button" className="ai-revenue-modal__close" aria-label="Close report" onClick={() => setReportOpen(false)}>×</button>
        </header>
        <div className="ai-revenue-modal__body">
        <div className="ai-revenue-report__summary">
          <strong>{reportMonth === null ? quarterName(reportYear, reportQuarterNumber) : `${monthNames[reportMonth]} ${reportYear}`} Business Records</strong>
          <span>Generated {new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })} · Total: {peso.format(reportTotal)} ({peso.format(reportPaid)} paid, {peso.format(reportOutstanding)} outstanding)</span>
          {reportError && <span className="ai-revenue-report__error" role="alert">{reportError}</span>}
        </div>
        <div className="ai-revenue-report__month-tabs" role="group" aria-label="Filter report by month">
          <button type="button" className={reportMonth === null ? 'is-active' : ''} aria-pressed={reportMonth === null} onClick={() => setReportMonth(null)}>Full quarter</button>
          {monthNames.map((name, index) => <button type="button" className={reportMonth === index ? 'is-active' : ''} aria-pressed={reportMonth === index} key={name} onClick={() => { setReportCardPage(1); setReportMonth(index); }}>{name}</button>)}
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
          </> : <p className="ai-revenue-empty">There is no backend data for this concentration view.</p>}
          {renderCardInsight(modalId)}
        </div>
      </section>
    </div></AdminModalPortal>}
  </section>
  <AskRevenueAIPanel onActivityChange={(isActive) => { askAIActiveRef.current = isActive; }} />
  </>;
}

export default AIRevenueAnalysis;
