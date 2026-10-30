import { useEffect, useMemo, useState } from 'react';
import MechanicLayout from './MechanicLayout';
import { JobDialog, JobTable } from './MechanicJobTable';
import { getJobActions, getMechanicJobs, performJobAction } from './mechanicService';

export default function MechanicJobs() {
  const [jobs, setJobs] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [createdDate, setCreatedDate] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getMechanicJobs()
      .then((result) => { if (active) setJobs(result.jobs || []); })
      .catch((loadError) => { if (active) setError(loadError.message || 'Jobs could not be loaded.'); });
    return () => { active = false; };
  }, []);

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

  return <MechanicLayout title="Mechanic Jobs">
    {error && !selectedJob && <p className="mechanic-alert" role="alert">{error}</p>}
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
  </MechanicLayout>;
}