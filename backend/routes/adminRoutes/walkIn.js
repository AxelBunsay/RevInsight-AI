const router = require('express').Router();
const mongoose = require('mongoose');
const WalkIn = require('../../models/walkIn');
const Product = require('../../models/product');
const Service = require('../../models/service');
const ServiceRequest = require('../../models/serviceRequest');
const BusinessRecord = require('../../models/businessRecord');
const Order = require('../../models/orderingModels/order');
const upload = require('../../middleware/paymentUpload');
const receipts = require('../../utils/paymentReceipt');
const { roundMoney } = require('../../utils/servicePayment');
const { evaluateLowStockAlert } = require('../../utils/lowStockAlerts');
const { getAvailableStock } = require('../../utils/inventory');

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const validId = mongoose.isObjectIdOrHexString;

async function stockLine(line, session) {
  if (!validId(line?.productId) || !Number.isSafeInteger(line.quantity) || line.quantity < 1) fail('Choose a product and a positive whole quantity.');
  const product = await Product.findOne({ _id: line.productId, isActive: { $ne: false } }).session(session);
  if (!product) fail('Product unavailable.', 409);
  const variant = line.variantId && product.variants?.id(line.variantId);
  if ((line.variantId || product.variants?.length) && !variant) fail('Choose an available variant.');
  const available = variant ? variant.stock - variant.reservedQty : getAvailableStock(product);
  if (available < line.quantity) fail('Insufficient available stock for ' + product.name + '.', 409);
  return { product, variant };
}

router.get('/', async (req, res) => {
  const visits = await WalkIn.find({ status: { $ne: 'Paid' } }).sort({ createdAt: 1 }).select('-proofId');
  res.json({ visits });
});

router.get('/:id', async (req, res) => {
  const visit = await WalkIn.findById(req.params.id).select('-proofId');
  if (!visit) fail('Visit not found.', 404);
  res.json({ visit });
});

