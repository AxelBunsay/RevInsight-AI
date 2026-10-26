const mongoose = require('mongoose');
const {
  uploadProductImage,
  getProductImagePublicId,
  removeProductImageSafely
} = require('./productImage');
const { validateProductInput } = require('./inventoryValidation');

const inputError = (message, status = 400) => Object.assign(new Error(message), { status });
const isRemoveRequested = (value) => value === true || value === 'true';
const hasValidNumber = (value) =>
  (typeof value === 'number' || typeof value === 'string')
  && String(value).trim() !== ''
  && Number.isFinite(Number(value));

function parseVariants(value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') throw inputError('Variants must be an array.');
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw inputError('Variants must be an array.');
    return parsed;
  } catch (error) {
    if (error.status) throw error;
    throw inputError('Variants must be valid JSON.');
  }
}

async function prepareVariants(value, currentProduct, files = []) {
  const inputVariants = parseVariants(value);
  if (inputVariants === undefined) return undefined;
  if (inputVariants.length > 50) throw inputError('A product can have at most 50 variants.');

  const currentVariants = currentProduct?.variants || [];
  const seenIds = new Set();
  const combinations = new Set();
  const uploadedImages = [];
  const variants = [];

  try {
    for (const [index, input] of inputVariants.entries()) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw inputError(`Variant ${index + 1} must be an object.`);
      }

      const variant = {};
      for (const field of ['brand', 'model', 'size', 'color']) {
        const value = input[field] ?? '';
        if (typeof value !== 'string') throw inputError(`Variant ${index + 1} ${field} must be text.`);
        variant[field] = value.trim();
        if (variant[field].length > 120) throw inputError(`Variant ${index + 1} ${field} must be 120 characters or fewer.`);
      }
      if (!variant.brand && !variant.model && !variant.size && !variant.color) {
        throw inputError(`Variant ${index + 1} needs a brand, model, size, or color.`);
      }

      const combination = ['brand', 'model', 'size', 'color']
        .map((field) => variant[field].toLowerCase())
        .join('\u0000');
      if (combinations.has(combination)) {
        throw inputError('Variant attribute combinations must be unique within a product.');
      }
      combinations.add(combination);

      if (!hasValidNumber(input.price) || Number(input.price) < 0) {
        throw inputError(`Variant ${index + 1} price must be a number greater than or equal to 0.`);
      }
      if (!hasValidNumber(input.stock) || !Number.isInteger(Number(input.stock)) || Number(input.stock) < 0) {
        throw inputError(`Variant ${index + 1} stock must be a whole number greater than or equal to 0.`);
      }
      variant.price = Number(input.price);
      variant.stock = Number(input.stock);

      if (input.sku !== undefined && input.sku !== null && typeof input.sku !== 'string') {
        throw inputError(`Variant ${index + 1} SKU must be text.`);
      }
      variant.sku = String(input.sku || '').trim();

      let currentVariant;
      if (input._id !== undefined && input._id !== '') {
        if (!mongoose.Types.ObjectId.isValid(input._id)) throw inputError(`Variant ${index + 1} has an invalid ID.`);
        const id = String(input._id);
        if (seenIds.has(id)) throw inputError('Variant IDs must be unique.');
        seenIds.add(id);
        currentVariant = currentVariants.find((entry) => String(entry._id) === id);
        if (!currentVariant) throw inputError(`Variant ${index + 1} does not belong to this product.`);
        variant._id = currentVariant._id;
      }

      variant.reservedQty = Number(currentVariant?.reservedQty || 0);
      if (variant.stock < variant.reservedQty) {
        throw inputError(`Variant ${currentVariant.label || index + 1} stock cannot be lower than its ${variant.reservedQty} reserved units.`, 409);
      }

      const imageFile = files.find((file) => file.fieldname === `variantImage_${index}`);
      if (imageFile) {
        const uploaded = await uploadProductImage(imageFile);
        uploadedImages.push(uploaded);
        variant.imageUrl = uploaded.imageUrl;
        variant.imagePublicId = uploaded.imagePublicId;
      } else if (currentVariant && !isRemoveRequested(input.removeImage)) {
        variant.imageUrl = currentVariant.imageUrl || '';
        variant.imagePublicId = currentVariant.imagePublicId || '';
      } else {
        variant.imageUrl = '';
        variant.imagePublicId = '';
      }

      variants.push(variant);
    }
  } catch (error) {
    error.uploadedImages = uploadedImages;
    throw error;
  }

  return { variants, uploadedImages };
}

function getVariantStockTotals(variants = []) {
  return variants.reduce((totals, variant) => ({
    quantity: totals.quantity + Number(variant.stock || 0),
    reservedQty: totals.reservedQty + Number(variant.reservedQty || 0)
  }), { quantity: 0, reservedQty: 0 });
}

