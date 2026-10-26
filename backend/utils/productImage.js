const cloudinary = require('../config/cloudinary');

const MAX_PRODUCT_IMAGE_SIZE = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function validateProductImage(file) {
  if (!file) return;
  if (!Buffer.isBuffer(file.buffer)) {
    throw Object.assign(new Error('Product image could not be read. Choose another file.'), { status: 400 });
  }
  if (file.size > MAX_PRODUCT_IMAGE_SIZE || file.buffer.length > MAX_PRODUCT_IMAGE_SIZE) {
    throw Object.assign(new Error('Product image must be 2 MB or smaller.'), { status: 400 });
  }

  const bytes = file.buffer;
  const isPng = file.mimetype === 'image/png'
    && bytes.length >= PNG_SIGNATURE.length
    && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  const isJpeg = file.mimetype === 'image/jpeg'
    && bytes.length >= 3
    && bytes[0] === 0xff
    && bytes[1] === 0xd8
    && bytes[2] === 0xff;
  const isWebp = file.mimetype === 'image/webp'
    && bytes.length >= 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!isPng && !isJpeg && !isWebp) {
    throw Object.assign(new Error('Product image must be a real PNG, JPG, or WEBP image.'), { status: 400 });
  }
}

function uploadProductImage(file) {
  validateProductImage(file);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'products', resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ imageUrl: result.secure_url, imagePublicId: result.public_id });
      }
    );
    stream.end(file.buffer);
  });
}

function getProductImagePublicId(imageUrl) {
  if (typeof imageUrl !== 'string') return null;
  const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  return match?.[1] || null;
}

async function removeProductImage(imagePublicId) {
  if (!imagePublicId) return;
  const result = await cloudinary.uploader.destroy(imagePublicId, { resource_type: 'image' });
  if (result?.result && !['ok', 'not found'].includes(result.result)) {
    throw new Error(`Cloudinary returned ${result.result} while deleting product image ${imagePublicId}.`);
  }
}

async function removeProductImageSafely(imagePublicId, context) {
  if (!imagePublicId) return;
  try {
    await removeProductImage(imagePublicId);
  } catch (error) {
    console.error(`[${context}] failed to delete product image from Cloudinary`, error);
  }
}

module.exports = {
  validateProductImage,
  uploadProductImage,
  getProductImagePublicId,
  removeProductImage,
  removeProductImageSafely
};