router.post('/', async (req, res) => {
  const { requestKey, method, items = [], serviceId } = req.body;
  if (typeof requestKey !== 'string' || !/^[\w-]{12,100}$/.test(requestKey)) fail('A visit request key is required.');
  if (!['Cash','GCash'].includes(method) || !Array.isArray(items) || items.length > 100 || (!items.length && !serviceId)) fail('Choose products or a service and a payment method.');
  const identity = { handledBy: req.admin.id, requestKey };
  let visit;
  try {
    await mongoose.connection.transaction(async session => {
      visit = await WalkIn.findOne(identity).session(session);
      if (visit) return;
      visit = new WalkIn({ ...identity, method, productTotal: 0 });
      const seen = new Set();
      for (const line of items) {
        const { product, variant } = await stockLine(line, session);
        const key = String(variant?._id || product._id);
        if (seen.has(key)) fail('Combine duplicate product lines.');
        seen.add(key);
        const price = variant?.price ?? product.price;
        visit.items.push({ productId: product._id, variantId: variant?._id, productName: product.name + (variant ? ' - ' + variant.label : ''), category: product.category, price, quantity: line.quantity });
        visit.productTotal = roundMoney(visit.productTotal + price * line.quantity);
      }
      if (serviceId) {
        if (!validId(serviceId)) fail('Choose a valid service.');
        const service = await Service.findOne({ _id: serviceId, isActive: { $ne: false } }).session(session);
        if (!service) fail('Service unavailable.');
        const [job] = await ServiceRequest.create([{
          walkInId: visit._id, serviceId, serviceCategory: service.category, serviceType: service.name,
          description: 'Walk-in Guest', estimatedPrice: roundMoney(service.price + service.mechanicFee), totalAmount: roundMoney(service.price + service.mechanicFee),
          servicePriceTotal: service.price, mechanicFeeTotal: service.mechanicFee,
          laborFee: service.mechanicFee, amountPaid: 0, paymentMethod: method
        }], { session });
        visit.jobId = job._id;
        visit.serviceTotal = job.totalAmount;
        visit.serviceName = service.name;
      }
      visit.total = roundMoney(visit.productTotal + visit.serviceTotal);
      await visit.save({ session });
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    visit = await WalkIn.findOne(identity);
    if (!visit) throw error;
  }
  res.json({ visit });
});

router.param('id', (req, res, next, id) => validId(id) ? next() : res.status(400).json({ message: 'Invalid visit ID.' }));
router.get('/:id/receipt', async (req, res) => {
  const visit = await WalkIn.findById(req.params.id);
  if (!visit?.proofId) fail('No receipt submitted.', 404);
  res.json({ url: receipts.getTemporaryReceiptUrl(visit.proofId, visit.proofFormat) });
});

router.post('/:id/receipt', upload.single('proof'), async (req, res) => {
  const reference = receipts.validateReference(req.body.reference);
  receipts.validateReceipt(req.file);
  if (!await WalkIn.exists({ _id: req.params.id, status: 'Unpaid', method: 'GCash' })) fail('Visit is not awaiting GCash proof.', 409);
  const proof = await receipts.uploadReceipt(req.file);
  let visit;
  try {
    await mongoose.connection.transaction(async session => {
      visit = await WalkIn.findOne({ _id: req.params.id, status: 'Unpaid', method: 'GCash' }).session(session);
      if (!visit) fail('Visit is not awaiting GCash proof.', 409);
      await receipts.claimPaymentReference({ reference, recordType: 'walk-in', recordId: visit._id, session });
      visit.submissions.push({ reference, proofId: proof.publicId, format: proof.format, submittedAt: new Date(), status: 'Submitted' });
      Object.assign(visit, { reference, proofId: proof.publicId, proofFormat: proof.format, status: 'Payment submitted' });
      await visit.save({ session });
    });
  } catch (error) {
    await receipts.removeReceipt(proof.publicId);
    throw error;
  }
  res.json({ visit });
});

router.post('/:id/reject', async (req, res) => {
  const reason = req.body?.reason?.trim();
  if (!reason || reason.length < 3 || reason.length > 300) fail('Give a rejection reason of 3 to 300 characters.');
  const visit = await WalkIn.findOneAndUpdate({ _id: req.params.id, status: 'Payment submitted', 'submissions.status': 'Submitted' },
    { $set: { status: 'Unpaid', 'submissions.$.status': 'Rejected', 'submissions.$.reviewedAt': new Date(),
      'submissions.$.reviewedBy': req.admin.id, 'submissions.$.reason': reason },
      $unset: { proofId: 1, proofFormat: 1, reference: 1 } }, { new: true });
  if (!visit) fail('No GCash receipt awaiting review.', 409);
  res.json({ visit });
});

router.post('/:id/confirm', async (req, res) => {
  let visit;
  await mongoose.connection.transaction(async session => {
    visit = await WalkIn.findById(req.params.id).session(session);
    if (!visit) fail('Visit not found.', 404);
    if (visit.status === 'Paid') return;
    if (visit.method === 'GCash' && visit.status !== 'Payment submitted') fail('Submit and verify the GCash receipt first.', 409);
    for (const line of visit.items) {
      const { product, variant } = await stockLine(line, session);
      if (variant) variant.stock -= line.quantity;
      else product.quantity -= line.quantity;
      await product.save({ session });
    }
    visit.paidAt = new Date();
    if (visit.items.length) {
      const [order] = await Order.create([{
        walkInId: visit._id, customerName: visit.customer, items: visit.items.toObject(),
        totalPrice: visit.productTotal, status: 'completed', createdAt: visit.paidAt
      }], { session });
      await BusinessRecord.create([{ walkInId: visit._id, paymentMethod: visit.method, recordType: 'product', sourceId: order._id, customer: visit.customer,
        itemName: visit.items.map(line => line.productName).join(', '), category: 'POS products',
        amount: visit.productTotal, completedAt: visit.paidAt, notes: 'Walk-in visit ' + visit.id }], { session });
    }
    if (visit.jobId) {
      const job = await ServiceRequest.findOneAndUpdate({ _id: visit.jobId, status: { $nin: ['declined','cancelled','completed'] } },
        { $set: { paymentStatus: visit.method === 'Cash' ? 'Paid at shop' : 'Confirmed', amountPaid: visit.serviceTotal,
          paymentConfirmedBy: req.admin.id, paymentConfirmedAt: visit.paidAt } }, { session });
      if (!job) fail('Linked job is no longer open.', 409);
    }
    if (visit.method === 'GCash') {
      const submission = visit.submissions.at(-1);
      submission.status = 'Confirmed';
      submission.reviewedAt = visit.paidAt;
      submission.reviewedBy = req.admin.id;
    }
    visit.status = 'Paid';
    visit.confirmedBy = req.admin.id;
    await visit.save({ session });
  });
  await Promise.all(visit.items.map(line => evaluateLowStockAlert(line.productId)));
  res.json({ visit });
});

router.use((error, req, res, next) => {
  const status = error.status || (error.code === 11000 ? 409 : error.name === 'MulterError' ? 400 : 500);
  res.status(status).json({ message: error.status ? error.message : 'Walk-in transaction could not be processed.' });
});
module.exports = router;
