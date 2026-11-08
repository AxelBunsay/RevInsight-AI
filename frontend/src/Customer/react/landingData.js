function productAvailability(product) {
  const variants = product.variants || [];
  const availableVariants = variants.filter((variant) => Math.max(
    0,
    Number(variant.available ?? (Number(variant.stock || 0) - Number(variant.reservedQty || 0)))
  ) > 0);
  const availableStock = Math.max(0, Number(product.quantity || 0) - Number(product.reservedQty || 0));
  return { variants, availableVariants, availableStock, isAvailable: variants.length ? availableVariants.length > 0 : availableStock > 0 };
}

export function selectLandingProducts(products = []) {
  return products
    .filter((product) => product.isActive !== false && productAvailability(product).isAvailable)
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
    .slice(0, 6);
}

export function selectLandingServices(services = []) {
  return services.filter((service) => service.isActive !== false).slice(0, 3);
}

export function shouldShowFeaturedProducts(isLoading, products) {
  return isLoading || products.length > 0;
}

export function getVisitDetails(settings) {
  if (!settings || typeof settings !== 'object') return null;
  const details = {
    address: typeof settings.pickupAddress === 'string' ? settings.pickupAddress.trim() : '',
    hours: typeof settings.pickupHours === 'string' ? settings.pickupHours.trim() : '',
    contact: typeof settings.contactNumber === 'string' ? settings.contactNumber.trim() : ''
  };
  return Object.values(details).some(Boolean) ? details : null;
}