const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
require('./acceptance-env.cjs');
const mongoose = require('../backend/node_modules/mongoose');
const jwt = require('../backend/node_modules/jsonwebtoken');
const { chromium } = require('playwright');
const state = require('./.acceptance-state.json');
const Product = require('../backend/models/product');
const Service = require('../backend/models/service');
const ServiceRequest = require('../backend/models/serviceRequest');
const BusinessRecord = require('../backend/models/businessRecord');
const Notification = require('../backend/models/notification');
const stage = process.argv[2] || 'baseline';
const dir = path.resolve(__dirname, '../docs/acceptance/evidence', stage);
fs.mkdirSync(dir, { recursive: true });
const tokens = {
  customer: jwt.sign({ userId: state.customers[0], role: 'customer' }, process.env.JWT_SECRET),
  second: jwt.sign({ userId: state.customers[1], role: 'customer' }, process.env.JWT_SECRET),
  admin: jwt.sign({ id: state.admin, role: 'admin' }, process.env.JWT_SECRET),
};
async function request(url, role='admin', body, method=body?'POST':'GET') {
  const start = performance.now();
  const r = await fetch('http://localhost:5100'+url, { method, headers: { Authorization: 'Bearer '+tokens[role], ...(body?{'Content-Type':'application/json'}:{}) }, ...(body?{ body:JSON.stringify(body) }:{}), signal: AbortSignal.timeout(90000) });
  return { status:r.status, ms:performance.now()-start, body:await r.json() };
}
async function main() {
  await mongoose.connect(state.mongoUri);
  const observations = {};
  const p = await Product.create({ name: 'Probe Last Unit '+Date.now(), price:100, quantity:1, category:'Brakes' });
  observations.stockRace = await Promise.all(['customer','second'].map(role=>request('/api/reservations',role,{ items:[{productId:p.id,qty:1}] })));
  observations.stockAfterCheckout = await Product.findById(p.id).lean();
  const job = await ServiceRequest.create({ user:state.customers[0], customerId:state.customers[0], serviceType:'Probe Assignment', description:'Fake booking', paymentStatus:'Confirmed' });
  observations.assignOnLeave = await request('/api/service-requests/assign','admin',{requestId:job.id,mechanicId:state.mechanics[2]},'PUT');
  const goodJob = await ServiceRequest.create({ user:state.customers[0], customerId:state.customers[0], serviceType:'Probe Available', description:'Fake booking', paymentStatus:'Confirmed' });
  observations.assignAvailable = await request('/api/service-requests/assign','admin',{requestId:goodJob.id,mechanicId:state.mechanics[0]},'PUT');
  observations.assignmentNotifications = await Notification.find({recordId:goodJob._id}).lean();
  const s = await Service.create({name:'Probe Delete '+Date.now(),price:100,mechanicFee:10,category:'Repair'});
  const historical = await ServiceRequest.create({user:state.customers[0],serviceId:s.id,serviceType:s.name,description:'Fake historical booking',status:'completed',paymentStatus:'Confirmed'});
  const record = await BusinessRecord.create({recordType:'service',sourceId:historical.id,itemName:s.name,amount:100,category:'Repair',status:'completed',customer:'Fake customer'});
  await request('/api/admin/services/'+s.id,'admin',{name:s.name+' renamed'},'PUT');
  observations.serviceDelete = await request('/api/admin/services/'+s.id,'admin',null,'DELETE');
  observations.serviceHistoryAfterDelete = { serviceExists:!!await Service.findById(s.id), booking:await ServiceRequest.findById(historical.id).lean(), revenue:await BusinessRecord.findById(record.id).lean() };
  fs.writeFileSync(path.join(dir,'probe.json'),JSON.stringify(observations,null,2));
  const Reservation = require('../backend/models/orderingModels/reservation');
  for (let i=0;i<7;i++) {
    const date=new Date(2025,0+i*3,15,12);
    await Reservation.findOneAndUpdate({code:'QA-HISTORY-'+i},{$setOnInsert:{code:'QA-HISTORY-'+i,customerId:state.customers[4],customerName:'Fake History',items:[{productId:state.products[0],name:'QA Brake Pad',category:'Brakes',unitPrice:1000+i*100,qty:1,lineTotal:1000+i*100}],total:1000+i*100,downPaymentPercent:30,downPaymentAmount:300+i*30,balanceDue:0,amountPaid:1000+i*100,status:'Completed',completedAt:date,createdAt:date}},{upsert:true});
  }
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(token => localStorage.setItem('adminToken',token),tokens.admin);
  await context.tracing.start({ screenshots:true, snapshots:true, sources:true });
  const page = await context.newPage();
  const network=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',async r=> { if(r.url().includes('/api/')) network.push({url:new URL(r.url()).pathname,status:r.status(),timing:await r.request().timing()}); });
  const cdp=await context.newCDPSession(page); await cdp.send('Performance.enable');
  const start=performance.now();
  await page.goto('http://localhost:5100/admin/dashboard');
  await page.locator('.admin-stat-strip[aria-label="Business overview"]').waitFor();
  await page.locator('.admin-sales-hero canvas, .admin-sales-hero .admin-empty-state').first().waitFor();
  await page.locator('.admin-dashboard-lower').waitFor();
  observations.dashboardUsableMs=performance.now()-start;
  await page.screenshot({path:path.join(dir,'admin-dashboard.png'),fullPage:true});
  fs.writeFileSync(path.join(dir,'browser-body.txt'),await page.locator('body').innerText());
  fs.writeFileSync(path.join(dir,'browser-network.json'),JSON.stringify({network,errors},null,2));
  await page.locator('.ai-revenue-card').first().waitFor({timeout:30000}).catch(()=>{});
  observations.revenueCardsVisibleMs=performance.now()-start;
  await page.screenshot({path:path.join(dir,'admin-dashboard.png'),fullPage:true});
  observations.browserProfile={metrics:await cdp.send('Performance.getMetrics'),network,errors};
  fs.writeFileSync(path.join(dir,'probe.json'),JSON.stringify(observations,null,2));
  observations.aiCardResponse=await request('/api/admin/ai/card-insights','admin',{});
  observations.aiAsk=await request('/api/admin/revenue/ask-ai','admin',{question:'Describe current summarized revenue, the likely next trend, and one action.'});
  await context.tracing.stop({path:path.join(dir,'probe-trace.zip')});
  await browser.close(); await mongoose.disconnect();
  fs.writeFileSync(path.join(dir,'probe.json'),JSON.stringify(observations,null,2));
  console.log(JSON.stringify({stockRace:observations.stockRace.map(r=>r.status),held:observations.stockAfterCheckout.reservedQty,assignOnLeave:observations.assignOnLeave.status,serviceExists:observations.serviceHistoryAfterDelete.serviceExists,dashboardMs:observations.dashboardUsableMs,cardsMs:observations.revenueCardsVisibleMs,aiCards:observations.aiCardResponse.body.source,aiAsk:observations.aiAsk.status}));
}
main().catch(async e=>{fs.writeFileSync(path.join(dir,'probe-error.txt'),e.stack);console.error(e);await mongoose.disconnect();process.exit(1);});
