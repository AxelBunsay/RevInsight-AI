import { describe, expect, it } from 'vitest';
import {
  getProductDetailSelection,
  getProductModalId,
  getProductModalSearch,
  getVariantControlLabel,
  removeProductModalSearch
} from './productDetailHelpers';

describe('product detail selection and modal URL helpers', () => {
  it('updates selected variant price, image, and available stock from its reserved quantity', () => {
    const product = {
      price: 250,
      quantity: 12,
      imageUrl: '/product.jpg',
      variants: [
        { _id: 'fit-a', brand: 'Honda', model: 'Wave', label: 'Honda Wave', price: 300, stock: 5, reservedQty: 2, imageUrl: '/wave.jpg' },
        { _id: 'fit-b', brand: 'Yamaha', model: 'Mio', label: 'Yamaha Mio', price: 450, stock: 4, reservedQty: 4 }
      ]
    };

    expect(getProductDetailSelection(product, 'fit-a')).toMatchObject({
      displayedPrice: 300,
      availableStock: 3,
      displayedImage: '/wave.jpg',
      variantLabel: 'Fits',
      isOutOfStock: false
    });
    expect(getProductDetailSelection(product, 'fit-b')).toMatchObject({
      displayedPrice: 450,
      availableStock: 0,
      displayedImage: '/product.jpg',
      variantLabel: 'Fits',
      isOutOfStock: true
    });
  });

  it('marks a product out of stock when every variant is unavailable', () => {
    const product = {
      variants: [
        { _id: 'fit-a', stock: 2, reservedQty: 2 },
        { _id: 'fit-b', stock: 0, reservedQty: 0 }
      ]
    };

    expect(getProductDetailSelection(product, '')).toMatchObject({
      selectedVariant: product.variants[0],
      availableStock: 0,
      isOutOfStock: true
    });
  });

  it('labels fitment, size-only, color-only, and mixed variant sets', () => {
    expect(getVariantControlLabel([{ brand: 'Honda' }, { model: 'Wave' }])).toBe('Fits');
    expect(getVariantControlLabel([{ size: '1 L' }])).toBe('Size');
    expect(getVariantControlLabel([{ color: 'Black' }])).toBe('Color');
    expect(getVariantControlLabel([{ size: '1 L' }, { color: 'Black' }])).toBe('Option');
  });

  it('reads, pushes, and removes only the modal product query while retaining other query values', () => {
    const openedSearch = getProductModalSearch('?category=Oil&search=chain', 'part-123');
    expect(openedSearch).toBe('?category=Oil&search=chain&product=part-123');
    expect(getProductModalId(openedSearch)).toBe('part-123');
    expect(removeProductModalSearch(openedSearch)).toBe('?category=Oil&search=chain');
    expect(removeProductModalSearch('?product=part-123')).toBe('');
  });
});