function serializePublicVariants(variants = []) {
  return variants.map((variant) => {
    const available = Math.max(0, Number(variant.stock || 0) - Number(variant.reservedQty || 0));
    const imageUrl = variant.imageUrl || '';
    return {
      _id: variant._id,
      brand: variant.brand || '',
      model: variant.model || '',
      size: variant.size || '',
      color: variant.color || '',
      label: variant.label || '',
      price: variant.price,
      stock: available,
      availableStock: available,
      image: imageUrl,
      imageUrl
    };
  });
}

async function validateVariantReservationReferences(productId, currentVariants, nextVariants, Reservation) {
  if (!productId || !currentVariants.length && !nextVariants.length) return;
  const activeReservations = await Reservation.find({
    code: { $exists: true },
    status: { $in: ['Pending Down Payment', 'Payment Submitted', 'Reserved'] },
    'items.productId': productId
  }).select('items').lean();
  if (!activeReservations.length) return;

  const nextIds = new Set(nextVariants.map((variant) => String(variant._id)));
  const removedIds = new Set(currentVariants
    .filter((variant) => !nextIds.has(String(variant._id)))
    .map((variant) => String(variant._id)));
  for (const reservation of activeReservations) {
    for (const item of reservation.items) {
      if (String(item.productId) !== String(productId)) continue;
      if (!item.variantId || removedIds.has(String(item.variantId))) {
        throw inputError('Variants cannot be changed while an active reservation references this product or variant.', 409);
      }
    }
  }
}

async function prepareProductMutation({ input, currentProduct, productFile, variantFiles = [], Reservation }) {
  const uploadedImages = [];
  try {
    const parsedVariants = parseVariants(input.variants);
    let variants;
    if (parsedVariants === undefined) {
      variants = currentProduct?.variants?.length ? currentProduct.variants : undefined;
    } else {
      const prepared = await prepareVariants(parsedVariants, currentProduct, variantFiles);
      variants = prepared.variants;
      uploadedImages.push(...prepared.uploadedImages);
      await validateVariantReservationReferences(
        currentProduct?._id,
        currentProduct?.variants || [],
        variants,
        Reservation
      );
    }

    const hasVariants = Boolean(variants?.length);
    const totals = getVariantStockTotals(variants || []);
    if (!hasVariants && currentProduct && Number(input.quantity) < Number(currentProduct.reservedQty || 0)) {
      throw inputError(`Stock cannot be lower than the ${currentProduct.reservedQty} units currently reserved.`, 400);
    }
    if (hasVariants && (totals.quantity > 99999 || totals.reservedQty > 99999)) {
      throw inputError('Combined variant stock cannot exceed 99,999 units.');
    }
    const firstVariantPrice = hasVariants ? Number(variants[0].price) : undefined;
    const validationInput = {
      ...input,
      price: hasVariants ? firstVariantPrice : input.price,
      quantity: hasVariants ? totals.quantity : input.quantity
    };
    const fieldErrors = validateProductInput(validationInput, { hasVariants });
    if (Object.keys(fieldErrors).length) {
      throw Object.assign(inputError('Please correct the highlighted fields.'), { fieldErrors });
    }

    let productImage;
    if (productFile) {
      productImage = await uploadProductImage(productFile);
      uploadedImages.push(productImage);
    }
    const oldProductImagePublicId = currentProduct?.imagePublicId
      || getProductImagePublicId(currentProduct?.imageUrl || currentProduct?.image);
    const oldVariantImages = new Map((currentProduct?.variants || []).map((variant) => [
      String(variant._id),
      variant.imagePublicId || getProductImagePublicId(variant.imageUrl)
    ]));
    const obsoleteImagePublicIds = [];
    for (const [id, publicId] of oldVariantImages) {
      const nextVariant = (variants || []).find((variant) => String(variant._id) === id);
      if (publicId && (!nextVariant || nextVariant.imagePublicId !== publicId)) obsoleteImagePublicIds.push(publicId);
    }
    const removeProductImage = input.removeImage === true || input.removeImage === 'true';
    if (oldProductImagePublicId && (productImage || removeProductImage)) obsoleteImagePublicIds.push(oldProductImagePublicId);

    const data = {
      name: input.name.trim(),
      price: hasVariants ? firstVariantPrice : Number(input.price),
      quantity: hasVariants ? totals.quantity : Number(input.quantity),
      category: input.category.trim()
    };
    if (variants !== undefined && parsedVariants !== undefined) data.variants = variants;
    if (productImage) Object.assign(data, productImage, { image: productImage.imageUrl });
    else if (removeProductImage) Object.assign(data, { image: null, imageUrl: null, imagePublicId: null });
    if (hasVariants) data.reservedQty = totals.reservedQty;

    return { data, uploadedImages, obsoleteImagePublicIds };
  } catch (error) {
    const failedUploads = [...uploadedImages, ...(error.uploadedImages || [])];
    for (const image of failedUploads) {
      await removeProductImageSafely(image.imagePublicId, 'prepareProductMutation.rollback');
    }
    delete error.uploadedImages;
    throw error;
  }
}

module.exports = {
  parseVariants,
  prepareVariants,
  getVariantStockTotals,
  serializePublicVariants,
  validateVariantReservationReferences,
  prepareProductMutation
};
