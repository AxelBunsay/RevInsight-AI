const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('../models/product');
const { validateProductInput } = require('../utils/inventoryValidation');
const { PRODUCT_CATEGORIES, normalizeProductCategory } = require('../utils/productCategories');
const { prepareProductMutation } = require('../utils/productVariants');
const { evaluateLowStockAlert } = require('../utils/lowStockAlerts');
const {
  PRODUCT_CATEGORIES: SHARED_PRODUCT_CATEGORIES,
  VARIANT_CATEGORY_FIELDS
} = require('../../shared/inventory.json');

const DATA_FILE = path.join(__dirname, 'data', 'inventoryItems.json');

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getVisibleVariantFields(category) {
  return VARIANT_CATEGORY_FIELDS[category] === 'accessory'
    ? ['size', 'color']
    : ['brand', 'model', 'size', 'color'];
}

async function validateInventoryItem(item, index) {
  const errors = [];
  if (!isRecord(item)) {
    return {
      name: `Item ${index + 1}`,
      item: null,
      prepared: null,
      errors: ['Item must be a JSON object.']
    };
  }

  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const category = typeof item.category === 'string' ? item.category.trim() : '';
  const variants = item.variants === undefined ? [] : item.variants;
  const displayName = name || `Item ${index + 1}`;

  if (!SHARED_PRODUCT_CATEGORIES.includes(category) || !PRODUCT_CATEGORIES.includes(category)) {
    errors.push(`Category must be one of: ${SHARED_PRODUCT_CATEGORIES.join(', ')}.`);
  }
  if (!Array.isArray(variants)) {
    errors.push('Variants must be an array when provided.');
  }

  const inputErrors = validateProductInput({
    name,
    category,
    price: item.price,
    quantity: item.stock
  });
  errors.push(...Object.values(inputErrors));

  if (Array.isArray(variants)) {
    const visibleFields = getVisibleVariantFields(category);
    variants.forEach((variant, variantIndex) => {
      if (!isRecord(variant)) {
        errors.push(`Variant ${variantIndex + 1} must be an object.`);
        return;
      }

      const brand = variant.brand ?? '';
      const model = variant.model ?? '';
      const size = variant.size ?? '';
      const color = variant.color ?? '';
      if ([brand, model, size, color].some((value) => typeof value !== 'string')) {
        errors.push(`Variant ${variantIndex + 1} attributes must be text.`);
        return;
      }
      if (VARIANT_CATEGORY_FIELDS[category] === 'accessory'
        && (String(brand).trim() || String(model).trim())) {
        errors.push(`Variant ${variantIndex + 1} in ${category} may use size and color only.`);
      }
      if (!visibleFields.some((field) => String(variant[field] ?? '').trim())) {
        errors.push(`Variant ${variantIndex + 1} needs at least one visible attribute (${visibleFields.join(', ')}).`);
      }
    });
  }

  if (errors.length) {
    return { name: displayName, item, prepared: null, errors };
  }

  try {
    const normalizedCategory = normalizeProductCategory(category);
    const prepared = await prepareProductMutation({
      input: {
        name,
        category: normalizedCategory,
        price: String(item.price),
        quantity: String(item.stock),
        ...(variants.length ? { variants: JSON.stringify(variants) } : {})
      }
    });
    prepared.data.image = '';
    prepared.data.imageUrl = '';
    prepared.data.imagePublicId = '';
    return {
      name: displayName,
      item: { ...item, name, category: normalizedCategory },
      prepared,
      errors: []
    };
  } catch (error) {
    return {
      name: displayName,
      item,
      prepared: null,
      errors: [error.message || 'Item failed inventory validation.']
    };
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findExistingProduct(name) {
  return Product.findOne({
    name: new RegExp(`^${escapeRegExp(name)}$`, 'i')
  }).select('_id').lean();
}

function formatVariantPreview(variants = []) {
  if (!variants.length) return 'None';
  return variants.map((variant) => {
    const attributes = [variant.brand, variant.model, variant.size, variant.color]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' · ') || 'No attributes';
    return `${attributes} (price ${variant.price}, stock ${variant.stock})`;
  }).join('; ');
}

function printDryRun(rows, summary) {
  console.table(rows.map((row) => ({
    Name: row.name,
    Category: row.item?.category || '',
    Price: row.item?.price ?? '',
    Stock: row.item?.stock ?? '',
    Variants: Array.isArray(row.item?.variants) ? formatVariantPreview(row.item.variants) : '',
    Result: row.status,
    Problems: row.errors.join(' ')
  })));
  console.log(`Dry run: ${summary.wouldCreate} would create, ${summary.skipped} skipped, ${summary.invalid} invalid.`);
}

async function importInventoryItems({ items, apply = false } = {}) {
  if (!Array.isArray(items)) throw new Error('Inventory data must be a JSON array.');
  const rows = await Promise.all(items.map((item, index) => validateInventoryItem(item, index)));
  const plannedNames = new Set();
  for (const row of rows) {
    if (row.errors.length) {
      row.status = 'Invalid';
      continue;
    }

    const normalizedName = row.name.toLocaleLowerCase('en');
    if (plannedNames.has(normalizedName)) {
      row.status = 'Skipped: duplicate in file';
      row.errors.push('Another entry in this file has the same name.');
      continue;
    }
    plannedNames.add(normalizedName);

    const existing = await findExistingProduct(row.name);
    if (existing) {
      row.status = 'Skipped: already exists';
      row.errors.push('A product with this name already exists.');
    } else {
      row.status = apply ? 'Ready to create' : 'Would create';
    }
  }

  const summary = {
    wouldCreate: rows.filter((row) => row.status === 'Would create' || row.status === 'Ready to create').length,
    skipped: rows.filter((row) => row.status?.startsWith('Skipped')).length,
    invalid: rows.filter((row) => row.status === 'Invalid').length,
    created: 0
  };

  if (!apply) {
    printDryRun(rows, summary);
    return { rows, summary };
  }

  for (const row of rows) {
    if (row.status !== 'Ready to create') continue;
    const product = await Product.create(row.prepared.data);
    await evaluateLowStockAlert(product._id);
    row.status = 'Created';
    summary.created += 1;
  }

  const createdNames = rows.filter((row) => row.status === 'Created').map((row) => row.name);
  console.log(`Import complete: ${summary.created} created, ${summary.skipped} skipped, ${summary.invalid} invalid.`);
  if (createdNames.length) console.log(`Created items: ${createdNames.join(', ')}`);
  return { rows, summary };
}

function readInventoryItems() {
  try {
    const items = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!Array.isArray(items)) throw new Error();
    return items;
  } catch {
    throw new Error('Could not read valid inventory item data from scripts/data/inventoryItems.json.');
  }
}

async function main(args = process.argv.slice(2)) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  const apply = args.includes('--apply');
  const yes = args.includes('--yes');
  const unknownArgs = args.filter((arg) => !['--apply', '--yes'].includes(arg));
  if (unknownArgs.length) throw new Error(`Unknown option: ${unknownArgs[0]}`);
  if (apply && !yes) throw new Error('--apply requires --yes; no changes were made.');

  const items = readInventoryItems();
  if (!items.length) {
    console.log('Inventory import: 0 items, 0 created, 0 skipped.');
    return { rows: [], summary: { wouldCreate: 0, skipped: 0, invalid: 0, created: 0 } };
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');

  try {
    await mongoose.connect(process.env.MONGODB_URI);
  } catch {
    throw new Error('Database connection failed. Check MONGODB_URI and network connectivity.');
  }

  try {
    const result = await importInventoryItems({ items, apply: apply && yes });
    return result;
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || 'Inventory import failed.');
    process.exitCode = 1;
  });
}

module.exports = {
  formatVariantPreview,
  importInventoryItems,
  main,
  readInventoryItems,
  validateInventoryItem
};
