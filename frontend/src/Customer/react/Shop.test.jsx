import { describe, expect, it } from 'vitest';
import { variantSelectorLabel } from './shopVariantLabel';

describe('shop variant selector label', () => {
  it('uses Fits when any option has a motorcycle brand or model', () => {
    expect(variantSelectorLabel([
      { size: 'M' },
      { brand: 'Honda', model: 'TMX 125' }
    ])).toBe('Fits:');
  });

  it('uses Size or Color only when every option is exclusively that attribute', () => {
    expect(variantSelectorLabel([{ size: 'S' }, { size: 'M' }])).toBe('Size:');
    expect(variantSelectorLabel([{ color: 'Red' }, { color: 'Black' }])).toBe('Color:');
  });

  it('uses Option for mixed and unclassified attributes', () => {
    expect(variantSelectorLabel([{ size: 'M' }, { color: 'Black' }])).toBe('Option:');
    expect(variantSelectorLabel([])).toBe('Option:');
  });
});
