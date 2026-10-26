const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    minlength: 2,
    maxlength: 80,
    trim: true
  },
  
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: 0.01,
    max: 999999.99
  },
  
  quantity: {
    type: Number,
    required: [true, 'Product quantity is required'],
    min: 0,
    max: 99999,
    validate: {
      validator: Number.isInteger,
      message: 'Stock must be a whole number'
    }
  },

  reservedQty: {
    type: Number,
    default: 0,
    min: 0,
    max: 99999,
    validate: {
      validator: Number.isInteger,
      message: 'Reserved stock must be a whole number'
    }
  },
  
  category: {
    type: String,
    required: [true, 'Product category is required']
  },
  
  image: {
    type: String,
    required: false
  },
  imageUrl: {
    type: String,
    required: false
  },
  imagePublicId: {
    type: String,
    required: false
  },

  isActive: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model('Product', productSchema);