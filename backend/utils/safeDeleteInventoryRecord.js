const BusinessRecord = require('../models/businessRecord');
const Cart = require('../models/orderingModels/cart');
const Order = require('../models/orderingModels/order');
const Product = require('../models/product');
const ServiceRequest = require('../models/serviceRequest');
const Service = require('../models/service');
const Reservation = require('../models/orderingModels/reservation');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasActiveProductReservation = (productId) => Reservation.exists({
  code: { $exists: true },
  status: { $in: ['Pending Down Payment', 'Payment Submitted', 'Reserved'] },
  'items.productId': productId
});

const archiveOrDeleteProduct = async (product) => {
  const itemNamePattern = new RegExp(`(^|,\\s*)${escapeRegex(product.name)}(\\s*,|$)`, 'i');
  const [order, cart, businessRecord, reservation] = await Promise.all([
    Order.exists({
      $or: [
        { 'items.productId': product._id },
        { 'items.productName': product.name }
      ]
    }),
    Cart.exists({ 'items.productId': product._id }),
    BusinessRecord.exists({
      recordType: 'product',
      $or: [
        { sourceId: product._id },
        { itemName: itemNamePattern }
      ]
    }),
    Reservation.exists({ 'items.productId': product._id })
  ]);

  if (order || cart || businessRecord || reservation) {
    product.isActive = false;
    await product.save();
    return { archived: true };
  }

  await Product.deleteOne({ _id: product._id });
  return { archived: false };
};

const archiveOrDeleteService = async (service) => {
  const [serviceRequest, businessRecord] = await Promise.all([
    ServiceRequest.exists({ serviceType: new RegExp(`^\\s*${escapeRegex(service.name)}\\s*$`, 'i') }),
    BusinessRecord.exists({
      recordType: 'service',
      $or: [
        { sourceId: service._id },
        { itemName: new RegExp(`^\\s*${escapeRegex(service.name)}\\s*$`, 'i') }
      ]
    })
  ]);

  if (serviceRequest || businessRecord) {
    service.isActive = false;
    await service.save();
    return { archived: true };
  }

  await Service.deleteOne({ _id: service._id });
  return { archived: false };
};

module.exports = { archiveOrDeleteProduct, archiveOrDeleteService, hasActiveProductReservation };
