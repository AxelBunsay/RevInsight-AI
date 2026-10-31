export function getPasswordInputType(isVisible) {
  return isVisible ? "text" : "password";
}

export function togglePasswordVisibility(isVisible) {
  return !isVisible;
}

export function getMechanicLoginDestination(fromPath, returnTo) {
  const isMechanicPath = (path) => typeof path === 'string'
    && path.startsWith('/mechanic/')
    && !path.startsWith('//');

  if (isMechanicPath(fromPath)) return fromPath;
  if (isMechanicPath(returnTo)) return returnTo;
  return '/mechanic/dashboard';
}
