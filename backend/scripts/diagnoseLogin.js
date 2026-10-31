const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const loginFields = [
  'email',
  'username',
  'normalizedEmail',
  'normalizedUsername',
  'role',
  'isActive',
  'isDeleted',
  'status',
  'isEmailVerified',
  'emailVerified',
  'verified',
  'password'
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function summarizeRecord(collectionName, document) {
  if (!document) return { collection: collectionName, exists: false };

  const fieldsPresent = loginFields.filter((field) => (
    Object.prototype.hasOwnProperty.call(document, field)
  ));
  const values = {};
  for (const field of fieldsPresent) {
    if (field !== 'password') values[field] = document[field];
  }

  return {
    collection: collectionName,
    exists: true,
    fieldsPresent,
    values,
    passwordHashExists: typeof document.password === 'string' && document.password.length > 0
  };
}

async function diagnoseLogin(identifier) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run diagnostics when NODE_ENV is production.');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured.');
  }
  if (typeof identifier !== 'string' || !identifier.trim()) {
    throw new Error('Provide one email address or username.');
  }

  const normalized = identifier.trim();
  const pattern = new RegExp(`^${escapeRegex(normalized)}$`, 'i');
  const isEmail = normalized.includes('@');
  const identityFields = isEmail
    ? ['email', 'normalizedEmail']
    : ['username', 'normalizedUsername'];

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      autoIndex: false,
      autoCreate: false
    });
    const query = {
      $or: identityFields.map((field) => ({ [field]: pattern }))
    };
    const projection = Object.fromEntries(loginFields.map((field) => [field, 1]));
    const [user, mechanic] = await Promise.all([
      mongoose.connection.collection('users').findOne(query, { projection }),
      mongoose.connection.collection('mechanics').findOne(query, { projection })
    ]);

    console.log(JSON.stringify([
      summarizeRecord('users', user),
      summarizeRecord('mechanics', mechanic)
    ], null, 2));
  } finally {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  }
}

if (require.main === module) {
  const identifiers = process.argv.slice(2);
  if (identifiers.length !== 1) {
    console.error('Usage: node scripts/diagnoseLogin.js <email-or-username>');
    process.exitCode = 1;
  } else {
    diagnoseLogin(identifiers[0]).catch(() => {
      console.error('Login diagnostics failed. Check local/dev database configuration and availability.');
      process.exitCode = 1;
    });
  }
}

module.exports = { diagnoseLogin, summarizeRecord };
