import { describe, expect, it } from "vitest";
import {
  getVariantAttributeFields,
  isUniversalFitModel,
  setUniversalFitModel,
  shouldShowFitmentFields,
  supportsUniversalFit,
  validateVariantAttributes
} from "./inventoryVariantFields";

describe("inventory category variant fields", () => {
  it("uses fitment fields for the configured fitment categories", () => {
    for (const category of [
      "Brakes",
      "Cables",
      "Electrical",
      "Engine Parts",
      "Oil & Fluids",
      "Tires & Wheels"
    ]) {
      expect(shouldShowFitmentFields(category)).toBe(true);
      expect(supportsUniversalFit(category)).toBe(true);
    }
    expect(getVariantAttributeFields(true)).toEqual(["brand", "model", "size", "color"]);
  });

  it("shows size/type and color for accessories without requiring hidden fitment values", () => {
    expect(shouldShowFitmentFields("Accessory")).toBe(false);
    expect(shouldShowFitmentFields("Seat Works")).toBe(false);
    expect(supportsUniversalFit("Accessory")).toBe(false);
    expect(supportsUniversalFit("Seat Works")).toBe(false);
    expect(getVariantAttributeFields(false)).toEqual(["size", "color"]);
    expect(validateVariantAttributes({ brand: "Honda", model: "Wave" }, false)).toBe(false);
    expect(validateVariantAttributes({ size: "12V" }, false)).toBe(true);
    expect(validateVariantAttributes({ color: "Black" }, false)).toBe(true);
  });

  it("keeps existing fitment fields visible for accessory items without losing values", () => {
    const variants = [{ brand: "Honda", model: "Wave", size: "110cc", color: "" }];
    expect(shouldShowFitmentFields("Accessory", variants, true)).toBe(true);
    expect(shouldShowFitmentFields("Seat Works", variants, true)).toBe(true);
    expect(shouldShowFitmentFields("Accessory", variants, false)).toBe(false);
    expect(supportsUniversalFit("Accessory")).toBe(false);
  });

  it("requires at least one visible field for fitment variants", () => {
    expect(validateVariantAttributes({ brand: "Yamaha" }, true)).toBe(true);
    expect(validateVariantAttributes({ size: "17 inch" }, true)).toBe(true);
    expect(validateVariantAttributes({ brand: "", model: "Universal", size: "", color: "" }, true)).toBe(true);
    expect(validateVariantAttributes({ brand: "", model: "", size: "", color: "" }, true)).toBe(false);
  });

  it("uses the model value to toggle universal fit", () => {
    expect(setUniversalFitModel("", true)).toBe("Universal");
    expect(isUniversalFitModel("Universal")).toBe(true);
    expect(isUniversalFitModel(" universal ")).toBe(true);
    expect(setUniversalFitModel("Universal", false)).toBe("");
    expect(setUniversalFitModel("Wave 110", false)).toBe("Wave 110");
  });
});
