import { getServicePaymentSummary } from '../utils/servicePayment';

const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

export default function ServicePaymentBreakdown({ booking, className = '' }) {
  const { totalAmount, downPaymentPercent, downPaymentAmount, balanceDue, amountPaid } = getServicePaymentSummary(booking);
  const remainingBalance = amountPaid >= totalAmount ? 0 : balanceDue;
  return <div className={`service-payment-breakdown${className ? ` ${className}` : ''}`}>
    <p><span>Total</span><strong>{money(totalAmount)}</strong></p>
    <p><span>Down payment ({downPaymentPercent}%)</span><strong>{money(downPaymentAmount)}</strong></p>
    <p><span>Balance due at the shop</span><strong>{money(remainingBalance)}</strong></p>
  </div>;
}
