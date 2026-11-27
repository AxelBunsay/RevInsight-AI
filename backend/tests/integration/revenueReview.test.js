import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';
const require=createRequire(import.meta.url);
const { app, Order, Reservation, ServiceRequest, startReplicaSet, stopReplicaSet, clearCollections, createFixtures, signAdmin, signCustomer, signMechanic }=require('./helpers');
const Review=require('../../models/revenueMonthReview');
const Audit=require('../../models/adminAudit');
const api=supertest(app);
let fixtures,token;
const quarterPath='/api/dashboard/analytics/quarter-review';
const reviewPath='/api/dashboard/analytics/month-review';
const now=new Date('2026-11-16T12:00:00+08:00');
const get=async(quarter='2026-Q3')=>{
 const response=await api.get(quarterPath).query({selectedQuarter:quarter}).set('Authorization','Bearer '+token);
 expect(response.status).toBe(200);return response.body.data;
};
async function sale(month,overrides={}){
 return Order.create({customerName:'Synthetic review fixture',customerPhone:'09000000000',totalPrice:100,status:'completed',
  items:[{productName:'QA part',category:'Parts',price:100,quantity:1}],
  createdAt:new Date('2026-'+month+'-15T12:00:00+08:00'),...overrides});
}
async function submit(monthKey,confirmZeroSales=false,selectedQuarter='2026-Q3',fingerprint){
 const month=(await get(selectedQuarter)).months.find(row=>row.monthKey===monthKey);
 return api.post(reviewPath).set('Authorization','Bearer '+token).send({selectedQuarter,monthKey,confirmZeroSales,fingerprint:fingerprint || month.fingerprint});
}
async function seedQuarter(){return Promise.all(['07','08','09'].map(month=>sale(month)));}
async function reviewQuarter(){for(const month of ['07','08','09'])expect((await submit('2026-'+month)).status).toBe(200);}

