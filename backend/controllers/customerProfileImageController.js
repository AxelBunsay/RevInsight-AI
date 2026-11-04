const User = require('../models/user');
const {
  getCustomerProfileImagePublicId,
  removeCustomerProfileImage,
  uploadCustomerProfileImage
} = require('../utils/customerProfileImage');

async function uploadProfileImage(req, res) {
  let uploaded;
  let user;
  let saved = false;
  const userId = req.user.userId;
  try {
    user = await User.findById(userId).select('+profileImagePublicId');
    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, message: 'Customer account not found.' });
    }

    uploaded = await uploadCustomerProfileImage(req.file);
    const previousImage = user.profileImage;
    const previousPublicId = getCustomerProfileImagePublicId(previousImage, user.profileImagePublicId);
    user.profileImage = uploaded.profileImage;
    user.profileImagePublicId = uploaded.publicId;
    await user.save();
    saved = true;

    if (previousPublicId && previousPublicId !== uploaded.publicId) {
      try {
        await removeCustomerProfileImage(previousPublicId);
      } catch (error) {
        user.profileImage = previousImage;
        user.profileImagePublicId = previousPublicId;
        try {
          await user.save();
          await removeCustomerProfileImage(uploaded.publicId);
        } catch (rollbackError) {
          console.error('[uploadProfileImage] failed to roll back profile image update', rollbackError);
        }
        throw error;
      }
    }

    return res.status(200).json({ success: true, profileImage: user.profileImage });
  } catch (error) {
    if (uploaded && !saved) {
      try {
        await removeCustomerProfileImage(uploaded.publicId);
      } catch (cleanupError) {
        console.error('[uploadProfileImage] failed to remove uncommitted profile image', cleanupError);
      }
    }
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('[uploadProfileImage] error', error);
    return res.status(500).json({ success: false, message: 'Profile image could not be uploaded. Please try again.' });
  }
}

async function deleteProfileImage(req, res) {
  try {
    const user = await User.findById(req.user.userId).select('+profileImagePublicId');
    if (!user || user.isDeleted) {
      return res.status(404).json({ success: false, message: 'Customer account not found.' });
    }

    const publicId = getCustomerProfileImagePublicId(user.profileImage, user.profileImagePublicId);
    const previousImage = user.profileImage;
    const previousPublicId = user.profileImagePublicId;
    user.profileImage = null;
    user.profileImagePublicId = null;
    await user.save();
    if (publicId) {
      try {
        await removeCustomerProfileImage(publicId);
      } catch (error) {
        user.profileImage = previousImage;
        user.profileImagePublicId = previousPublicId;
        try {
          await user.save();
        } catch (rollbackError) {
          console.error('[deleteProfileImage] failed to restore profile image after Cloudinary deletion failed', rollbackError);
        }
        throw error;
      }
    }
    return res.status(200).json({ success: true, profileImage: null });
  } catch (error) {
    console.error('[deleteProfileImage] error', error);
    return res.status(500).json({ success: false, message: 'Profile image could not be removed. Please try again.' });
  }
}

module.exports = { deleteProfileImage, uploadProfileImage };
