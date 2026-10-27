const path = require('path');
const mongoose = require('mongoose');
const Product = require('../models/product');
const { PRODUCT_CATEGORIES, normalizeProductCategory } = require('../utils/productCategories');

const aliases = new Map([
  ['accessories', 'Accessory']
]);

const canonicalMatch = (category) => {
  const canonical = normalizeProductCategory(category);
  if (canonical) return canonical;
  return typeof category === 'string'
    ? aliases.get(category.trim().toLocaleLowerCase('en')) || null
    : null;
};

async function normalizeCategories({ apply = false } = {}) {
  const categories = await Product.aggregate([
    { $group: { _id: '$category', productCount: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  let updatedProducts = 0;

  for (const entry of categories) {
    const category = entry._id;
    const canonical = canonicalMatch(category);
    console.log(
      `${String(category ?? '(missing)')} (${entry.productCount}) -> ${canonical || 'no canonical match'}`
    );
    if (!apply || !canonical || canonical === category) continue;

    const result = await Product.updateMany(
      { category },
      { $set: { category: canonical } }
    );
    updatedProducts += result.modifiedCount;
  }

  if (apply) console.log(`Updated ${updatedProducts} product categories.`);
  else console.log(`Dry run only. Allowed categories: ${PRODUCT_CATEGORIES.join(', ')}.`);
}

async function main(args = process.argv.slice(2)) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const apply = args.includes('--apply');
  const yes = args.includes('--yes');
  const unknownArgs = args.filter((arg) => !['--apply', '--yes'].includes(arg));
  if (unknownArgs.length) throw new Error(`Unknown option: ${unknownArgs[0]}`);
  if (process.env.NODE_ENV === 'production' && !(apply && yes)) {
    throw new Error('Production requires both --apply and --yes.');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured.');
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await normalizeCategories({ apply });
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { canonicalMatch, normalizeCategories, main };
