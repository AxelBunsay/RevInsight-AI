const SERVICE_CATEGORIES = require('../../shared/serviceCategories.json');

const isServiceCategory = (category) =>
  typeof category === 'string' && SERVICE_CATEGORIES.includes(category.trim());

const normalizeServiceCategory = (category) =>
  isServiceCategory(category) ? category.trim() : 'General';

module.exports = {
  SERVICE_CATEGORIES,
  isServiceCategory,
  normalizeServiceCategory
};
