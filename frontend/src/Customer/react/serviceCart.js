import { calculateServicePayment } from '../../utils/servicePayment';

function amount(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function replaceServiceCartItem(cart, key, item, slotAvailable = true) {
  if (!slotAvailable) return { cart, updated: false };

  const index = cart.findIndex((entry) => entry.key === key);
  if (index < 0) return { cart, updated: false };

  const nextCart = [...cart];
  nextCart[index] = { ...item, key, quantity: 1, selected: cart[index].selected !== false };
  return { cart: nextCart, updated: true };
}

export const isCartItemSelected = (item) => item.selected !== false;

export function getCartSummary(cart, downPaymentPercent = 30) {
  const selectedItems = cart.filter(isCartItemSelected);
  const products = selectedItems.filter((item) => item.kind === 'product');
  const services = selectedItems.filter((item) => item.kind === 'service');
  const productSubtotal = products.reduce((sum, item) => sum + amount(item.price) * amount(item.quantity), 0);
  const serviceSubtotal = services.reduce((sum, item) => sum + amount(
    item.estimatedPrice ?? amount(item.price) + amount(item.mechanicFee)
  ), 0);
  const downPayment = Math.round((productSubtotal * amount(downPaymentPercent) / 100 + Number.EPSILON) * 100) / 100;

  return {
    hasProducts: products.length > 0,
    hasServices: services.length > 0,
    showCartTotal: products.length > 0 && services.length > 0,
    productSubtotal,
    serviceSubtotal,
    downPayment,
    balanceDueAtPickup: productSubtotal - downPayment,
    cartTotal: productSubtotal + serviceSubtotal
  };
}

export function getServiceCartPaymentSummary(serviceItems, downPaymentPercent) {
  return serviceItems.reduce((summary, item) => {
    const total = amount(item.estimatedPrice ?? amount(item.price) + amount(item.mechanicFee));
    const payment = calculateServicePayment(total, downPaymentPercent);
    return {
      totalAmount: summary.totalAmount + payment.totalAmount,
      downPaymentAmount: summary.downPaymentAmount + payment.downPaymentAmount,
      balanceDue: summary.balanceDue + payment.balanceDue,
      downPaymentPercent: payment.downPaymentPercent
    };
  }, { totalAmount: 0, downPaymentAmount: 0, balanceDue: 0, downPaymentPercent: Number(downPaymentPercent) });
}
