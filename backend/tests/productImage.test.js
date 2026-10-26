import { describe, expect, it } from 'vitest';
import productImage from '../utils/productImage.js';

const { validateProductImage } = productImage;

describe('product image validation', () => {
  it('accepts PNG bytes with matching MIME type', () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => validateProductImage({ buffer, size: buffer.length, mimetype: 'image/png' })).not.toThrow();
  });

  it('accepts JPEG bytes with matching MIME type', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    expect(() => validateProductImage({ buffer, size: buffer.length, mimetype: 'image/jpeg' })).not.toThrow();
  });

  it('accepts WEBP bytes with matching MIME type', () => {
    const buffer = Buffer.from('RIFF0000WEBP', 'ascii');
    expect(() => validateProductImage({ buffer, size: buffer.length, mimetype: 'image/webp' })).not.toThrow();
  });

  it('rejects a mismatched MIME type or invalid image bytes', () => {
    const buffer = Buffer.from('not an image');
    expect(() => validateProductImage({ buffer, size: buffer.length, mimetype: 'image/png' })).toThrow(/real PNG, JPG, or WEBP/);
  });

  it('rejects images larger than 2 MB', () => {
    const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
    expect(() => validateProductImage({ buffer, size: buffer.length, mimetype: 'image/webp' })).toThrow(/2 MB or smaller/);
  });
});
