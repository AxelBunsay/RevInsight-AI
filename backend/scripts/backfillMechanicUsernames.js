const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
mongoose.set('autoIndex', false);
const Mechanic = require('../models/mechanic');

const applyChanges = process.argv.includes('--apply') && process.argv.includes('--yes');

function normalizeBase(value) {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  const base = cleaned || 'mechanic';
  return base.length < 4 ? `${base}-mech`.slice(0, 20) : base.slice(0, 20);
}

function proposeUsername(mechanic, reserved) {
  const emailLocalPart = typeof mechanic.email === 'string' ? mechanic.email.split('@')[0] : '';
  const name = `${mechanic.firstName || ''}.${mechanic.lastName || ''}`;
  const base = normalizeBase(emailLocalPart || name);
  let candidate = base;
  let suffix = 2;
  while (reserved.has(candidate.toLowerCase())) {
    const tail = `-${suffix}`;
    candidate = `${base.slice(0, 20 - tail.length)}${tail}`;
    suffix += 1;
  }
  reserved.add(candidate.toLowerCase());
  return candidate;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to read mechanic records.');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const allMechanics = await Mechanic.find({})
    .select('username firstName lastName email')
    .collation({ locale: 'en', strength: 2 })
    .lean();
  const reserved = new Set(
    allMechanics
      .map((mechanic) => mechanic.username)
      .filter((username) => typeof username === 'string' && username.trim())
      .map((username) => username.toLowerCase())
  );
  const proposals = allMechanics
    .filter((mechanic) => !mechanic.username)
    .map((mechanic) => ({
      mechanic,
      proposedUsername: proposeUsername(mechanic, reserved)
    }));

  console.table(proposals.map(({ mechanic, proposedUsername }) => ({
    name: `${mechanic.firstName || ''} ${mechanic.lastName || ''}`.trim(),
    email: mechanic.email || '',
    proposedUsername
  })));

  if (!applyChanges) {
    console.log('Dry run only. No mechanic records were changed.');
    if (process.argv.includes('--apply')) {
      console.log('To write changes, pass both --apply and --yes.');
    }
    return;
  }

  let updatedCount = 0;
  for (const { mechanic, proposedUsername } of proposals) {
    const result = await Mechanic.updateOne(
      { _id: mechanic._id, $or: [{ username: null }, { username: { $exists: false } }] },
      { $set: { username: proposedUsername } }
    );
    updatedCount += result.modifiedCount;
  }

  const indexes = await Mechanic.collection.indexes();
  for (const index of indexes) {
    if (index.unique && index.key?.email === 1 && !index.partialFilterExpression && !index.sparse) {
      await Mechanic.collection.dropIndex(index.name);
    }
  }
  await Mechanic.collection.createIndex(
    { email: 1 },
    { name: 'email_partial_unique', unique: true, partialFilterExpression: { email: { $type: 'string' } }, collation: { locale: 'en', strength: 2 } }
  );
  await Mechanic.collection.createIndex(
    { username: 1 },
    { name: 'username_partial_unique', unique: true, partialFilterExpression: { username: { $type: 'string' } }, collation: { locale: 'en', strength: 2 } }
  );
  console.log(`Updated usernames for ${updatedCount} mechanic(s).`);
}

main()
  .catch((error) => {
    console.error(`Mechanic username backfill failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
