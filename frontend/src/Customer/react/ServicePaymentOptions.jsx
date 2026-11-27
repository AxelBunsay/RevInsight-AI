export default function ServicePaymentOptions({ payment, onChange }) {
  return <div className="customer-payment-options" role="radiogroup" aria-label="Payment method">
    {['Cash', 'GCash'].map(method =>
      <label key={method} className={payment === method ? 'is-selected' : ''}>
        <input type="radio" name="payment" value={method} checked={payment === method} onChange={() => onChange(method)} />
        <span><strong>{method}</strong><small>{method === 'GCash' ? 'Submit payment after booking' : 'Pay at the shop'}</small></span>
      </label>
    )}
  </div>;
}
