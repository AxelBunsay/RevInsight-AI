const User = require('../models/user');
const Mechanic = require('../models/mechanic');

const MOBILE_NUMBER_ERROR = 'Enter a valid mobile number (11 digits, starts with 09)';

async function checkMobileNumberChange(value, existingValue) {
  const { cleanAndValidateMobileNumber } = await import('../../shared/mobileNumber.mjs');
  const submitted = cleanAndValidateMobileNumber(value);
  const saved = cleanAndValidateMobileNumber(existingValue);
  const unchanged = Boolean(value)
    && (value === existingValue || (saved.canonicalDigits && submitted.canonicalDigits === saved.canonicalDigits));
  return { ...submitted, unchanged, isValid: submitted.isValid || unchanged };
}

const validateRegister = async (req, res, next) => {
  const { email, username, password, firstName, lastName, phoneNumber } = req.body;

  if (!email || !username || !password || !firstName || !lastName) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const { normalizeCustomerUsername, validateCustomerUsername } = await import('../../shared/customerUsername.mjs');
  const usernameValidation = validateCustomerUsername(username);
  if (!usernameValidation.isValid) {
    return res.status(400).json({ message: usernameValidation.message });
  }
  req.body.username = normalizeCustomerUsername(username);
  req.body.usernameLower = req.body.username.toLowerCase();

  if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and include a letter and a number.' });
  }

  if (typeof phoneNumber !== 'string' || !phoneNumber) {
    return res.status(400).json({ message: MOBILE_NUMBER_ERROR });
  }
  const { cleanAndValidateMobileNumber } = await import('../../shared/mobileNumber.mjs');
  const mobileNumber = cleanAndValidateMobileNumber(phoneNumber);
  if (!mobileNumber.isValid) return res.status(400).json({ message: MOBILE_NUMBER_ERROR });
  req.body.phoneNumber = mobileNumber.digits;
  return next();
};

const validateLogin = (req, res, next) => {
  const identifier = req.body.identifier ?? req.body.email;
  const { password } = req.body;

  if (typeof identifier !== 'string' || !identifier.trim() || !password) {
    return res.status(400).json({ message: 'Username or email and password are required' });
  }

  next();
};

const validateUpdateProfile = async (req, res, next) => {
  const { firstName, lastName, phoneNumber, profileImage, preferences } = req.body;

  if (firstName === '' || lastName === '') {
    return res.status(400).json({ message: 'Fields cannot be empty' });
  }

  if (phoneNumber !== undefined) {
    const { cleanAndValidateMobileNumber } = await import('../../shared/mobileNumber.mjs');
    const submitted = cleanAndValidateMobileNumber(phoneNumber);
    if (submitted.isValid) {
      req.body.phoneNumber = submitted.digits;
    } else {
      const existing = req.user?.userId ? await User.findById(req.user.userId).select('phoneNumber').lean() : null;
      const mobileNumber = await checkMobileNumberChange(phoneNumber, existing?.phoneNumber);
      if (!mobileNumber.isValid) return res.status(400).json({ message: MOBILE_NUMBER_ERROR });
      req.phoneNumberUnchanged = mobileNumber.unchanged;
    }
  }
  next();
};

const validateCustomerProfile = async (req, res, next) => {
  const { firstName, lastName, phoneNumber } = req.body || {};

  if (typeof firstName !== 'string' || !firstName.trim()) {
    return res.status(400).json({ message: 'First name is required.' });
  }
  if (typeof lastName !== 'string' || !lastName.trim()) {
    return res.status(400).json({ message: 'Last name is required.' });
  }
  if (phoneNumber !== undefined) {
    const { cleanAndValidateMobileNumber } = await import('../../shared/mobileNumber.mjs');
    const submitted = cleanAndValidateMobileNumber(phoneNumber);
    if (submitted.isValid) {
      req.body.phoneNumber = submitted.digits;
    } else {
      const existing = req.user?.userId ? await User.findById(req.user.userId).select('phoneNumber').lean() : null;
      const mobileNumber = await checkMobileNumberChange(phoneNumber, existing?.phoneNumber);
      if (!mobileNumber.isValid) return res.status(400).json({ message: MOBILE_NUMBER_ERROR });
      req.phoneNumberUnchanged = mobileNumber.unchanged;
    }
  }

  next();
};

