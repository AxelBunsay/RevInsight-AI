const Product = require('../models/product');
const Notification = require('../models/notification');
const { LOW_STOCK_THRESHOLD, getAvailableStock } = require('./inventory');

const stateRank = { ok: 0, low: 1, out: 2 };

async function evaluateLowStockAlert(productId) {
  try {
    const product = await Product.findById(productId).lean();
    if (!product) return;

    const available = getAvailableStock(product);
    const nextState = available <= 0
      ? 'out'
      : available <= LOW_STOCK_THRESHOLD
        ? 'low'
        : 'ok';
    const currentState = ['low', 'out'].includes(product.lowStockAlertState)
      ? product.lowStockAlertState
      : 'ok';
    if (nextState === currentState) return;

    const stateFilter = currentState === 'ok'
      ? {
          $or: [
            { lowStockAlertState: 'ok' },
            { lowStockAlertState: { $exists: false } },
            { lowStockAlertState: null }
          ]
        }
      : { lowStockAlertState: currentState };
    const updatedProduct = await Product.findOneAndUpdate({
      _id: product._id,
      quantity: product.quantity,
      reservedQty: product.reservedQty,
      ...stateFilter
    }, {
      $set: { lowStockAlertState: nextState }
    }, { new: true, runValidators: true });

    if (!updatedProduct || stateRank[nextState] <= stateRank[currentState]) return;

    await Notification.create({
      audience: 'admin',
      type: nextState === 'out' ? 'out_of_stock' : 'low_stock',
      message: nextState === 'out'
        ? `${product.name} is out of stock.`
        : `${product.name} is low on stock (${available} left).`,
      link: '/admin/inventory',
      recordId: product._id,
      recordType: 'item'
    });
  } catch (error) {
    console.error('[evaluateLowStockAlert] inventory alert evaluation failed', error);
  }
}

module.exports = { evaluateLowStockAlert };
