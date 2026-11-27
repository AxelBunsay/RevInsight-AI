import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../../services/adminApi';
import AdminAuditHistory from '../AdminAuditHistory';
import './quarter-completeness-review.css';

const labels = {
  reviewed: 'Reviewed', confirmed_zero_sales: 'Confirmed zero sales',
  awaiting_review: 'Awaiting review', needs_review: 'Needs review again',
  blocked: 'Blocked by data issues', in_progress: 'In progress', future: 'Future'
};

const versionOf = data => data.status + ':' + data.months.map(month => month.fingerprint + ':' + month.reviewStatus).join('|');

export default function QuarterCompletenessReview({ selectedQuarter, onQuarterChange, onReviewed, revision }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [confirmations, setConfirmations] = useState({});
  const [historyMonth, setHistoryMonth] = useState(null);
  const [reload, setReload] = useState(0);
  const [year, setYear] = useState(selectedQuarter.slice(0,4));
  const [quarter, setQuarter] = useState(selectedQuarter.slice(-1));
  const active = useRef(false);
  const sequence = useRef(0);
  const saveInFlight = useRef(false);
  const lastLoadedVersion = useRef(null);
  const onReviewedRef = useRef(onReviewed);
  useEffect(() => { onReviewedRef.current = onReviewed; }, [onReviewed]);
  useEffect(() => {
    active.current = true;
    const request = ++sequence.current;
    adminApi.getQuarterReview(selectedQuarter).then(response => {
      if (!active.current || request !== sequence.current || saveInFlight.current) return;
      const version = versionOf(response.data);
      const changed = lastLoadedVersion.current !== null && lastLoadedVersion.current !== version;
      lastLoadedVersion.current = version;
      setResult(response.data);setError('');setConfirmations({});
      if (changed) void onReviewedRef.current?.();
    }).catch(failure => {
      if (!active.current || request !== sequence.current || saveInFlight.current) return;
      setResult(null);setError(failure.message || 'Quarter review could not be loaded.');
    });
    return () => { active.current = false; };
  }, [selectedQuarter, revision, reload]);

  const submit = async month => {
    if (saveInFlight.current || !month.canReview || (month.eligibleTransactionCount === 0 && !confirmations[month.monthKey])) return;
    saveInFlight.current = true;
    ++sequence.current;
    setSaving(month.monthKey);setError('');
    try {
      const response = await adminApi.reviewRevenueMonth({
        selectedQuarter, monthKey:month.monthKey, fingerprint:month.fingerprint,
        confirmZeroSales:month.eligibleTransactionCount === 0
      });
      if (!active.current) return;
      ++sequence.current;
      lastLoadedVersion.current = versionOf(response.data);
      setResult(response.data);setConfirmations({});setSaving('');saveInFlight.current = false;
      await onReviewed?.();
    } catch (failure) {
      if (!active.current) return;
      setError(failure.message || 'Month review could not be saved.');
      // A conflict may mean a late transaction. Reload before another decision.
      try {
        const response = await adminApi.getQuarterReview(selectedQuarter);
        if (active.current) { lastLoadedVersion.current = versionOf(response.data);setResult(response.data);setConfirmations({});await onReviewedRef.current?.(); }
      } catch { /* Keep the error and require an explicit reload. */ }
    } finally {
      saveInFlight.current = false;
      if (active.current) setSaving('');
    }
  };

  return <section className="quarter-review" aria-label="Quarter completeness review">
    <header className="quarter-review__header">
      <h3>Quarter completeness review · {selectedQuarter.replace('-', ' ')}</h3>
      {result && <span role="status">Quarter status: <strong className="ai-revenue-risk__chip" data-review-status={result.status}>{labels[result.status]}</strong></span>}
    </header>
    <p>Admin review covers the current eligible revenue records in Asia/Manila. Later revenue changes require a new review.</p>
    <form className="ai-revenue-toolbar quarter-review__picker" onSubmit={event => {
      event.preventDefault();onQuarterChange(year + '-Q' + quarter);
    }}>
      <label>Review year <input aria-label="Review year" type="number" min="1000" max="9999" required value={year} onChange={event => setYear(event.target.value)} /></label>
      <label>Review quarter <select aria-label="Review quarter" value={quarter} onChange={event => setQuarter(event.target.value)}>
        {[1,2,3,4].map(value => <option key={value} value={value}>Q{value}</option>)}
      </select></label>
      <button className="ai-revenue-toolbar__action" type="submit" disabled={Boolean(saving)}>Show quarter</button>
      <button className="ai-revenue-toolbar__action" type="button" disabled={Boolean(saving)} onClick={() => setReload(value => value + 1)}>Reload review</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {!result ? <p role="status">{error ? 'Review information unavailable.' : 'Loading quarter review…'}</p> : <>
      {result.unassignedRecordCount > 0 && <p role="alert">{result.unassignedRecordCount} eligible records have missing or invalid revenue dates. Their months are unknown, which blocks month reviews until corrected.</p>}
      <div className="quarter-review__months">
        {result.months.map(month => {
          const current = ['reviewed','confirmed_zero_sales'].includes(month.reviewStatus);
          const empty = month.eligibleTransactionCount === 0;
          return <article className="quarter-review__month" key={month.monthKey} aria-label={month.label}>
            <header className="ai-revenue-card__top">
              <div className="ai-revenue-card__heading">
                <span className="ai-revenue-card__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="3" y="5" width="18" height="16" rx="3" />
                    <path d="M7 3v4m10-4v4M3 10h18m-14 4h2m3 0h2m-7 3h2" />
                  </svg>
                </span>
                <h4 className="ai-revenue-card__title">{month.label}</h4>
              </div>
              <span className="ai-revenue-risk__chip" data-review-status={month.reviewStatus}>{labels[month.reviewStatus]}</span>
            </header>
            <b>{month.eligibleTransactionCount}</b>
            <span>Eligible {month.eligibleTransactionCount === 1 ? 'transaction' : 'transactions'}</span>
            <p>Calendar period: {month.periodStatus.replaceAll('_', ' ')} · Asia/Manila</p>
            {month.dataQualityFlags.length ? <ul className="quarter-review__flags" aria-label="Data quality flags">{month.dataQualityFlags.map(issue => <li key={issue.code} data-severity={issue.severity}>
              <strong>{issue.severity === 'blocking' ? 'Blocking' : 'Warning'}</strong>: {issue.message} ({issue.count} records)
            </li>)}</ul> : <p>No data-quality flags in eligible records.</p>}
            {empty ? <p>{month.confirmedZeroSales ? 'Zero sales explicitly confirmed for this closed month.' : 'No recorded transactions. Zero sales has not been confirmed.'}</p>
              : <details className="quarter-review__dates">
                <summary>View transaction dates</summary>
                <ul>{month.observedDates.map(date => <li key={date}><time dateTime={date}>{date}</time></li>)}</ul>
              </details>}
            {month.reviewedAt && <p>{current ? 'Reviewed' : 'Last reviewed'} by Admin {month.reviewerId} · <time dateTime={month.reviewedAt}>{new Date(month.reviewedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</time></p>}
            {month.periodStatus !== 'closed' && <p>{month.periodStatus === 'future' ? 'Future months cannot be reviewed.' : 'This month is still in progress. Review it after it closes.'}</p>}
            <footer className="quarter-review__actions">
              {month.canConfirmZeroSales && !current && <label className="quarter-review__confirmation">
                <input type="checkbox" checked={Boolean(confirmations[month.monthKey])} onChange={event => setConfirmations(previous => ({...previous,[month.monthKey]:event.target.checked}))} />
                I confirm zero sales for {month.label}, a closed month.
              </label>}
              <button className="ai-revenue-toolbar__action" type="button" disabled={!month.canReview || current || Boolean(saving) || (empty && !confirmations[month.monthKey])} onClick={() => submit(month)}>
                {saving === month.monthKey ? 'Saving review…' : empty ? 'Confirm zero sales and review' : 'Mark month reviewed'}
              </button>
              {month.reviewId && <button className="ai-revenue-toolbar__action" type="button" aria-expanded={historyMonth === month.monthKey} onClick={() => setHistoryMonth(value => value === month.monthKey ? null : month.monthKey)}>Review history</button>}
            </footer>
            {historyMonth === month.monthKey && <AdminAuditHistory key={month.reviewId} recordType="revenue_month" recordId={month.reviewId} revision={month.reviewedAt} />}
          </article>;
        })}
      </div>
    </>}
  </section>;
}
