const mongoose = require('mongoose');

const productVariantSchema = new mongoose.Schema({
  brand: { type: String, trim: true, default: '' },
  model: { type: String, trim: true, default: '' },
  size: { type: String, trim: true, default: '' },
  color: { type: String, trim: true, default: '' },
  label: { type: String, trim: true, default: '' },
  price: {
    type: Number,
    required: true,
    min: 0.01,
    validate: {
      validator: Number.isFinite,
      message: 'Variant price must be a finite number'
    }
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Variant stock must be a whole number'
    }
  },
  reservedQty: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'Reserved variant stock must be a whole number'
    }
  },
  imageUrl: { type: String, default: '' },
  imagePublicId: { type: String, default: '' },
  sku: { type: String, trim: true, default: '' }
});

productVariantSchema.pre('validate', function generateVariantLabel() {
  const fitment = [this.brand, this.model].filter(Boolean).join(' ');
  const details = this.color && this.size
    ? `${this.color} / ${this.size}`
    : this.color || this.size;
  this.label = fitment && details ? `${fitment} - ${details}` : fitment || details || '';

  if (!this.brand && !this.model && !this.size && !this.color) {
    this.invalidate('brand', 'At least one variant attribute is required.');
  }
});

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

  variants: {
    type: [productVariantSchema],
    default: undefined,
    validate: {
      validator(variants) {
        if (!variants?.length) return true;
        const combinations = new Set();
        for (const variant of variants) {
          const key = ['brand', 'model', 'size', 'color']
            .map((field) => String(variant[field] || '').trim().toLowerCase())
            .join('\u0000');
          if (combinations.has(key)) return false;
          combinations.add(key);
        }
        return true;
      },
      message: 'Variant attribute combinations must be unique within a product.'
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

productSchema.pre('validate', function synchronizeVariantStock() {
  if (!this.variants?.length) return;
  this.quantity = this.variants.reduce((total, variant) => total + Number(variant.stock || 0), 0);
  this.reservedQty = this.variants.reduce((total, variant) => total + Number(variant.reservedQty || 0), 0);
});

module.exports = mongoose.model('Product', productSchema);