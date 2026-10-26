const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 }
});

module.exports = (req, res, next) => {
  upload.single('image')(req, res, (error) => {
    if (error) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Product image must be 2 MB or smaller.'
        : error.message || 'Product image could not be uploaded.';
      return res.status(400).json({ success: false, message });
    }
    return next();
  });
};
