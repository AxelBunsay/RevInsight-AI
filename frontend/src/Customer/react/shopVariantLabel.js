const hasFitment = (variant) => Boolean(variant.brand || variant.model);

export const variantSelectorLabel = (variants) => {
  if (variants.some(hasFitment)) return 'Fits:';
  if (variants.length && variants.every((variant) => variant.size && !variant.color)) return 'Size:';
  if (variants.length && variants.every((variant) => variant.color && !variant.size)) return 'Color:';
  return 'Option:';
};
