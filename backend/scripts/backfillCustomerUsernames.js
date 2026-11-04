const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
mongoose.set('autoIndex', false);
const User = require('../models/user');

const applyChanges = process.argv.includes('--apply') && process.argv.includes('--yes');

function usernameBaseFromEmail(email) {
  const localPart = String(email || '').split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20);
  return (localPart || 'user').padEnd(4, '0').slice(0, 20);
}

function proposeUsername(user, reserved, validateCustomerUsername) {
  const base = usernameBaseFromEmail(user.email);
  let candidate = base;
  let suffix = 2;
  while (reserved.has(candidate.toLowerCase()) || !validateCustomerUsername(candidate).isValid) {
    const tail = String(suffix);
    candidate = `${base.slice(0, 20 - tail.length)}${tail}`;
    suffix += 1;
  }
  reserved.add(candidate.toLowerCase());
  return candidate;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to read customer records.');
  }

  const { validateCustomerUsername } = await import('../../shared/customerUsername.mjs');
  await mongoose.connect(process.env.MONGODB_URI);
  const customers = await User.find({}).select('username usernameLower firstName lastName email').lean();
  const reserved = new Set(
    customers
      .flatMap((customer) => [customer.usernameLower, customer.username?.toLowerCase()])
      .filter(Boolean)
  );
  const proposals = customers
    .filter((customer) => !customer.username)
    .map((customer) => ({
      customer,
      proposedUsername: proposeUsername(customer, reserved, validateCustomerUsername)
    }));

  console.table(proposals.map(({ customer, proposedUsername }) => ({
    name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
    email: customer.email || '',
    proposedUsername
  })));

  if (!applyChanges) {
    console.log('Dry run only. No customer records were changed.');
    if (process.argv.includes('--apply')) {
      console.log('To write changes, pass both --apply and --yes.');
    }
    return;
  }

  let updatedCount = 0;
  for (const { customer, proposedUsername } of proposals) {
    const result = await User.updateOne(
      { _id: customer._id, $or: [{ username: null }, { username: { $exists: false } }] },
      { $set: { username: proposedUsername, usernameLower: proposedUsername.toLowerCase() } }
    );
    updatedCount += result.modifiedCount;
  }

  const namedCustomers = customers.filter((customer) => customer.username);
  for (const customer of namedCustomers) {
    const usernameLower = customer.username.trim().toLowerCase();
    if (customer.usernameLower !== usernameLower) {
      await User.updateOne({ _id: customer._id }, { $set: { usernameLower } });
    }
  }

  await User.collection.createIndex(
    { usernameLower: 1 },
    { name: 'username_lower_partial_unique', unique: true, partialFilterExpression: { usernameLower: { $type: 'string' } } }
  );
  console.log(`Updated usernames for ${updatedCount} customer(s).`);
}

main()
  .catch((error) => {
    console.error(`Customer username backfill failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });