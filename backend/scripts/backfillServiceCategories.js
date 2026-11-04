const path = require('path');
const mongoose = require('mongoose');
const Service = require('../models/service');
const { SERVICE_CATEGORIES } = require('../utils/serviceCategories');

function suggestServiceCategory(name) {
  const normalizedName = String(name || '').toLocaleLowerCase('en');
  if (['replace', 'repair', 'troubleshoot', 'diagnose', 'fix'].some((word) => normalizedName.includes(word))) {
    return 'Repair';
  }
  if (['install', 'installation'].some((word) => normalizedName.includes(word))) {
    return 'Installation';
  }
  if (['change oil', 'cleaning', 'tune', 'service', 'maintenance', 'lube'].some((word) => normalizedName.includes(word))) {
    return 'Maintenance';
  }
  if (['customization', 'custom', 'seat'].some((word) => normalizedName.includes(word))) {
    return 'Customization';
  }
  return 'General';
}

async function backfillServiceCategories({ apply = false } = {}) {
  const services = await Service.find({}, { name: 1, category: 1 }).sort({ name: 1 }).lean();
  const rows = services.map((service) => ({
    serviceName: service.name,
    currentCategory: service.category || '(missing)',
    suggestedCategory: suggestServiceCategory(service.name)
  }));
  console.table(rows);

  if (!apply) {
    console.log(`Dry run only. Valid categories: ${SERVICE_CATEGORIES.join(', ')}.`);
    return rows;
  }

  let updated = 0;
  for (const [index, service] of services.entries()) {
    const category = rows[index].suggestedCategory;
    if (service.category === category) continue;
    const result = await Service.updateOne({ _id: service._id }, { $set: { category } });
    updated += result.modifiedCount;
  }
  console.log(`Updated ${updated} service categories.`);
  return rows;
}

async function main(args = process.argv.slice(2)) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const apply = args.includes('--apply');
  const yes = args.includes('--yes');
  const unknownArgs = args.filter((arg) => !['--apply', '--yes'].includes(arg));
  if (unknownArgs.length) throw new Error(`Unknown option: ${unknownArgs[0]}`);
  if (apply && !yes) throw new Error('--apply requires --yes; no changes were made.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await backfillServiceCategories({ apply: apply && yes });
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

module.exports = { suggestServiceCategory, backfillServiceCategories, main };
