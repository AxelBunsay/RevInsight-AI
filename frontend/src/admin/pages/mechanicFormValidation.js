import { cleanAndValidateMobileNumber, MOBILE_NUMBER_ERROR } from "../../../../shared/mobileNumber.mjs";

export function isValidMechanicUsername(username) {
  return typeof username === "string"
    && /^[a-z0-9][a-z0-9._-]{3,19}$/i.test(username.trim());
}

export function isValidPhilippinePhone(phoneNumber) {
  return cleanAndValidateMobileNumber(phoneNumber).isValid;
}

export function getMechanicFormError(form, isEditing) {
  if (!form.firstName.trim() || !form.lastName.trim() || !form.specialization) {
    return "Full name and specialization are required.";
  }
  if (!isValidMechanicUsername(form.username)) {
    return "Username must be 4-20 characters, start with a letter or number, and use only letters, numbers, dots, underscores or hyphens.";
  }
  if (!isValidPhilippinePhone(form.phoneNumber)) {
    return MOBILE_NUMBER_ERROR;
  }
  if (!isEditing && (!form.password || form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))) {
    return "Password must be at least 8 characters and include a letter and a number.";
  }
  if (isEditing && form.password && (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password))) {
    return "Password must be at least 8 characters and include a letter and a number.";
  }
  if (
    form.yearsOfExperience === null
    || form.yearsOfExperience === undefined
    || (typeof form.yearsOfExperience === "string" && !form.yearsOfExperience.trim())
    || !Number.isFinite(Number(form.yearsOfExperience))
    || Number(form.yearsOfExperience) < 0
  ) {
    return "Years of experience must be zero or greater.";
  }
  return "";
}
