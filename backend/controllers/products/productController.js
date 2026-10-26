const Product = require('../../models/product');
const mongoose = require('mongoose');
const Reservation = require('../../models/orderingModels/reservation');
const { archiveOrDeleteProduct } = require('../../utils/safeDeleteInventoryRecord');
const {
  getProductImagePublicId,
  removeProductImageSafely
} = require('../../utils/productImage');
const { prepareProductMutation, serializePublicVariants } = require('../../utils/productVariants');

const serializeProduct = (product) => ({
  ...product.toObject(),
  image: product.image || product.imageUrl || null,
  imageUrl: product.imageUrl || product.image || null,
  variants: serializePublicVariants(product.variants || [])
});

const validateProductId = (id, res) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({
      success: false,
      message: 'Invalid product id'
    });
    return false;
  }

  return true;
};

const createProduct = async (req, res) => {
  let prepared;
  try {
    prepared = await prepareProductMutation({
      input: req.body,
      productFile: req.file,
      variantFiles: req.variantFiles,
      Reservation
    });
    const product = await Product.create(prepared.data);
    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product: serializeProduct(product)
    });
  } catch (error) {
    for (const image of prepared?.uploadedImages || error.uploadedImages || []) {
      await removeProductImageSafely(image.imagePublicId, 'createProduct.rollback');
    }
    res.status(error.status || 400).json({
      success: false,
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
    });
  }
};

const getProducts = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;
    const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fitment = {};
    for (const field of ['brand', 'model']) {
      const value = typeof req.query[field] === 'string' ? req.query[field].trim() : '';
      if (value) fitment[field] = new RegExp(`^${escapeRegex(value)}$`, 'i');
    }
    const filter = { isActive: { $ne: false } };
    if (Object.keys(fitment).length) filter.variants = { $elemMatch: fitment };
    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Product.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      count: total,
      products: products.map(serializeProduct),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getProduct = async (req, res) => {
  try {
    if (!validateProductId(req.params.id, res)) return;

    const product = await Product.findOne({ _id: req.params.id, isActive: { $ne: false } });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      product: serializeProduct(product)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const updateProduct = async (req, res) => {
  let prepared;
  try {
    if (!validateProductId(req.params.id, res)) return;

    const currentProduct = await Product.findById(req.params.id);

    if (!currentProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    prepared = await prepareProductMutation({
      input: req.body,
      currentProduct,
      productFile: req.file,
      variantFiles: req.variantFiles,
      Reservation
    });
    currentProduct.set(prepared.data);
    const product = await currentProduct.save();
    for (const publicId of prepared.obsoleteImagePublicIds) {
      await removeProductImageSafely(publicId, 'updateProduct');
    }

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product: serializeProduct(product)
    });
  } catch (error) {
    for (const image of prepared?.uploadedImages || error.uploadedImages || []) {
      await removeProductImageSafely(image.imagePublicId, 'updateProduct.rollback');
    }
    res.status(error.status || 400).json({
      success: false,
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {})
    });
  }
};

const deleteProduct = async (req, res) => {
  try {
    if (!validateProductId(req.params.id, res)) return;

    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const { archived } = await archiveOrDeleteProduct(product);
    if (!archived) {
      await removeProductImageSafely(
        product.imagePublicId || getProductImagePublicId(product.imageUrl || product.image),
        'deleteProduct'
      );
      for (const variant of product.variants || []) {
        await removeProductImageSafely(
          variant.imagePublicId || getProductImagePublicId(variant.imageUrl),
          'deleteProduct.variant'
        );
      }
    }
    res.status(200).json({
      success: true,
      archived,
      message: archived ? 'Product archived because it is referenced by past records' : 'Product deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct
};