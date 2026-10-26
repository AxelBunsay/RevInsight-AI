const express = require('express');
const router = express.Router();

const {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct
} = require('../../controllers/products/productController');

const { adminOnly } = require('../../middleware/auth');
const productImageUpload = require('../../middleware/productImageUpload');

router.post('/', adminOnly, productImageUpload, createProduct);
router.get('/', getProducts);
router.get('/:id', getProduct);
router.put('/:id', adminOnly, productImageUpload, updateProduct);
router.delete('/:id', adminOnly, deleteProduct);

module.exports = router;