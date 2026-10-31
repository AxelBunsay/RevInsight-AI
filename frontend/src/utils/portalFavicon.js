export function getPortalFavicon(pathname) {
  if (pathname.startsWith('/admin')) {
    return { href: '/favicon-admin.png?v=2', type: 'image/png' };
  }
  if (pathname.startsWith('/mechanic')) {
    return { href: '/favicon-mechanic.png?v=2', type: 'image/png' };
  }
  return { href: '/logo.svg', type: 'image/svg+xml' };
}

export function syncPortalFavicon(pathname, targetDocument = document) {
  const favicon = getPortalFavicon(pathname);
  let link = targetDocument.querySelector('link[rel="icon"]');

  if (!link) {
    link = targetDocument.createElement('link');
    link.rel = 'icon';
    targetDocument.head.appendChild(link);
  }

  link.type = favicon.type;
  link.href = favicon.href;
}
