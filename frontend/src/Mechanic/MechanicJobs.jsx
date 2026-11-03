import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { JobDialog, JobTable } from './MechanicJobTable';
import {
  declineMechanicQuoteRequest,
  getJobActions,
  getMechanicJobs,
  getMechanicQuoteRequests,
  performJobAction,
  submitMechanicQuote
} from './mechanicService';

const money = (value) => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function quoteRequestDate(request) {
  if (!request.scheduledDate) return 'Date to be confirmed';
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(request.scheduledDate));
}

function QuoteRequestCard({ request, busy, error, onSubmitQuote, onDecline }) {
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState('');
  const range = request.laborPriceMinSnapshot != null || request.laborPriceMaxSnapshot != null
    ? `PHP ${money(request.laborPriceMinSnapshot)} - PHP ${money(request.laborPriceMaxSnapshot)}`
    : 'Price to be determined';
  const customerName = request.user
    ? `${request.user.firstName || ''} ${request.user.lastName || ''}`.trim() || request.user.email
    : 'Customer';

  return <article className="mechanic-quote-request-card">
    <header className="mechanic-quote-request-header">
      <div><strong>{request.serviceType || 'Service'}</strong><span>{customerName}</span></div>
      <span className="mechanic-quote-request-range">Estimated range: {range}</span>
    </header>
    <p className="mechanic-quote-request-schedule">{quoteRequestDate(request)}{request.startTime ? ` · ${request.startTime}${request.endTime ? ` - ${request.endTime}` : ''}` : ''}</p>
    <p><strong>Parts you will bring:</strong> {request.customerPartsNote || 'Not specified'}</p>
    {request.notes && <p><strong>Notes:</strong> {request.notes}</p>}
    <div className="mechanic-quote-request-fields">
      <label className="mechanic-field"><span>Your price (PHP)</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0.00" /></label>
      <label className="mechanic-field"><span>Quote note (optional)</span><textarea rows="2" maxLength="1000" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain what the price includes" /></label>
      <label className="mechanic-field"><span>Decline reason</span><input type="text" maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required if declining" /></label>
    </div>
    {(validationError || error) && <p className="mechanic-alert" role="alert">{validationError || error}</p>}
    <div className="mechanic-quote-request-actions">
      <button className="button-primary" type="button" disabled={busy} onClick={() => {
        const numericPrice = Number(price);
        if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
          setValidationError('Enter a price greater than zero.');
          return;
        }
        setValidationError('');
        onSubmitQuote(request, { price: numericPrice, note: note.trim() });
      }}>{busy ? 'Sending...' : 'Send quote'}</button>
      <button className="button-secondary danger" type="button" disabled={busy} onClick={() => {
        if (reason.trim().length < 3) {
          setValidationError('Enter a short reason before declining.');
          return;
        }
        setValidationError('');
        onDecline(request, reason.trim());
      }}>{busy ? 'Saving...' : 'Decline'}</button>
    </div>
  </article>;
}

