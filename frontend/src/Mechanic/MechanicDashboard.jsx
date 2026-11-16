import { useEffect, useState } from 'react';
import { JobDialog, JobTable } from './MechanicJobTable';
import { getJobActions, getMechanicJobs, getMechanicProfile, performJobAction, updateMechanicAvailability } from './mechanicService';
import { api } from '../services/api';

const queueGroups = [
  { label: 'To inspect / accept', statuses: ['pending', 'assigned', 'awaiting-response', 'confirmed', 'inspection', 'accepted'] },
  { label: 'Quote requests', statuses: ['quote_requested'] },
  { label: 'Waiting approval', statuses: ['waiting-approval'] },
  { label: 'Waiting parts', statuses: ['waiting-parts', 'waiting-for-parts'] },
  { label: 'For quality check', statuses: ['quality-check'] },
  { label: 'Ready for release', statuses: ['ready-for-release'] }
];

export default function MechanicDashboard() {
  const [profile, setProfile] = useState({});
  const [jobs, setJobs] = useState([]);
  const [availableJobs, setAvailableJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getMechanicProfile(), getMechanicJobs()])
      .then(async ([profileResult, jobsResult]) => {
        const statsResult = await api.getMechanicStats(profileResult.mechanic.id);
        if (!active) return;
        setProfile(profileResult.mechanic || {});
        setJobs(jobsResult.jobs || []);
        setAvailableJobs(jobsResult.availableJobs || []);
        setStats(statsResult);
      })
      .catch((loadError) => { if (active) setError(loadError.message || 'Dashboard could not be loaded.'); });
    return () => { active = false; };
  }, []);

  const changeAvailability = async (availabilityStatus) => {
    setError('');
    try {
      const result = await updateMechanicAvailability(availabilityStatus, profile);
      setProfile(result.mechanic || { ...profile, availabilityStatus });
    } catch (updateError) { setError(updateError.message || 'Availability could not be updated.'); }
  };

  const runAction = async (job, action, details) => {
    setBusy(true);
    setError('');
    try {
      const result = await performJobAction(job, action, details);
      if (action === 'quote') {
        setJobs((currentJobs) => currentJobs.filter((currentJob) => (currentJob._id || currentJob.id) !== (job._id || job.id)));
      } else if (result.serviceRequest) {
        const updatedJob = result.serviceRequest;
        setAvailableJobs((currentJobs) => currentJobs.filter((currentJob) => (currentJob._id || currentJob.id) !== (updatedJob._id || updatedJob.id)));
        setJobs((currentJobs) => currentJobs.some((currentJob) => (currentJob._id || currentJob.id) === (updatedJob._id || updatedJob.id)) ? currentJobs.map((currentJob) =>
          (currentJob._id || currentJob.id) === (updatedJob._id || updatedJob.id)
            ? { ...currentJob, ...updatedJob }
            : currentJob
        ) : [...currentJobs, { ...job, ...updatedJob }]);
      }
      try {
        setStats(await api.getMechanicStats(profile.id));
      } catch {
        setError('The job was updated. Reload to refresh your earnings.');
      }
      setSelectedJob(null);
    }
    catch (actionError) { setError(actionError.message || 'Job could not be updated.'); }
    finally { setBusy(false); }
  };

  const pending = jobs.filter((job) => ['pending', 'assigned', 'awaiting-response', 'confirmed'].includes(job.status)).length;
  const inProgress = jobs.filter((job) => job.status === 'in-progress').length;
  const completed = jobs.filter((job) => job.status === 'completed').length;
  const overdue = jobs.filter((job) => job.overdue && job.status !== 'completed').length;
  const activeJobs = jobs.filter((job) => !['completed', 'declined'].includes(job.status)).slice(0, 6);

  return <>
    {error && !selectedJob && <p className="mechanic-alert" role="alert">{error}</p>}
    <div className="mechanic-dashboard-grid">
      <section className="mechanic-panel workload-panel"><div className="mechanic-panel-heading"><h2>Today’s workload</h2></div><div className="mechanic-workload-stats"><div><strong>{pending}</strong><span>Pending</span></div><div><strong>{inProgress}</strong><span>In progress</span></div><div><strong>{completed}</strong><span>Completed</span></div></div><p>Earnings from completed jobs: <strong>{Number(stats?.totalEarnings || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}</strong></p></section>
      <section className="mechanic-panel availability-panel"><div className="mechanic-panel-heading"><h2>Availability</h2></div><label className="visually-hidden" htmlFor="mechanic-availability">Availability status</label><select id="mechanic-availability" value={profile.availabilityStatus || 'available'} onChange={(event) => changeAvailability(event.target.value)}><option value="available">Available</option><option value="busy">Busy</option><option value="on-leave">On leave</option></select><p>Specialization: {profile.specialization || 'General service'} · {activeJobs.length} active jobs</p></section>
    </div>
    <section className="mechanic-panel queue-panel"><div className="mechanic-panel-heading"><h2>My queue</h2></div><div className="mechanic-queue-grid">{queueGroups.map((group) => <div className="mechanic-queue-tile" key={group.label}><strong>{jobs.filter((job) => group.statuses.includes(job.status)).length}</strong><span>{group.label}</span></div>)}<div className="mechanic-queue-tile overdue-tile"><strong>{overdue}</strong><span>Overdue</span></div></div></section>
    <section className="mechanic-panel active-jobs-panel"><div className="mechanic-panel-heading"><h2>My active jobs</h2></div><JobTable jobs={activeJobs} onSelect={setSelectedJob} emptyMessage="No active jobs right now." /></section>
    {availableJobs.length > 0 && <section className="mechanic-panel"><div className="mechanic-panel-heading"><h2>Available jobs</h2></div><JobTable jobs={availableJobs} onSelect={setSelectedJob} /></section>}
    <JobDialog job={selectedJob} onClose={() => setSelectedJob(null)} actions={selectedJob ? getJobActions(selectedJob) : []} onAction={runAction} busy={busy} error={selectedJob ? error : ''} />
  </>;
}
