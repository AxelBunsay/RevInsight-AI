import { useEffect, useState } from 'react';
import { adminApi } from '../services/adminApi';

export default function AdminAuditHistory({ recordType, recordId, revision = 0 }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    adminApi.getAuditHistory(recordType, recordId, page).then(response => {
      if (active) { setResult(response); setError(''); }
    }).catch(failure => {
      if (active) { setResult(null); setError(failure.message || 'History could not be loaded.'); }
    });
    return () => { active = false; };
  }, [recordType, recordId, page, revision]);
  const pending = result?.pagination?.currentPage !== page;
  return <section aria-label="Admin audit history">
    <h3>Change history</h3>
    <p>Recorded changes from the audit feature onward. Earlier actions have no historical audit entries.</p>
    {error ? <p role="alert">{error}</p> : pending ? <p role="status">Loading history…</p>
      : result?.data?.length ? <ol>{result.data.map(entry => <li key={entry.eventId}>
        <strong>{entry.action.replaceAll('_', ' ')}</strong>
        <div><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</time> · {entry.actorRole} {entry.actorId}</div>
        <div>Record: {entry.recordType} {entry.recordId}</div>
        <ul>{Object.entries(entry.changes || {}).map(([field, change]) => <li key={field}>{field}: {String(change.from ?? 'None')} → {String(change.to ?? 'None')}</li>)}</ul>
        {entry.reason && <p>Reason: {entry.reason}</p>}
      </li>)}</ol> : <p>No recorded changes.</p>}
    {(result?.pagination?.totalPages || 1) > 1 && <nav aria-label="Audit history pages">
      <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous history</button>
      <span>Page {page} of {result.pagination.totalPages}</span>
      <button type="button" disabled={page >= result.pagination.totalPages} onClick={() => setPage(value => value + 1)}>Next history</button>
    </nav>}
  </section>;
}
