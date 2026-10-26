const Product = require('../../models/product');
const mongoose = require('mongoose');
const { validateProductInput } = require('../../utils/inventoryValidation');
const { archiveOrDeleteProduct } = require('../../utils/safeDeleteInventoryRecord');
const {
  uploadProductImage,
  getProductImagePublicId,
  removeProductImageSafely
} = require('../../utils/productImage');

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
  let uploadedImage;
  try {
    const { name, price, quantity, category } = req.body;
    const fieldErrors = validateProductInput(req.body);
    if (Object.keys(fieldErrors).length) {
      return res.status(400).json({
        success: false,
        message: 'Please correct the highlighted fields.',
        fieldErrors
      });
    }
    if (req.file) uploadedImage = await uploadProductImage(req.file);

    const product = await Product.create({
      name,
      price,
      quantity,
      category,
      image: uploadedImage?.imageUrl || null,
      ...(uploadedImage || {})
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product: { ...product.toObject(), imageUrl: product.imageUrl || product.image || null }
    });
  } catch (error) {
    if (uploadedImage?.imagePublicId) {
      await removeProductImageSafely(uploadedImage.imagePublicId, 'createProduct.rollback');
    }
    res.status(error.status || 400).json({
      success: false,
      message: error.message
    });
  }
};

const getProducts = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;
    const [products, total] = await Promise.all([
      Product.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Product.countDocuments({ isActive: { $ne: false } })
    ]);

    res.status(200).json({
      success: true,
      count: total,
      products: products.map(product => ({
        ...product.toObject(),
        image: product.image || product.imageUrl || null,
        imageUrl: product.imageUrl || product.image || null
      })),
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
      product: {
        ...product.toObject(),
        image: product.image || product.imageUrl || null,
        imageUrl: product.imageUrl || product.image || null
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const updateProduct = async (req, res) => {
  let uploadedImage;
  try {
    if (!validateProductId(req.params.id, res)) return;

    const { name, price, quantity, category } = req.body;
    const fieldErrors = validateProductInput(req.body);
    if (Object.keys(fieldErrors).length) {
      return res.status(400).json({
        success: false,
        message: 'Please correct the highlighted fields.',
        fieldErrors
      });
    }
    const currentProduct = await Product.findById(req.params.id);

    if (!currentProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    if (Number(quantity) < Number(currentProduct.reservedQty || 0)) {
      return res.status(400).json({
        success: false,
        message: `Stock cannot be lower than the ${currentProduct.reservedQty} units currently reserved.`
      });
    }

    if (req.file) uploadedImage = await uploadProductImage(req.file);
    const oldImagePublicId = currentProduct.imagePublicId
      || getProductImagePublicId(currentProduct.imageUrl || currentProduct.image);
    const imageUpdate = uploadedImage
      ? { ...uploadedImage, image: uploadedImage.imageUrl }
      : req.body.removeImage === 'true' || req.body.removeImage === true
        ? { image: null, imageUrl: null, imagePublicId: null }
        : {};
    const product = await Product.findByIdAndUpdate(
      {
        _id: req.params.id,
        $or: [
          { reservedQty: { $lte: Number(quantity) } },
          { reservedQty: { $exists: false } }
        ]
      },
      { name: name.trim(), price: Number(price), quantity: Number(quantity), category: category.trim(), ...imageUpdate },
      { new: true, runValidators: true }
    );

    if (!product) {
      if (uploadedImage?.imagePublicId) {
        await removeProductImageSafely(uploadedImage.imagePublicId, 'updateProduct.rollback');
      }
      return res.status(409).json({
        success: false,
        message: 'Stock changed while saving. It cannot be set below the quantity currently reserved.'
      });
    }

    if ((uploadedImage || Object.keys(imageUpdate).length) && oldImagePublicId) {
      await removeProductImageSafely(oldImagePublicId, 'updateProduct');
    }

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      product: { ...product.toObject(), imageUrl: product.imageUrl || product.image || null }
    });
  } catch (error) {
    if (uploadedImage?.imagePublicId) {
      await removeProductImageSafely(uploadedImage.imagePublicId, 'updateProduct.rollback');
    }
    res.status(error.status || 400).json({
      success: false,
      message: error.message
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