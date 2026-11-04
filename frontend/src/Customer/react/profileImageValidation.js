export const MAX_CUSTOMER_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;

export function getCustomerProfileImageValidationError(file) {
  if (!file) return '';
  if (!['image/jpeg', 'image/png'].includes(file.type)) {
    return 'Choose a JPG or PNG image.';
  }
  if (file.size > MAX_CUSTOMER_PROFILE_IMAGE_SIZE) {
    return 'Profile image must be 5 MB or smaller.';
  }
  return '';
}
