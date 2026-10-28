export function formatServiceName(name, units = 1, unitLabel = 'unit') {
  const label = unitLabel || 'unit';
  const pluralLabel = label.endsWith('s') ? label : `${label}s`;
  return Number(units) > 1 ? `${name} x${units} ${pluralLabel}` : name;
}

export function serviceUnitSummary(units = 1, unitLabel = 'unit') {
  const label = unitLabel || 'unit';
  const pluralLabel = label.endsWith('s') ? label : `${label}s`;
  return `${units} ${Number(units) === 1 ? label : pluralLabel}`;
}

export function calculateServiceAmounts(unitPrice, unitMechanicFee, units = 1) {
  const servicePriceTotal = Number(unitPrice || 0) * Number(units || 1);
  const mechanicFeeTotal = Number(unitMechanicFee || 0) * Number(units || 1);
  return {
    servicePriceTotal,
    mechanicFeeTotal,
    estimatedPrice: servicePriceTotal + mechanicFeeTotal
  };
}
