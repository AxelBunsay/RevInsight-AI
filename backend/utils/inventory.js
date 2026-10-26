const { LOW_STOCK_THRESHOLD } = require('../../shared/inventory.json');

const getAvailableStock = (product) => Number(product?.quantity || 0)
  - Number(product?.reservedQty || 0);

const isLowStock = (availableStock) => (
  availableStock > 0 && availableStock <= LOW_STOCK_THRESHOLD
);

module.exports = { LOW_STOCK_THRESHOLD, getAvailableStock, isLowStock };