describe('quarter completeness review (isolated database)',()=>{
 beforeAll(async()=>{await startReplicaSet();await Promise.all([Review.init(),Audit.init()]);},180000);
 afterAll(async()=>{vi.useRealTimers();await stopReplicaSet();},180000);
 beforeEach(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);
  await clearCollections();fixtures=await createFixtures();token=signAdmin(fixtures.admin);
 });
 afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});

 it('scenario 1: marks a closed quarter reviewed only after three current month reviews',async()=>{
  await seedQuarter();
  const before=await get();expect(before.reviewed).toBe(false);expect(before.months.map(row=>row.reviewStatus)).toEqual(['awaiting_review','awaiting_review','awaiting_review']);
  await reviewQuarter();
  const result=await get();
  expect(result).toMatchObject({reviewed:true,status:'reviewed',closed:true,timezone:'Asia/Manila'});
  expect(result.months.map(row=>row.eligibleTransactionCount)).toEqual([1,1,1]);
  for(const month of result.months){
   expect(month).toMatchObject({reviewStatus:'reviewed',confirmedZeroSales:false,reviewerId:String(fixtures.admin._id)});
   expect(month.reviewedAt).toBe(now.toISOString());expect(month.dataQualityFlags).toEqual([]);
   expect(month).not.toHaveProperty('sourceRecords');
  }
  const scoped=await api.get('/api/dashboard/analytics/scoped-revenue?scope=selectedQuarter&selectedQuarter=2026-Q3').set('Authorization','Bearer '+token);
  expect(scoped.body.data.coverage).toMatchObject({completeness:'reviewed',reviewStatus:'reviewed',confirmedZeroSales:false});
  expect(scoped.body.data.concentration.coverage).toEqual(scoped.body.data.coverage);
  const history=await api.get('/api/dashboard/audit/revenue_month/'+result.months[0].reviewId).set('Authorization','Bearer '+token);
  expect(history.status).toBe(200);
  expect(history.body.data[0]).toMatchObject({action:'revenue_month_reviewed',actorRole:'admin',actorId:String(fixtures.admin._id),changes:{reviewVersion:{from:null,to:1}}});
  expect(JSON.stringify(history.body)).not.toContain('customerPhone');
 });

 it('scenario 2: distinguishes explicitly confirmed zero sales from an empty unreviewed month',async()=>{
  await sale('07');await sale('09');
  let result=await get();
  expect(result.months[1]).toMatchObject({eligibleTransactionCount:0,observedDates:[],reviewStatus:'awaiting_review',confirmedZeroSales:false});
  expect((await submit('2026-08',false)).status).toBe(400);
  expect(await Review.countDocuments()).toBe(0);expect(await Audit.countDocuments()).toBe(0);
  expect((await submit('2026-07',true)).status).toBe(400);
  expect((await submit('2026-07')).status).toBe(200);
  expect((await submit('2026-08',true)).status).toBe(200);
  expect((await submit('2026-09')).status).toBe(200);
  result=await get();
  expect(result.reviewed).toBe(true);
  expect(result.months[1]).toMatchObject({reviewStatus:'confirmed_zero_sales',confirmedZeroSales:true,firstRecordedDate:null,lastRecordedDate:null});
  const entry=await Audit.findOne({action:'zero_sales_month_confirmed'}).lean();
  expect(entry).toMatchObject({recordType:'revenue_month',actorRole:'admin',changes:{confirmedZeroSales:{from:null,to:true}}});
 });

 it('scenario 3: leaves a closed quarter awaiting review when a month has not been reviewed',async()=>{
  await seedQuarter();expect((await submit('2026-07')).status).toBe(200);expect((await submit('2026-09')).status).toBe(200);
  const result=await get();expect(result).toMatchObject({reviewed:false,status:'awaiting_review'});
  expect(result.months[1].reviewStatus).toBe('awaiting_review');
  const response=await api.get('/api/dashboard/analytics/scoped-revenue?scope=selectedQuarter&selectedQuarter=2026-Q3').set('Authorization','Bearer '+token);
  expect(response.body.data.coverage.completeness).toBe('unknown');
 });

 it('a late eligible transaction reopens only the affected month and rejects stale approval',async()=>{
  await seedQuarter();await reviewQuarter();const reviewed=await get();const fingerprint=reviewed.months[1].fingerprint;
  await sale('08',{totalPrice:50,items:[{productName:'QA second part',category:'Parts',price:50,quantity:1}]});
  const result=await get();expect(result).toMatchObject({reviewed:false,status:'needs_review'});
  expect(result.months.map(row=>row.reviewStatus)).toEqual(['reviewed','needs_review','reviewed']);
  expect(result.months[1].eligibleTransactionCount).toBe(2);
  expect((await submit('2026-08',false,'2026-Q3',fingerprint)).status).toBe(409);
  expect(await Audit.countDocuments()).toBe(3);
  vi.setSystemTime(new Date(now.getTime()+1000));
  expect((await submit('2026-08')).status).toBe(200);
  expect((await get()).reviewed).toBe(true);
  expect((await Review.findOne({monthKey:'2026-08'})).reviewVersion).toBe(2);
  expect(await Audit.countDocuments()).toBe(4);
  expect((await submit('2026-08')).status).toBe(200);
  expect(await Audit.countDocuments()).toBe(4);
 });

 it('a late sale invalidates a confirmed zero-sales month',async()=>{
  await sale('07');await sale('09');expect((await submit('2026-07')).status).toBe(200);expect((await submit('2026-08',true)).status).toBe(200);expect((await submit('2026-09')).status).toBe(200);
  await sale('08');
  const result=await get();
  expect(result.months[1]).toMatchObject({reviewStatus:'needs_review',confirmedZeroSales:false,eligibleTransactionCount:1});
  expect(result.reviewed).toBe(false);
 });

 it('revenue corrections, date moves and deletions invalidate the affected reviews',async()=>{
  const records=await seedQuarter();await reviewQuarter();
  await Order.updateOne({_id:records[1]._id},{$set:{totalPrice:101}});
  expect((await get()).months[1].reviewStatus).toBe('needs_review');
  await submit('2026-08');
  await Order.updateOne({_id:records[1]._id},{$set:{createdAt:new Date('2026-09-20T12:00:00+08:00')}});
  let result=await get();expect(result.months.map(row=>row.reviewStatus)).toEqual(['reviewed','needs_review','needs_review']);
  expect(result.months[1].canConfirmZeroSales).toBe(true);
  await submit('2026-08',true);await submit('2026-09');
  await Order.deleteOne({_id:records[2]._id});
  result=await get();expect(result.months[2].reviewStatus).toBe('needs_review');
 });

 it('uses existing statuses, revenue dates, Manila boundaries and unique transaction counts',async()=>{
  await sale('06',{createdAt:new Date('2026-06-30T23:59:59+08:00')});
  await sale('07',{createdAt:new Date('2026-06-30T16:00:00Z'),items:[{productName:'QA first',category:'Parts',price:50,quantity:1},{productName:'QA second',category:'Parts',price:50,quantity:1}]});
  await sale('10',{createdAt:new Date('2026-09-30T16:00:00Z')});
  await Order.collection.insertOne({status:'pending',createdAt:new Date('2026-08-15T00:00:00+08:00')});
  await ServiceRequest.create({user:fixtures.customer._id,serviceType:'QA labor',description:'Synthetic fixture',estimatedPrice:200,status:'completed',createdAt:new Date('2026-01-01'),completedAt:new Date('2026-08-20T12:00:00+08:00')});
  await Reservation.create({code:'QA-REVIEW-BOUNDARY',customerId:fixtures.customer._id,customerName:'Synthetic',items:[{productId:fixtures.product._id,name:'QA part',category:'Parts',unitPrice:300,qty:1,lineTotal:300}],total:300,downPaymentPercent:30,downPaymentAmount:90,balanceDue:0,status:'Completed',createdAt:new Date('2026-01-01'),completedAt:new Date('2026-09-30T15:59:59Z')});
  const result=await get();
  expect(result.months.map(row=>row.eligibleTransactionCount)).toEqual([1,1,1]);
  expect(result.months.map(row=>row.recordedRevenue)).toEqual([100,200,300]);
  expect(result.months.map(row=>row.observedDates)).toEqual([['2026-07-01'],['2026-08-20'],['2026-09-30']]);
  expect(result.months.every(row=>row.dataQualityFlags.length===0)).toBe(true);
 });

 it('blocks required revenue-field issues, and undated completed records cannot certify any month',async()=>{
  await seedQuarter();await reviewQuarter();
  await Order.collection.updateOne({status:'completed',createdAt:new Date('2026-08-15T12:00:00+08:00')},{$unset:{totalPrice:''}});
  let result=await get();
  expect(result.months[1].reviewStatus).toBe('needs_review');
  expect(result.months[1].dataQualityFlags).toContainEqual(expect.objectContaining({code:'invalid_revenue_amount',severity:'blocking'}));
  expect((await submit('2026-08')).status).toBe(409);
  await ServiceRequest.collection.insertOne({status:'completed',estimatedPrice:100,completedAt:'not-a-date',serviceType:'QA undated'});
  result=await get();
  expect(result.unassignedRecordCount).toBe(1);expect(result.status).toBe('blocked');
  expect(result.months.every(row=>!row.canReview)).toBe(true);
  expect((await api.get('/api/dashboard/analytics/scoped-revenue?scope=selectedQuarter&selectedQuarter=2026-Q3').set('Authorization','Bearer '+token)).status).toBe(200);
 });

 it('separates closed, in-progress and future months at the Manila boundary',async()=>{
  const result=await get('2026-Q4');
  expect(result.months.map(row=>row.periodStatus)).toEqual(['closed','in_progress','future']);
  expect(result.months.map(row=>row.reviewStatus)).toEqual(['awaiting_review','in_progress','future']);
  expect((await submit('2026-11',true,'2026-Q4')).status).toBe(409);
  expect((await submit('2026-12',true,'2026-Q4')).status).toBe(409);
  vi.setSystemTime(new Date('2026-10-31T15:59:59Z'));
  expect((await get('2026-Q4')).months[0].periodStatus).toBe('in_progress');
  vi.setSystemTime(new Date('2026-10-31T16:00:00Z'));
  expect((await get('2026-Q4')).months[0].periodStatus).toBe('closed');
 });

 it('rejects non-admin reads and submissions without persisting reviews',async()=>{
  await seedQuarter();const month=(await get()).months[0];
  const body={selectedQuarter:'2026-Q3',monthKey:month.monthKey,fingerprint:month.fingerprint,confirmZeroSales:false};
  expect((await api.post(reviewPath).send(body)).status).toBe(401);
  for(const other of [signCustomer(fixtures.customer),signMechanic(fixtures.mechanic)]){
   expect((await api.post(reviewPath).set('Authorization','Bearer '+other).send(body)).status).toBe(403);
   expect((await api.get(quarterPath+'?selectedQuarter=2026-Q3').set('Authorization','Bearer '+other)).status).toBe(403);
  }
  expect(await Review.countDocuments()).toBe(0);expect(await Audit.countDocuments()).toBe(0);
 });

 it('rolls back the review when its shared audit write fails',async()=>{
  await sale('07');const audit=vi.spyOn(Audit,'create').mockRejectedValueOnce(new Error('Synthetic audit failure'));
  expect((await submit('2026-07')).status).toBe(500);expect(audit).toHaveBeenCalledOnce();
  expect(await Review.countDocuments()).toBe(0);expect(await Audit.countDocuments()).toBe(0);
 });

 it('requires a valid quarter and a month belonging to that quarter',async()=>{
  expect((await api.get(quarterPath+'?selectedQuarter=2026-Q5').set('Authorization','Bearer '+token)).status).toBe(400);
  const month=(await get()).months[0];
  expect((await api.post(reviewPath).set('Authorization','Bearer '+token).send({selectedQuarter:'2026-Q3',monthKey:'2026-10',fingerprint:month.fingerprint,confirmZeroSales:true})).status).toBe(400);
 });
 it('keeps a zero-sales review stale even when a late sale is deleted before the next read',async()=>{
  for(const month of ['07','08','09'])expect((await submit('2026-'+month,true)).status).toBe(200);
  const record=await sale('08');
  expect((await api.delete('/api/dashboard/transactions/'+record.id).set('Authorization','Bearer '+token)).status).toBe(200);
  const result=await get();
  expect(result.months[1]).toMatchObject({eligibleTransactionCount:0,reviewStatus:'needs_review',confirmedZeroSales:false});
  expect((await submit('2026-08',true)).status).toBe(200);
  expect((await get()).reviewed).toBe(true);
 });

 it('a status correction and restoration requires review even if the revenue figures are unchanged',async()=>{
  const records=await seedQuarter();await reviewQuarter();
  const path='/api/dashboard/transactions/'+records[1].id;
  for(const status of ['pending','completed']){
   expect((await api.put(path).set('Authorization','Bearer '+token).send({status})).status).toBe(200);
  }
  const result=await get();
  expect(result.months[1]).toMatchObject({eligibleTransactionCount:1,recordedRevenue:100,reviewStatus:'needs_review'});
  expect(result.months[0].reviewStatus).toBe('reviewed');
 });

 it('flags malformed completed reservations without counting excluded records as eligible sales',async()=>{
  await Reservation.collection.insertOne({status:'Completed',completedAt:new Date('2026-09-15T12:00:00+08:00'),total:100,
   items:[{name:'QA malformed record',unitPrice:100,qty:1,lineTotal:100}]});
  const result=await get();const month=result.months[2];
  expect(month).toMatchObject({eligibleTransactionCount:0,recordedRevenue:0,reviewStatus:'blocked',canConfirmZeroSales:false});
  expect(month.dataQualityFlags.map(row=>row.code)).toEqual(expect.arrayContaining(['missing_reservation_code','missing_product_id']));
  expect((await submit('2026-09',true)).status).toBe(409);
 });

 it('flags a missing legacy item instead of crashing the dashboard',async()=>{
  await Order.collection.insertOne({status:'completed',createdAt:new Date('2026-08-15T12:00:00+08:00'),totalPrice:100,items:[null]});
  const month=(await get()).months[1];
  expect(month).toMatchObject({eligibleTransactionCount:1,reviewStatus:'blocked',canReview:false});
  expect(month.dataQualityFlags.map(row=>row.code)).toContain('invalid_revenue_item');
  expect((await api.get('/api/dashboard/analytics/scoped-revenue?scope=selectedQuarter&selectedQuarter=2026-Q3').set('Authorization','Bearer '+token)).status).toBe(200);
 });

});
