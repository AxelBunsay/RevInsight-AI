process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'integration-test-secret-at-least-32-characters';
process.env.GEMINI_API_KEY = 'integration-test-no-network';
process.env.GEMINI_MODEL = 'test-model';
process.env.TZ = 'Asia/Manila';
process.env.MONGOMS_VERSION = '7.0.14';
process.env.MONGOMS_DOWNLOAD_DIR = require('path').resolve(__dirname, '../../../.cache/mongodb-binaries');

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const cloudinary = require('../../../config/cloudinary');
const app = require('../../../app');

const Admin = require('../../../models/adminModels/admin');
const BusinessRecord = require('../../../models/businessRecord');
const Mechanic = require('../../../models/mechanic');
const Notification = require('../../../models/notification');
const Order = require('../../../models/orderingModels/order');
const PaymentReference = require('../../../models/paymentReference');
const PendingUser = require('../../../models/pendingUser');
const Product = require('../../../models/product');
const Reservation = require('../../../models/orderingModels/reservation');
const ReservationSettings = require('../../../models/reservationSettings');
const Service = require('../../../models/service');
const ServiceRequest = require('../../../models/serviceRequest');
const ServiceSlotLock = require('../../../models/serviceSlotLock');
const User = require('../../../models/user');

const models = [
  Admin,
  BusinessRecord,
  Mechanic,
  Notification,
  Order,
  PaymentReference,
  PendingUser,
  Product,
  Reservation,
  ReservationSettings,
  Service,
  ServiceRequest,
  ServiceSlotLock,
  User
];

let replicaSet;
let uploadSequence = 0;

async function startReplicaSet() {
  replicaSet = await MongoMemoryReplSet.create({
    binary: {
      version: '7.0.14',
      downloadDir: process.env.MONGOMS_DOWNLOAD_DIR
    },
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 120000 }]
  });
  await mongoose.connect(replicaSet.getUri());
}

async function stopReplicaSet() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (replicaSet) {
    await replicaSet.stop();
    replicaSet = null;
  }
}

async function clearCollections() {
  await Promise.all(models.map((model) => model.deleteMany({})));
  uploadSequence = 0;
}

function mockCloudinary() {
  cloudinary.uploader.upload_stream = (options, callback) => ({
    end() {
      uploadSequence += 1;
      callback(null, {
        public_id: `integration/receipt-${uploadSequence}`,
        format: 'png',
        secure_url: `https://cloudinary.invalid/receipt-${uploadSequence}.png`
      });
    }
  });
  cloudinary.uploader.destroy = async () => ({ result: 'ok' });
  cloudinary.utils.private_download_url = () => 'https://cloudinary.invalid/temporary-receipt';
}

function signCustomer(customer) {
  return jwt.sign({ userId: String(customer._id), role: 'customer' }, process.env.JWT_SECRET);
}

function signMechanic(mechanic) {
  return jwt.sign({ userId: String(mechanic._id), role: 'mechanic' }, process.env.JWT_SECRET);
}

function signAdmin(admin) {
  return jwt.sign({ id: String(admin._id), role: 'admin' }, process.env.JWT_SECRET);
}

async function createFixtures() {
  const admin = await Admin.create({ username: 'integration_admin', password: 'IntegrationPass1' });
  const [customer, secondCustomer] = await User.create([
    {
      email: 'integration.customer@example.com',
      password: 'CustomerPass1',
      firstName: 'Casey',
      lastName: 'Customer',
      phoneNumber: '09171234567',
      isEmailVerified: true
    },
    {
      email: 'integration.second@example.com',
      password: 'SecondPass1',
      firstName: 'Taylor',
      lastName: 'Second',
      phoneNumber: '09181234567',
      isEmailVerified: true
    }
  ]);
  const mechanic = await Mechanic.create({
    email: 'integration.mechanic@example.com',
    password: 'MechanicPass1',
    firstName: 'Morgan',
    lastName: 'Mechanic',
    phoneNumber: '09191234567',
    specialization: 'general',
    yearsOfExperience: 5,
    createdBy: admin._id
  });
  const [product] = await Product.create([{
    name: 'Integration Brake Pad',
    price: 1000,
    quantity: 5,
    reservedQty: 0,
    category: 'Brakes',
    isActive: true
  }]);
  const [service] = await Service.create([{
    name: 'Integration Tune-up',
    description: 'Integration fixture service',
    price: 2500,
    mechanicFee: 900,
    durationMinutes: 60,
    category: 'Maintenance',
    isActive: true
  }]);
  const settings = await ReservationSettings.create({
    key: 'reservation',
    downPaymentPercent: 30,
    pendingPaymentHours: 1,
    holdDays: 3,
    paymentInstructions: {
      methodName: 'GCash',
      accountName: 'Integration Shop',
      accountNumber: '09170000000'
    },
    openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    openTime: '09:00',
    closeTime: '18:00',
    slotCapacity: 1,
    maxDaysAhead: 30
  });
  return { admin, customer, secondCustomer, mechanic, product, service, settings };
}

module.exports = {
  app,
  mongoose,
  models,
  Admin,
  BusinessRecord,
  Mechanic,
  Notification,
  Order,
  PaymentReference,
  Product,
  Reservation,
  ReservationSettings,
  Service,
  ServiceRequest,
  ServiceSlotLock,
  User,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  mockCloudinary,
  createFixtures,
  signCustomer,
  signMechanic,
  signAdmin
};
