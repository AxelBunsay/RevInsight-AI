const validateProductInput = (input) => {
  const fieldErrors = {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const price = Number(input.price);
  const quantity = Number(input.quantity);
  const hasNumber = (value) =>
    (typeof value === 'number' || typeof value === 'string') &&
    String(value).trim() !== '' &&
    Number.isFinite(Number(value));

  if (name.length < 2 || name.length > 80) {
    fieldErrors.name = 'Name must be between 2 and 80 characters.';
  }
  if (!hasNumber(input.price) || price < 0.01 || price > 999999.99) {
    fieldErrors.price = 'Price must be between 0.01 and 999,999.99.';
  }
  if (
    !hasNumber(input.quantity) ||
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > 99999
  ) {
    fieldErrors.quantity = 'Stock must be a whole number from 0 to 99,999.';
  }
  if (typeof input.category !== 'string' || !input.category.trim()) {
    fieldErrors.category = 'Category is required.';
  }

  return fieldErrors;
};

const validateServiceInput = (input, current = {}) => {
  const fieldErrors = {};
  const name = typeof input.name === 'string' ? input.name.trim() : current.name;
  const description = input.description ?? current.description ?? '';
  const priceValue = input.price ?? current.price;
  const mechanicFeeValue = input.mechanicFee ?? current.mechanicFee;
  const categoryValue = input.category ?? current.category ?? 'General';
  const durationMinutesValue = input.durationMinutes ?? current.durationMinutes ?? 60;
  const price = Number(priceValue);
  const mechanicFee = Number(mechanicFeeValue);
  const durationMinutes = Number(durationMinutesValue);
  const hasNumber = (value) =>
    (typeof value === 'number' || typeof value === 'string') &&
    String(value).trim() !== '' &&
    Number.isFinite(Number(value));

  if (typeof name !== 'string' || name.length < 2 || name.length > 80) {
    fieldErrors.name = 'Name must be between 2 and 80 characters.';
  }
  if (typeof description !== 'string' || description.length > 300) {
    fieldErrors.description = 'Description must be 300 characters or fewer.';
  }
  if (!hasNumber(priceValue) || price < 0.01 || price > 999999.99) {
    fieldErrors.price = 'Price must be between 0.01 and 999,999.99.';
  }
  if (
    !hasNumber(mechanicFeeValue) ||
    !Number.isFinite(mechanicFee) ||
    mechanicFee < 0 ||
    mechanicFee > 999999.99
  ) {
    fieldErrors.mechanicFee = 'Mechanic fee must be between 0 and 999,999.99.';
  } else if (Number.isFinite(price) && mechanicFee > price) {
    fieldErrors.mechanicFee = 'Mechanic fee cannot be greater than the service price.';
  }
  if (typeof categoryValue !== 'string' || !categoryValue.trim() || categoryValue.length > 80) {
    fieldErrors.category = 'Category must be between 1 and 80 characters.';
  }
  if (!hasNumber(durationMinutesValue) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
    fieldErrors.durationMinutes = 'Duration must be a whole number from 1 to 1,440 minutes.';
  }

  return fieldErrors;
};

module.exports = { validateProductInput, validateServiceInput };
