export const CUSTOMER_SHOP_MAPS_URL = 'https://maps.app.goo.gl/jFDKGLKPVjTkcns16';

export function hasCustomerFooterDetails(settings) {
  return ['pickupAddress', 'pickupHours', 'contactNumber']
    .some((field) => typeof settings?.[field] === 'string' && settings[field].trim().length > 0);
}
