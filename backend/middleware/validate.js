const validateRegister = (req, res, next) => {
  const { email, password, firstName, lastName, phoneNumber } = req.body;

  if (!email || !password || !firstName || !lastName || !phoneNumber) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and include a letter and a number.' });
  }

  const digits = typeof phoneNumber === 'string' ? phoneNumber.replace(/\D/g, '') : '';
  const localNumber = digits.startsWith('63')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  if (!/^9\d{9}$/.test(localNumber)) {
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  next();
};

const validateUpdateProfile = (req, res, next) => {
  const { firstName, lastName, phoneNumber, profileImage, preferences } = req.body;

  if (firstName === '' || lastName === '' || phoneNumber === '') {
    return res.status(400).json({ message: 'Fields cannot be empty' });
  }

  next();
};

const validateCustomerProfile = (req, res, next) => {
  const { firstName, lastName, phoneNumber } = req.body || {};

  if (typeof firstName !== 'string' || !firstName.trim()) {
    return res.status(400).json({ message: 'First name is required.' });
  }
  if (typeof lastName !== 'string' || !lastName.trim()) {
    return res.status(400).json({ message: 'Last name is required.' });
  }
  if (typeof phoneNumber !== 'string') {
    return res.status(400).json({ message: 'Phone number is required.' });
  }

  const digits = phoneNumber.replace(/\D/g, '');
  const localNumber = digits.startsWith('63')
    ? digits.slice(2)
    : digits.startsWith('0')
      ? digits.slice(1)
      : digits;
  if (!/^9\d{9}$/.test(localNumber)) {
    return res.status(400).json({ message: 'Enter a valid Philippine mobile number.' });
  }

  next();
};

const validateCreateMechanic = (req, res, next) => {
  const { email, password, firstName, lastName, phoneNumber, specialization, yearsOfExperience } = req.body;

  if (!email || !password || !firstName || !lastName || !phoneNumber || !specialization || yearsOfExperience === undefined) {
    return res.status(400).json({ message: 'All required fields must be provided' });
  }

  if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and include a letter and a number.' });
  }

  const validSpecializations = ['general', 'engine', 'transmission', 'electrical', 'suspension', 'brakes'];
  if (!validSpecializations.includes(specialization)) {
    return res.status(400).json({ message: 'Invalid specialization' });
  }

  if (yearsOfExperience < 0) {
    return res.status(400).json({ message: 'Years of experience cannot be negative' });
  }

  next();
};

const validateUpdateMechanic = (req, res, next) => {
  const { firstName, lastName, phoneNumber, specialization, yearsOfExperience, availabilityStatus, successRate } = req.body;

  if (firstName === '' || lastName === '' || phoneNumber === '') {
    return res.status(400).json({ message: 'Fields cannot be empty' });
  }

  if (specialization) {
    const validSpecializations = ['general', 'engine', 'transmission', 'electrical', 'suspension', 'brakes'];
    if (!validSpecializations.includes(specialization)) {
      return res.status(400).json({ message: 'Invalid specialization' });
    }
  }

  if (yearsOfExperience !== undefined && yearsOfExperience < 0) {
    return res.status(400).json({ message: 'Years of experience cannot be negative' });
  }

  if (availabilityStatus) {
    const validStatuses = ['available', 'busy', 'on-leave'];
    if (!validStatuses.includes(availabilityStatus)) {
      return res.status(400).json({ message: 'Invalid availability status' });
    }
  }

  if (successRate !== undefined && (successRate < 0 || successRate > 100)) {
    return res.status(400).json({ message: 'Success rate must be between 0 and 100' });
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
