export function getPasswordInputType(isVisible) {
  return isVisible ? "text" : "password";
}

export function togglePasswordVisibility(isVisible) {
  return !isVisible;
}
