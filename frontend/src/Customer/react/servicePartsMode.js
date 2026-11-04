export function getServicePartsSource(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  return params.get('parts') === 'own' ? 'customer' : 'shop';
}

export function servicesForPartsSource(services, partsSource) {
  return services;
}

export function withServicePartsSource(searchParams, partsSource) {
  const nextParams = new URLSearchParams(searchParams);
  if (partsSource === 'customer') nextParams.set('parts', 'own');
  else nextParams.delete('parts');
  nextParams.set('page', '1');
  return nextParams;
}