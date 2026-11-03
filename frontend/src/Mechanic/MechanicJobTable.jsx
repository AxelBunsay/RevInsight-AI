import { formatServiceName, serviceUnitSummary } from '../utils/servicePricing';
import { getServicePaymentSummary } from '../utils/servicePayment';
import ServicePriceBreakdown from '../components/ServicePriceBreakdown';

const serviceUnitDetails = (job) => job.pricePerUnit
  ? serviceUnitSummary(job.units || 1, job.unitLabel)
  : '';
const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getJobId = (job) => job._id || job.id || job.jobId || '';

function getBookingCode(job = {}) {
  if (job.code) return job.code;
  if (typeof job.jobId === 'string' && job.jobId.startsWith('SRV-')) return job.jobId;
  const id = getJobId(job);
  return id ? `SRV-${String(id).slice(-6).toUpperCase()}` : 'Service booking';
}

function getScheduledLabel(job) {
  const scheduledDate = job.scheduledDate || job.dueDate;
  const time = [job.startTime || job.dueTime, job.endTime].filter(Boolean).join(' - ');
  if (!scheduledDate) return time ? `Schedule to be confirmed · ${time}` : 'Schedule to be confirmed';

  const date = String(scheduledDate).slice(0, 10);
  const formattedDate = new Date(`${date}T12:00:00`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  return time ? `${formattedDate} · ${time}` : formattedDate;
}

function JobPriceLine({ job }) {
  const hasSavedBreakdown = job.servicePriceTotal !== undefined && job.mechanicFeeTotal !== undefined;
  if (!hasSavedBreakdown) return <span className="mechanic-job-card-price">Total {money(job.estimatedPrice)}</span>;
  return <span className="mechanic-job-card-price">
    Service {money(job.servicePriceTotal)} + Mechanic fee {money(job.mechanicFeeTotal)} = Total {money(job.estimatedPrice)}
  </span>;
}

const statusLabels = {
  pending: 'Available to accept', assigned: 'Assigned to you',
  'awaiting-response': 'Awaiting your response', confirmed: 'Awaiting your response',
  inspection: 'Inspection', accepted: 'Inspection', 'in-progress': 'In progress',
  'waiting-parts': 'Waiting for parts', 'waiting-for-parts': 'Waiting for parts',
  'quality-check': 'Quality check', completed: 'Completed', declined: 'Declined',
  'ready-for-release': 'Ready for release'
};

export function StatusBadge({ status = '' }) {
  const key = status.toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
  const label = statusLabels[key] || key.replaceAll('-', ' ');
  return <span className={`mechanic-status status-${key}`}>{label}</span>;
}

export function JobTable({ jobs, onSelect, emptyMessage = 'No jobs match these filters.' }) {
  if (!jobs.length) return <p className="mechanic-empty-state">{emptyMessage}</p>;
  return <>
    <div className="mechanic-table-scroll">
      <table className="mechanic-job-table">
        <thead><tr><th>Job</th><th>Customer</th><th>Vehicle / service</th><th>Status</th><th>Due</th><th><span className="visually-hidden">Details</span></th></tr></thead>
        <tbody>{jobs.map((job) => <tr key={getJobId(job)}>
          <td><button className="mechanic-job-id" type="button" onClick={() => onSelect(job)}>{getBookingCode(job)}</button><span className={`mechanic-priority${job.priority?.toLowerCase() === 'high' ? ' high' : ''}`}>{job.priority || 'Normal'}</span></td>
          <td><strong>{job.customerName || job.customer?.name || 'Customer'}</strong><span>{job.plate || job.plateNumber || job.vehiclePlate || '—'}</span></td>
          <td>{job.vehicle || job.vehicleModel || job.vehicleName || 'Motorcycle'}<span>{formatServiceName(job.serviceType || job.service || 'Service', job.units, job.unitLabel)}</span>{job.pricePerUnit && <small>{serviceUnitDetails(job)}</small>}{job.partsSource === 'customer' && <small className="mechanic-parts-source">Customer brings own parts</small>}<ServicePriceBreakdown servicePriceTotal={job.servicePriceTotal} mechanicFeeTotal={job.mechanicFeeTotal} estimatedPrice={job.estimatedPrice} /></td>
          <td><StatusBadge status={job.status || 'confirmed'} /></td>
          <td><span className={job.overdue && job.status !== 'completed' ? 'mechanic-due overdue' : 'mechanic-due'}>{job.overdue && job.status !== 'completed' ? 'Overdue · ' : ''}{job.dueTime || '—'}</span><span>{job.dueDate ? new Date(`${job.dueDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span></td>
          <td><button className="mechanic-table-action" type="button" onClick={() => onSelect(job)}>View</button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="mechanic-job-cards">
      {jobs.map((job) => <button
        className="mechanic-job-card"
        key={getJobId(job)}
        type="button"
        aria-label={`Open booking ${getBookingCode(job)}`}
        onClick={() => onSelect(job)}
      >
        <span className="mechanic-job-card-top">
          <strong>{getBookingCode(job)}</strong>
          <span className={`mechanic-priority${job.priority?.toLowerCase() === 'high' ? ' high' : ''}`}>{job.priority || 'Normal'} priority</span>
          <StatusBadge status={job.status || 'confirmed'} />
          {job.partsSource === 'customer' && <span className="mechanic-parts-source">Customer brings own parts</span>}
        </span>
        <span className="mechanic-job-card-customer">{job.customerName || job.customer?.name || 'Customer'}</span>
        <span className="mechanic-job-card-vehicle">{job.vehicle || job.vehicleModel || job.vehicleName || 'Motorcycle'}</span>
        <span className="mechanic-job-card-service">{formatServiceName(job.serviceType || job.service || 'Service', job.units, job.unitLabel)}</span>
        <span className="mechanic-job-card-schedule">{getScheduledLabel(job)}</span>
        <JobPriceLine job={job} />
      </button>)}
    </div>
  </>;
}

export function JobDialog({ job, onClose, actions, onAction, busy, error = '' }) {
  if (!job) return null;
  const labels = { accept: 'Accept job', decline: 'Decline', start: 'Start work', 'waiting-parts': 'Wait for parts', 'quality-check': 'Send to quality check', complete: 'Mark complete' };
  const paymentSummary = getServicePaymentSummary(job);
  const balanceDue = Math.max(0, paymentSummary.totalAmount - paymentSummary.amountPaid);
  return <div className="mechanic-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="mechanic-dialog job-dialog" role="dialog" aria-modal="true" aria-labelledby="job-dialog-title">
      <button className="mechanic-dialog-close" type="button" onClick={onClose} aria-label="Close job details">×</button>
      <span className="mechanic-eyebrow">{getBookingCode(job)}</span><h2 id="job-dialog-title">{formatServiceName(job.serviceType || job.service || 'Service job', job.units, job.unitLabel)}</h2>
      <p>{job.description || 'Review the job details and update its status when work progresses.'}</p>
      <dl className="mechanic-job-details"><div><dt>Customer</dt><dd>{job.customerName || job.customer?.name || 'Customer'}</dd></div><div><dt>Vehicle</dt><dd>{job.vehicle || job.vehicleModel || 'Motorcycle'} · {job.plate || job.plateNumber || '—'}</dd></div><div><dt>Parts</dt><dd>{job.partsSource === 'customer' ? 'Customer brings own parts' : 'From the shop'}</dd></div>{job.pricePerUnit && <div><dt>Quantity</dt><dd>{serviceUnitDetails(job)}</dd></div>}<div><dt>Price breakdown</dt><dd><ServicePriceBreakdown servicePriceTotal={job.servicePriceTotal} mechanicFeeTotal={job.mechanicFeeTotal} estimatedPrice={job.estimatedPrice} /></dd></div><div><dt>Status</dt><dd><StatusBadge status={job.status || 'confirmed'} /></dd></div><div><dt>Priority</dt><dd>{job.priority || 'Normal'}</dd></div></dl>
      {actions.includes('complete') && balanceDue > 0 && <p className="mechanic-alert">Collect balance of {money(balanceDue)} at the shop.</p>}
      {error && <p className="mechanic-alert" role="alert">{error}</p>}
      <div className="mechanic-dialog-actions job-dialog-actions">{actions.map((action) => <button className={action === 'decline' ? 'button-secondary danger' : 'button-primary'} type="button" key={action} disabled={busy} onClick={() => onAction(job, action)}>{labels[action] || action}</button>)}<button className="button-secondary" type="button" onClick={onClose}>Close</button></div>
    </section>
  </div>;
}