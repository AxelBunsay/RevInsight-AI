import { describe, expect, it } from 'vitest';
import partsController from '../controllers/mechanicControllers/partsController.js';

describe('mechanic job stats', () => {
  it('counts scheduled statuses and sums completed labor fees only', () => {
    expect(partsController.summarizeMechanicJobs([
      { status: 'pending', laborFee: 80 },
      { status: 'assigned', laborFee: 100 },
      { status: 'confirmed', laborFee: 120 },
      { status: 'accepted', laborFee: 140 },
      { status: 'in-progress', laborFee: 160 },
      { status: 'completed', laborFee: 300 },
      { status: 'completed', laborFee: 450 }
    ])).toEqual({
      totalJobs: 7,
      scheduledJobs: 3,
      inProgressJobs: 1,
      completedJobs: 2,
      totalEarnings: 750,
      paidJobs: 2
    });
  });

  it('returns available stock, honors shared threshold, and preserves absolute image URLs', () => {
    const product = {
      _id: { toString: () => 'product-id' },
      name: 'Brake pads',
      quantity: 20,
      reservedQty: 12,
      category: 'Parts',
      price: 450,
      imageUrl: 'https://res.cloudinary.com/shop/image/upload/brake.jpg',
      image: 'uploads/brake.jpg'
    };

    expect(partsController.serializeMechanicPart(product, { host: 'shop.test', protocol: 'https' })).toEqual({
      itemId: 'product-id',
      name: 'Brake pads',
      stock: 8,
      category: 'Parts',
      price: 450,
      isOutOfStock: false,
      stockStatus: 'Low Stock',
      image: 'https://res.cloudinary.com/shop/image/upload/brake.jpg'
    });
  });
});
