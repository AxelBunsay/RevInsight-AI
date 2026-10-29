const {
  normalizeProductCategory,
  productCategoryErrorMessage
} = require('./productCategories');

const validateProductInput = (input, { hasVariants = false } = {}) => {
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
  if (!hasNumber(input.price) || price < (hasVariants ? 0 : 0.01) || price > 999999.99) {
    fieldErrors.price = `Price must be between ${hasVariants ? '0' : '0.01'} and 999,999.99.`;
  }
  if (!hasVariants && (
    !hasNumber(input.quantity) ||
    !Number.isInteger(quantity) ||
    quantity < 0 ||
    quantity > 99999
  )) {
    fieldErrors.quantity = 'Stock must be a whole number from 0 to 99,999.';
  }
  if (!normalizeProductCategory(input.category)) {
    fieldErrors.category = productCategoryErrorMessage();
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
  const pricePerUnitValue = input.pricePerUnit ?? current.pricePerUnit ?? false;
  const unitLabelValue = input.unitLabel ?? current.unitLabel ?? '';
  const maxUnitsValue = input.maxUnits ?? current.maxUnits ?? 2;
  const scaleDurationValue = input.scaleDuration ?? current.scaleDuration ?? true;
  const price = Number(priceValue);
  const mechanicFee = Number(mechanicFeeValue);
  const durationMinutes = Number(durationMinutesValue);
  const maxUnits = Number(maxUnitsValue);
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
  if (typeof pricePerUnitValue !== 'boolean') {
    fieldErrors.pricePerUnit = 'Charge per unit must be enabled or disabled.';
  }
  if (typeof unitLabelValue !== 'string' || unitLabelValue.trim().length > 40) {
    fieldErrors.unitLabel = 'Unit name must be 40 characters or fewer.';
  } else if (pricePerUnitValue && !unitLabelValue.trim()) {
    fieldErrors.unitLabel = 'Unit name is required when charging per unit.';
  }
  if (!hasNumber(maxUnitsValue) || !Number.isInteger(maxUnits) || maxUnits < 1 || maxUnits > 10) {
    fieldErrors.maxUnits = 'Maximum units must be a whole number from 1 to 10.';
  }
  if (typeof scaleDurationValue !== 'boolean') {
    fieldErrors.scaleDuration = 'Longer duration must be enabled or disabled.';
  }

  return fieldErrors;
};

module.exports = { validateProductInput, validateServiceInput };
