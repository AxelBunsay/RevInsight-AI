export function hasCustomerFooterDetails(settings) {
  return ['pickupAddress', 'pickupHours', 'contactNumber']
    .some((field) => typeof settings?.[field] === 'string' && settings[field].trim().length > 0);
}
