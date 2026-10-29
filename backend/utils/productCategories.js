const { PRODUCT_CATEGORIES } = require('../../shared/inventory.json');

const normalizeProductCategory = (category) => {
  if (typeof category !== 'string') return null;
  const normalized = category.trim().toLocaleLowerCase('en');
  return PRODUCT_CATEGORIES.find((allowed) =>
    allowed.toLocaleLowerCase('en') === normalized
  ) || null;
};

const productCategoryErrorMessage = () =>
  `Choose a category from: ${PRODUCT_CATEGORIES.join(', ')}.`;

module.exports = {
  PRODUCT_CATEGORIES,
  normalizeProductCategory,
  productCategoryErrorMessage
};
