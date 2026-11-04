const cloudinary = require('../config/cloudinary');

const PROFILE_IMAGE_FOLDER = 'revinsight/profile-images';
const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function validateProfileImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw Object.assign(new Error('Choose a JPG or PNG profile image.'), { status: 400 });
  }
  if (file.size > MAX_PROFILE_IMAGE_SIZE || file.buffer.length > MAX_PROFILE_IMAGE_SIZE) {
    throw Object.assign(new Error('Profile image must be 5 MB or smaller.'), { status: 400 });
  }

  const isPng = file.mimetype === 'image/png'
    && file.buffer.length >= PNG_SIGNATURE.length
    && file.buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
  const isJpeg = file.mimetype === 'image/jpeg'
    && file.buffer.length >= 3
    && file.buffer[0] === 0xff
    && file.buffer[1] === 0xd8
    && file.buffer[2] === 0xff;
  if (!isPng && !isJpeg) {
    throw Object.assign(new Error('Profile image must be a valid JPG or PNG file.'), { status: 400 });
  }
}

function uploadCustomerProfileImage(file) {
  validateProfileImage(file);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: PROFILE_IMAGE_FOLDER,
        resource_type: 'image',
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' }]
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url || !result?.public_id) {
          return reject(new Error('Cloudinary returned an incomplete profile image result.'));
        }
        return resolve({ profileImage: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(file.buffer);
  });
}

function getCustomerProfileImagePublicId(profileImage, storedPublicId) {
  if (typeof storedPublicId === 'string' && storedPublicId.trim()) return storedPublicId.trim();
  if (typeof profileImage !== 'string' || !profileImage) return null;
  try {
    const url = new URL(profileImage);
    if (!/(^|\.)cloudinary\.com$/i.test(url.hostname)) return null;
    const uploadIndex = url.pathname.indexOf('/upload/');
    if (uploadIndex < 0) return null;
    const assetPath = url.pathname.slice(uploadIndex + '/upload/'.length).split('/');
    if (/^v\d+$/.test(assetPath[0] || '')) assetPath.shift();
    const publicId = assetPath.join('/').replace(/\.[a-zA-Z0-9]+$/, '');
    return publicId || null;
  } catch {
    return null;
  }
}

async function removeCustomerProfileImage(publicId) {
  if (!publicId) return;
  const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  if (result?.result && !['ok', 'not found'].includes(result.result)) {
    throw new Error(`Cloudinary returned ${result.result} while deleting the customer profile image.`);
  }
}

module.exports = {
  getCustomerProfileImagePublicId,
  removeCustomerProfileImage,
  uploadCustomerProfileImage,
  validateProfileImage
};
