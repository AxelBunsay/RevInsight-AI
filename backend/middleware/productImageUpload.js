const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 51 }
});

module.exports = (req, res, next) => {
  upload.any()(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Product image must be 2 MB or smaller.'
        : error.message || 'Product image could not be uploaded.';
      return res.status(400).json({ success: false, message });
    }
    const files = req.files || [];
    const productImages = files.filter((file) => file.fieldname === 'image');
    const variantFiles = files.filter((file) => /^variantImage_\d+$/.test(file.fieldname));
    const uniqueFields = new Set(files.map((file) => file.fieldname));
    if (productImages.length > 1 || uniqueFields.size !== files.length
      || files.length !== productImages.length + variantFiles.length) {
      return res.status(400).json({ success: false, message: 'Unexpected product image upload field.' });
    }
    req.file = productImages[0];
    req.variantFiles = variantFiles;
    return next();
  });
};
