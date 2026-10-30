export function getVariantAvailability(variant) {
  return Math.max(0, Number(variant?.available ?? (Number(variant?.stock || 0) - Number(variant?.reservedQty || 0))));
}

export function getVariantControlLabel(variants) {
  const hasFitment = variants.some((variant) => variant.brand || variant.model);
  const hasSize = variants.some((variant) => variant.size);
  const hasColor = variants.some((variant) => variant.color);
  const attributeKinds = Number(hasFitment) + Number(hasSize) + Number(hasColor);
  if (attributeKinds > 1 || !attributeKinds) return 'Option';
  if (hasFitment) return 'Fits';
  if (hasSize) return 'Size';
  return 'Color';
}

export function getProductDetailSelection(product, selectedVariantId) {
  const variants = product?.variants || [];
  const selectedVariant = variants.find((variant) => String(variant._id) === String(selectedVariantId))
    || variants.find((variant) => getVariantAvailability(variant) > 0)
    || variants[0];
  const availableStock = selectedVariant
    ? getVariantAvailability(selectedVariant)
    : Math.max(0, Number(product?.quantity || 0));
  return {
    variants,
    selectedVariant,
    availableStock,
    displayedPrice: Number(selectedVariant?.price ?? product?.price ?? 0),
    displayedImage: selectedVariant?.imageUrl || product?.imageUrl || product?.image,
    variantLabel: getVariantControlLabel(variants),
    isOutOfStock: availableStock <= 0
  };
}

export function getProductModalId(search) {
  return new URLSearchParams(search).get('product') || '';
}

export function getProductModalSearch(search, productId) {
  const params = new URLSearchParams(search);
  params.set('product', productId);
  return `?${params.toString()}`;
}

export function removeProductModalSearch(search) {
  const params = new URLSearchParams(search);
  params.delete('product');
  const result = params.toString();
  return result ? `?${result}` : '';
}
