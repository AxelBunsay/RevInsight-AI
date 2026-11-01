export function getServicePartsSource(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  return params.get('parts') === 'own' ? 'customer' : 'shop';
}

export function servicesForPartsSource(services, partsSource) {
  if (partsSource !== 'customer') return services;
  return services.filter((service) => service.laborOnlyPrice !== null
    && service.laborOnlyPrice !== undefined
    && service.laborOnlyPrice !== ''
    && Number.isFinite(Number(service.laborOnlyPrice)));
}

export function withServicePartsSource(searchParams, partsSource) {
  const nextParams = new URLSearchParams(searchParams);
  if (partsSource === 'customer') nextParams.set('parts', 'own');
  else nextParams.delete('parts');
  nextParams.set('page', '1');
  return nextParams;
}