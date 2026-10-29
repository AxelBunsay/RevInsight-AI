const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

export default function ServicePriceBreakdown({
  servicePriceTotal,
  mechanicFeeTotal,
  estimatedPrice,
  className = ''
}) {
  const hasSavedBreakdown = servicePriceTotal !== undefined && mechanicFeeTotal !== undefined;
  return <div className={`service-price-breakdown${className ? ` ${className}` : ''}`}>
    {hasSavedBreakdown && <>
      <p><span>Service</span><strong>{money(servicePriceTotal)}</strong></p>
      <p><span>Mechanic fee</span><strong>{money(mechanicFeeTotal)}</strong></p>
    </>}
    <p><span>Total</span><strong>{money(estimatedPrice)}</strong></p>
  </div>;
}
