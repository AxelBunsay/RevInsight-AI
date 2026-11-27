import '../styles/walk-in-pos.css';
import { useEffect, useState } from 'react';
import { adminApi as api } from '../services/adminApi';

const money = n => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);

export default function WalkInPOS({ onChange }) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [visits, setVisits] = useState([]);
  const [visit, setVisit] = useState(null);
  const [items, setItems] = useState([]);
  const [productChoice, setProductChoice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [serviceId, setServiceId] = useState('');
  const [method, setMethod] = useState('Cash');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([api.getPosInventory(), api.getServices(), api.walkIn()]).then(([inventory, catalog, data]) => {
      if (active) { setProducts(inventory); setServices(catalog.services); setVisits(data.visits); }
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [open]);

  const choices = products.flatMap(product => (product.variants?.length ? product.variants : [null]).map(variant => ({
    id: variant?._id || product._id, productId: product._id, variantId: variant?._id,
    name: [product.name, variant?.label].filter(Boolean).join(' - '), price: variant?.price ?? product.price
  })));
  const startNew = () => {
    setVisit(null); setItems([]); setProductChoice(''); setServiceId(''); setProofUrl('');
    setKey(crypto.randomUUID()); setQuantity(1); setError('');
  };
  async function submit(suffix, body) {
    setBusy(true); setError('');
    try {
      const result = await api.walkIn(suffix, body);
      setVisit(result.visit); setProofUrl(''); setReason('');
      setVisits(rows => result.visit.status === 'Paid' ? rows.filter(row => row._id !== result.visit._id)
        : [result.visit, ...rows.filter(row => row._id !== result.visit._id)]);
      onChange();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <section className="admin-panel walk-in-pos"><button className="btn-small" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Walk-in POS</button>
    {open && <fieldset disabled={busy}><legend>{visit ? 'Walk-in receipt' : 'Walk-in Guest'}</legend>
      {error && <p role="alert">{error}</p>}
      {!visit ? <>
        <form onSubmit={async e => {
          e.preventDefault();
          const id = new FormData(e.currentTarget).get('visitId').trim();
          try { setVisit((await api.walkIn('/' + encodeURIComponent(id))).visit); setError(''); } catch (err) { setError(err.message); }
        }}><label>Find receipt by visit ID <input required name="visitId" /></label><button>Find receipt</button></form>
        {visits.length > 0 && <label>Resume payment <select value="" onChange={e => setVisit(visits.find(v => v._id === e.target.value))}><option value="">Choose a visit</option>{visits.map(v => <option key={v._id} value={v._id}>{v._id} · {money(v.total)} · {v.status}</option>)}</select></label>}
        <label>Product <select value={productChoice} onChange={e => setProductChoice(e.target.value)}><option value="">Choose product</option>{choices.map(c => <option key={c.id} value={c.id}>{c.name} · {money(c.price)}</option>)}</select></label>
        <label>Quantity <input type="number" min="1" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>
        <button type="button" disabled={!productChoice || !Number.isInteger(quantity) || quantity < 1} onClick={() => {
          const choice = choices.find(c => c.id === productChoice);
          setItems(lines => [...lines.filter(l => l.id !== choice.id), { ...choice, quantity }]);
        }}>Set product quantity</button>
        {items.map(l => <p key={l.id}>{l.name} × {l.quantity} · {money(l.price * l.quantity)} <button onClick={() => setItems(items.filter(i => i.id !== l.id))}>Remove</button></p>)}
        <label>Service <select value={serviceId} onChange={e => setServiceId(e.target.value)}><option value="">No service</option>{services.map(s => <option key={s._id} value={s._id}>{s.name} · {money(s.price + (s.mechanicFee || 0))}</option>)}</select></label>
        <label>Payment method <select value={method} onChange={e => setMethod(e.target.value)}><option>Cash</option><option>GCash</option></select></label>
        <button className="btn-small btn-edit" disabled={!items.length && !serviceId} onClick={() => submit('', { requestKey: key, method, items, serviceId })}>{serviceId ? 'Queue service and open checkout' : 'Open checkout'}</button>
      </> : <>
        <h3>Visit {visit._id}</h3>
        <p>Customer: {visit.customer || 'Walk-in Guest'}</p>
        <p>Handled by: {visit.handledByName || 'Staff not recorded'}</p>
        {visit.items.map(i => <p key={i._id}>{i.productName} × {i.quantity} · {money(i.price * i.quantity)}</p>)}
        {visit.jobId && <p>{visit.serviceName} · {money(visit.serviceTotal)} · Job {visit.jobId}</p>}
        <p><strong>{money(visit.total)}</strong> · {visit.method} · {visit.status === 'Paid' ? 'Paid in full' : visit.status}</p>
        {visit.submissions?.at(-1)?.status === 'Rejected' && <p>Receipt rejected: {visit.submissions.at(-1).reason}</p>}
        {visit.method === 'GCash' && visit.status === 'Unpaid' && <form onSubmit={e => { e.preventDefault(); submit('/'+visit._id+'/receipt', new FormData(e.currentTarget)); }}>
          <label>GCash reference <input required pattern="[0-9]{10,20}" name="reference" /></label>
          <label>Receipt <input required type="file" name="proof" accept="image/png,image/jpeg" /></label><button>Submit receipt for review</button>
        </form>}
        {visit.status === 'Payment submitted' && <>
          <p>GCash reference {visit.reference}</p><button onClick={async () => { try { setProofUrl((await api.walkIn('/'+visit._id+'/receipt')).url); } catch (err) { setError(err.message); } }}>View receipt</button>
          {proofUrl && <a href={proofUrl} target="_blank" rel="noreferrer">Open submitted receipt</a>}
          <label>Reason for rejection <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} /></label>
          <button disabled={reason.trim().length < 3} onClick={() => submit('/'+visit._id+'/reject', { reason })}>Reject receipt</button>
        </>}
        {visit.status !== 'Paid' && (visit.method === 'Cash' || visit.status === 'Payment submitted') && <button className="btn-small btn-edit" onClick={() => submit('/'+visit._id+'/confirm', {})}>{visit.method === 'Cash' ? 'Confirm cash received' : 'Confirm verified GCash payment'}</button>}
        <button onClick={startNew}>New visit</button>
      </>}
    </fieldset>}
  </section>;
}