export default function MechanicJobs() {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [createdDate, setCreatedDate] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [quoteHistory, setQuoteHistory] = useState([]);
  const [busyQuoteId, setBusyQuoteId] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const { notifications = [], refreshQuoteCount } = useOutletContext() || {};

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [jobsResult, quotesResult] = await Promise.allSettled([getMechanicJobs(), getMechanicQuoteRequests()]);
      if (!active) return;
      if (jobsResult.status === 'fulfilled') setJobs(jobsResult.value.jobs || []);
      else setError(jobsResult.reason.message || 'Jobs could not be loaded.');
      if (quotesResult.status === 'fulfilled') setQuoteRequests(quotesResult.value.requests || []);
      else setQuoteError(quotesResult.reason.message || 'Quote requests could not be loaded.');
    };
    load();
    const interval = window.setInterval(load, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const notificationHistory = useMemo(() => {
    const historyById = new Map(quoteHistory.map((entry) => [String(entry.id), entry]));
    notifications.filter((notification) => ['service_quote_accepted', 'service_quote_rejected', 'service_quote_cancelled'].includes(notification.type))
      .slice()
      .reverse()
      .forEach((notification) => {
        const status = notification.type === 'service_quote_rejected'
          ? 'Rejected by customer'
          : notification.type === 'service_quote_accepted'
            ? 'Accepted by customer'
            : 'Cancelled by customer';
        const current = historyById.get(String(notification.recordId)) || {};
        historyById.set(String(notification.recordId), {
          ...current,
          id: notification.recordId,
          serviceType: current.serviceType || notification.text,
          status,
          time: notification.time
        });
      });
    return [...historyById.values()];
  }, [notifications, quoteHistory]);

  const createdDates = useMemo(() => [...new Set(jobs
    .map((job) => String(job.createdAt || '').slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))]
    .sort((left, right) => right.localeCompare(left)), [jobs]);

  const visibleJobs = useMemo(() => jobs.filter((job) => {
    const searchFields = [job.code, job.jobId, job.customerName, job.plate, job.vehicle, job.serviceType]
      .join(' ')
      .toLowerCase();
    return searchFields.includes(search.trim().toLowerCase())
      && (status === 'all' || job.status === status)
      && (priority === 'all' || (job.priority || 'normal').toLowerCase() === priority)
      && (!createdDate || String(job.createdAt || '').slice(0, 10) === createdDate);
  }), [jobs, search, status, priority, createdDate]);

  const runAction = async (job, action) => {
    setBusy(true);
    setError('');
    try {
      const result = await performJobAction(job, action);
      if (result.serviceRequest) {
        const updatedJob = result.serviceRequest;
        setJobs((currentJobs) => currentJobs.map((currentJob) =>
          (currentJob._id || currentJob.id) === (updatedJob._id || updatedJob.id)
            ? { ...currentJob, ...updatedJob }
            : currentJob
        ));
      }
      setSelectedJob(null);
    }
    catch (actionError) { setError(actionError.message || 'Job could not be updated.'); }
    finally { setBusy(false); }
  };

  const sendQuote = async (request, quote) => {
    const requestId = String(request._id || request.id);
    setBusyQuoteId(requestId);
    setQuoteError('');
    try {
      await submitMechanicQuote(requestId, quote);
      setQuoteRequests((current) => current.filter((item) => String(item._id || item.id) !== requestId));
      setQuoteHistory((current) => [{
        id: requestId,
        serviceType: request.serviceType,
        customerName: request.user ? `${request.user.firstName || ''} ${request.user.lastName || ''}`.trim() : 'Customer',
        status: 'Waiting for the customer',
        time: new Date().toISOString()
      }, ...current.filter((item) => String(item.id) !== requestId)]);
      void refreshQuoteCount?.();
    } catch (actionError) {
      setQuoteError(actionError.message || 'Quote could not be sent.');
    } finally {
      setBusyQuoteId('');
    }
  };

  const declineQuote = async (request, reason) => {
    const requestId = String(request._id || request.id);
    setBusyQuoteId(requestId);
    setQuoteError('');
    try {
      await declineMechanicQuoteRequest(requestId, reason);
      setQuoteRequests((current) => current.filter((item) => String(item._id || item.id) !== requestId));
      setQuoteHistory((current) => [{
        id: requestId,
        serviceType: request.serviceType,
        customerName: request.user ? `${request.user.firstName || ''} ${request.user.lastName || ''}`.trim() : 'Customer',
        status: 'Declined by mechanic',
        time: new Date().toISOString()
      }, ...current.filter((item) => String(item.id) !== requestId)]);
      void refreshQuoteCount?.();
    } catch (actionError) {
      setQuoteError(actionError.message || 'Quote request could not be declined.');
    } finally {
      setBusyQuoteId('');
    }
  };

  return <>
    {error && !selectedJob && <p className="mechanic-alert" role="alert">{error}</p>}
    <section className="mechanic-panel mechanic-quote-requests-panel">
      <header className="mechanic-panel-heading"><h2>Quote requests</h2><span className="mechanic-quote-count">{quoteRequests.length}</span></header>
      {quoteError && <p className="mechanic-alert" role="alert">{quoteError}</p>}
      {quoteRequests.length
        ? <div className="mechanic-quote-request-list">{quoteRequests.map((request) => <QuoteRequestCard
          key={request._id || request.id}
          request={request}
          busy={busyQuoteId === String(request._id || request.id)}
          error={busyQuoteId === String(request._id || request.id) ? quoteError : ''}
          onSubmitQuote={sendQuote}
          onDecline={declineQuote}
        />)}</div>
        : <p className="mechanic-empty-state">No quote requests are waiting for you.</p>}
    </section>
    {!!notificationHistory.length && <details className="mechanic-quote-history">
      <summary>Quote history ({notificationHistory.length})</summary>
      <div className="mechanic-quote-history-list">{notificationHistory.map((item) => <article key={item.id}>
        <strong>{item.status}</strong>
        <span>{item.customerName || 'Customer'} · {item.serviceType || 'Service request'}</span>
        {item.time && <time>{new Date(item.time).toLocaleString('en-PH')}</time>}
      </article>)}</div>
    </details>}
    <section className="mechanic-panel jobs-panel">
      <div className="mechanic-job-filters">
        <label className="mechanic-field search-field"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Job ID, customer, plate or vehicle" /></label>
        <label className="mechanic-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="assigned">Assigned</option><option value="awaiting-response">Awaiting response</option><option value="confirmed">Confirmed</option><option value="inspection">Inspection</option><option value="accepted">Accepted</option><option value="in-progress">In progress</option><option value="waiting-parts">Waiting for parts</option><option value="quality-check">Quality check</option><option value="completed">Completed</option><option value="declined">Declined</option></select></label>
        <label className="mechanic-field"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">All priorities</option><option value="high">High</option><option value="normal">Normal</option></select></label>
        <label className="mechanic-field created-date-field"><span>Date created</span><select value={createdDate} onChange={(event) => setCreatedDate(event.target.value)}><option value="">Any date</option>{createdDates.map((date) => <option value={date} key={date}>{new Date(`${date}T12:00:00`).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</option>)}</select></label>
      </div>
      <div className="mechanic-jobs-result"><span>{visibleJobs.length} {visibleJobs.length === 1 ? 'job' : 'jobs'}</span>{(search || status !== 'all' || priority !== 'all' || createdDate) && <button type="button" onClick={() => { setSearch(''); setStatus('all'); setPriority('all'); setCreatedDate(''); }}>Clear filters</button>}</div>
      <JobTable jobs={visibleJobs} onSelect={setSelectedJob} />
    </section>
    <JobDialog job={selectedJob} onClose={() => setSelectedJob(null)} actions={selectedJob ? getJobActions(selectedJob) : []} onAction={runAction} busy={busy} error={selectedJob ? error : ''} />
  </>;
}