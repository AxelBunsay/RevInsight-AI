const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  walkInId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalkIn' },
  customerName: {
    type: String,
    required: true
  },
  
  customerPhone: {
    type: String,
    required() { return !this.walkInId; }
  },
  
  items: [
    {
      productId: mongoose.Schema.Types.ObjectId,
      productName: String,
      category: String,
      price: Number,
      quantity: Number
    }
  ],
  
  totalPrice: {
    type: Number,
    required: true
  },
  
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'Paid'],
    default: 'pending'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Order', orderSchema);