const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mongoose = require('../backend/node_modules/mongoose');
const { MongoMemoryReplSet } = require('../backend/node_modules/mongodb-memory-server');
const root = path.resolve(__dirname, '..');
async function main() {
  const repl = await MongoMemoryReplSet.create({ binary: { version: '7.0.14', downloadDir: path.join(root, 'backend/.cache/mongodb-binaries') }, replSet: { count: 1 }, instanceOpts: [{ launchTimeout: 120000 }] });
  const mongoUri = repl.getUri('acceptance_' + Date.now());
  fs.writeFileSync(path.join(__dirname, '.acceptance-state.json'), JSON.stringify({ mongoUri }));
  require('./acceptance-env.cjs');
  await mongoose.connect(mongoUri);
  const Admin = require('../backend/models/adminModels/admin');
  const User = require('../backend/models/user');
  const Mechanic = require('../backend/models/mechanic');
  const Product = require('../backend/models/product');
  const Service = require('../backend/models/service');
  const Settings = require('../backend/models/reservationSettings');
  const admin = await Admin.create({ username: 'qa_admin', password: 'AcceptancePass1' });
  const passwordHash = await require('../backend/node_modules/bcryptjs').hash('AcceptancePass1', 10);
  const customers = await User.create(Array.from({ length: 5 }, (_, i) => ({ username: 'qa_customer' + (i + 1), email: `qa${i+1}@example.com`, password: 'AcceptancePass1', firstName: 'Test' + (i+1), lastName: 'Customer', phoneNumber: '0917000000' + (i+1), isEmailVerified: true })));
  const mechanics = await Mechanic.create(['available', 'busy', 'on-leave'].map((availabilityStatus, i) => ({ username: 'qa_mechanic'+(i+1), password: 'AcceptancePass1', firstName: 'Test', lastName: 'Mechanic'+(i+1), phoneNumber: '0918000000'+(i+1), specialization: 'general', yearsOfExperience: 3, availabilityStatus, createdBy: admin._id })));
  const products = await Product.create([
    { name: 'QA Brake Pad', category: 'Brakes', price: 1000, quantity: 200 },
    { name: 'QA Test Battery', category: 'Electrical', price: 500, quantity: 200 },
    { name: 'QA Test Cable', category: 'Electrical', price: 100, quantity: 200 },
    { name: 'QA Last Unit', category: 'Brakes', price: 100, quantity: 1 },
    { name: 'QA Empty Item', category: 'Brakes', price: 100, quantity: 0 },
    { name: 'QA Variant Part', category: 'Electrical', price: 100, quantity: 0, variants: [{ color: 'Red', price: 150, stock: 20 }, { color: 'Black', price: 200, stock: 0 }] }
  ]);
  const services = await Service.create([
    { name: 'QA Tune Up', description: 'Fake service for acceptance', category: 'Maintenance', price: 1000, mechanicFee: 200, durationMinutes: 60, laborOnlyPrice: 500 },
    { name: 'QA Custom Quote', description: 'Fake quote service', category: 'Customization', price: 1000, mechanicFee: 200, durationMinutes: 60, laborPriceMin: 100, laborPriceMax: 1000 }
  ]);
  await Settings.create({ key: 'reservation', downPaymentPercent: 30, serviceDownPaymentPercent: 30, pendingPaymentHours: 1, holdDays: 3, openDays: ['Mon','Tue','Wed','Thu','Fri','Sat'], openTime: '09:00', closeTime: '18:00', slotCapacity: 5, maxDaysAhead: 30, paymentInstructions: { methodName: 'GCash', accountName: 'QA ONLY - DO NOT PAY', accountNumber: '09170000000' } });
  await Promise.all([Admin, User, Mechanic, Product, Service].map(m => m.init()));
  await User.updateMany({ _id: { $in: customers.map(x=>x._id) } }, { $set: { password: passwordHash } });
  await Mechanic.updateMany({ _id: { $in: mechanics.map(x=>x._id) } }, { $set: { password: passwordHash } });
  const Reservation = require('../backend/models/orderingModels/reservation');
  for (let i=0; i<7; i++) {
    const date=new Date(2025, i*3, 15, 12);
    await Reservation.create({code:'QA-HISTORY-'+i,customerId:customers[4]._id,customerName:'Fake History',items:[{productId:products[0]._id,name:'QA Brake Pad',category:'Brakes',unitPrice:1000+i*100,qty:1,lineTotal:1000+i*100}],total:1000+i*100,downPaymentPercent:30,downPaymentAmount:300+i*30,balanceDue:0,amountPaid:1000+i*100,status:'Completed',completedAt:date,createdAt:date});
  }
  fs.writeFileSync(path.join(__dirname, '.acceptance-state.json'), JSON.stringify({ mongoUri, runId: Date.now().toString(), admin: admin._id, customers: customers.map(x=>x._id), mechanics: mechanics.map(x=>x._id), products: products.map(x=>x._id), services: services.map(x=>x._id) }, null, 2));
  await mongoose.disconnect();
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  // npm run dev remains the documented entry point; nodemon executes the isolation preload.
  const child = spawn(process.execPath, [npmCli, 'run', 'dev', '--', '--exec', `node "${path.join(__dirname, 'acceptance-env-server.cjs')}"`], { cwd: path.join(root, 'backend'), env: process.env, stdio: 'inherit', windowsHide: true });
  async function stop() { child.kill(); await repl.stop(); process.exit(); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  console.log('Isolated QA seeded; real mail captured locally; real configured AI and image service enabled.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
