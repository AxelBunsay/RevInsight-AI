(function () {
  var path = window.location.pathname;
  var href = path.startsWith('/admin')
    ? '/favicon-admin.png?v=2'
    : path.startsWith('/mechanic')
      ? '/favicon-mechanic.png?v=2'
      : '/logo.svg';
  var icon = document.querySelector('link[rel="icon"]');
  if (icon) {
    icon.href = href;
    icon.type = href.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  }
})();