const isValidMechanicUsername = (username) => (
  typeof username === 'string'
  && /^[a-z0-9][a-z0-9._-]{3,19}$/i.test(username.trim())
);

const validateCreateMechanic = async (req, res, next) => {
  const { email, username, password, firstName, lastName, phoneNumber, specialization, yearsOfExperience } = req.body || {};

  if (
    !username || !password
    || typeof firstName !== 'string' || !firstName.trim()
    || typeof lastName !== 'string' || !lastName.trim()
    || !specialization || yearsOfExperience === undefined
  ) {
    return res.status(400).json({ message: 'All required fields must be provided' });
  }

  if (!isValidMechanicUsername(username)) {
    return res.status(400).json({ message: 'Username must be 4-20 characters, start with a letter or number, and use only letters, numbers, dots, underscores or hyphens.' });
  }

  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || !/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email.trim())) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
  }

  if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and include a letter and a number.' });
  }

  const validSpecializations = ['general', 'engine', 'transmission', 'electrical', 'suspension', 'brakes'];
  if (!validSpecializations.includes(specialization)) {
    return res.status(400).json({ message: 'Invalid specialization' });
  }

  if (
    yearsOfExperience === null
    || (typeof yearsOfExperience === 'string' && !yearsOfExperience.trim())
    || !Number.isFinite(Number(yearsOfExperience))
    || Number(yearsOfExperience) < 0
  ) {
    return res.status(400).json({ message: 'Years of experience must be zero or greater.' });
  }

  const { cleanAndValidateMobileNumber } = await import('../../shared/mobileNumber.mjs');
  const mobileNumber = cleanAndValidateMobileNumber(phoneNumber);
  if (!mobileNumber.isValid) return res.status(400).json({ message: MOBILE_NUMBER_ERROR });
  req.body.phoneNumber = mobileNumber.digits;
  return next();
};

const validateUpdateMechanic = async (req, res, next) => {
  const { firstName, lastName, username, phoneNumber, specialization, yearsOfExperience, availabilityStatus } = req.body || {};

  if (firstName === '' || lastName === '') {
    return res.status(400).json({ message: 'Fields cannot be empty' });
  }
  if (firstName !== undefined && (typeof firstName !== 'string' || !firstName.trim())) {
    return res.status(400).json({ message: 'First name cannot be empty.' });
  }
  if (lastName !== undefined && (typeof lastName !== 'string' || !lastName.trim())) {
    return res.status(400).json({ message: 'Last name cannot be empty.' });
  }

  if (username !== undefined && !isValidMechanicUsername(username)) {
    return res.status(400).json({ message: 'Username must be 4-20 characters, start with a letter or number, and use only letters, numbers, dots, underscores or hyphens.' });
  }

  if (phoneNumber !== undefined) {
    const { cleanAndValidateMobileNumber } = await import('../../shared/mobileNumber.mjs');
    const submitted = cleanAndValidateMobileNumber(phoneNumber);
    if (submitted.isValid) {
      req.body.phoneNumber = submitted.digits;
    } else {
      const mechanicId = req.params?.id || req.user?.userId;
      const existing = mechanicId ? await Mechanic.findById(mechanicId).select('phoneNumber').lean() : null;
      const mobileNumber = await checkMobileNumberChange(phoneNumber, existing?.phoneNumber);
      if (!mobileNumber.isValid) return res.status(400).json({ message: MOBILE_NUMBER_ERROR });
      req.phoneNumberUnchanged = mobileNumber.unchanged;
    }
  }

  if (specialization) {
    const validSpecializations = ['general', 'engine', 'transmission', 'electrical', 'suspension', 'brakes'];
    if (!validSpecializations.includes(specialization)) {
      return res.status(400).json({ message: 'Invalid specialization' });
    }
  }

  if (yearsOfExperience !== undefined && (
    yearsOfExperience === null
    || (typeof yearsOfExperience === 'string' && !yearsOfExperience.trim())
    || !Number.isFinite(Number(yearsOfExperience))
    || Number(yearsOfExperience) < 0
  )) {
    return res.status(400).json({ message: 'Years of experience must be zero or greater.' });
  }

  if (availabilityStatus) {
    const validStatuses = ['available', 'busy', 'on-leave'];
    if (!validStatuses.includes(availabilityStatus)) {
      return res.status(400).json({ message: 'Invalid availability status' });
    }
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateCustomerProfile,
  validateCreateMechanic,
  validateUpdateMechanic
};
