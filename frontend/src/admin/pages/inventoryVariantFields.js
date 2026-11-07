import { VARIANT_CATEGORY_FIELDS } from "../../../../shared/inventory.json";

const hasFitmentValues = (variants = []) => variants.some((variant) =>
  String(variant.brand || "").trim() || String(variant.model || "").trim()
);

export function shouldShowFitmentFields(category, variants = [], isEditingExistingItem = false) {
  const fieldType = VARIANT_CATEGORY_FIELDS[category];
  if (fieldType === "fitment") return true;
  if (fieldType === "accessory") return isEditingExistingItem && hasFitmentValues(variants);
  return true;
}

export function supportsUniversalFit(category) {
  return VARIANT_CATEGORY_FIELDS[category] === "fitment";
}

export function getVariantAttributeFields(showFitmentFields) {
  return showFitmentFields
    ? ["brand", "model", "size", "color"]
    : ["size", "color"];
}

export function validateVariantAttributes(variant, showFitmentFields) {
  return getVariantAttributeFields(showFitmentFields)
    .some((field) => String(variant[field] || "").trim());
}

export function isUniversalFitModel(model) {
  return String(model || "").trim().toLowerCase() === "universal";
}

export function setUniversalFitModel(model, isUniversalFit) {
  if (isUniversalFit) return "Universal";
  return isUniversalFitModel(model) ? "" : model;
}
