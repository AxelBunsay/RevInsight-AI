import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';
const require=createRequire(import.meta.url);
const {app,Reservation,ServiceRequest,Order,Mechanic,Notification,startReplicaSet,stopReplicaSet,clearCollections,createFixtures,signAdmin,signCustomer,signMechanic}=require('./helpers');
const Audit=require('../../models/adminAudit');
const api=supertest(app);
let fixtures,token;
const post=path=>api.post(path).set('Authorization','Bearer '+token);
const put=path=>api.put(path).set('Authorization','Bearer '+token);
const history=(type,id)=>api.get('/api/dashboard/audit/'+type+'/'+id).set('Authorization','Bearer '+token);
async function reservation(status='Payment Submitted'){
 return Reservation.create({code:'AUDIT-'+Date.now(),customerId:fixtures.customer._id,customerName:'Synthetic audit customer',
  items:[{productId:fixtures.product._id,name:fixtures.product.name,unitPrice:1000,qty:1,lineTotal:1000}],
  total:1000,downPaymentPercent:30,downPaymentAmount:300,balanceDue:1000,amountPaid:0,status,
  paymentDueAt:new Date(Date.now()+86400000),submittedAt:new Date(),paymentMethod:'GCash'});
}
async function service(overrides={}){
 return ServiceRequest.create({user:fixtures.customer._id,customerId:fixtures.customer._id,serviceType:'Synthetic tune up',description:'Synthetic audit fixture',
  estimatedPrice:1000,status:'pending',paymentStatus:'Payment Submitted',mechanic:fixtures.mechanic._id,mechanicId:fixtures.mechanic._id,...overrides});
}
describe('atomic Admin audit history',()=>{
 beforeAll(async()=>{await startReplicaSet();await Audit.init();},180000);
 afterAll(async()=>{await stopReplicaSet();},180000);
 beforeEach(async()=>{await clearCollections();fixtures=await createFixtures();token=signAdmin(fixtures.admin);});
 afterEach(()=>vi.restoreAllMocks());
 it('records item approval and cancellation once; failed and repeated requests add nothing',async()=>{
  const record=await reservation();
  expect((await post('/api/admin/reservations/'+record.id+'/confirm')).status).toBe(200);
  expect((await post('/api/admin/reservations/'+record.id+'/confirm')).status).toBe(409);
  expect((await post('/api/admin/reservations/'+record.id+'/cancel').send({reason:'Refund requested'})).status).toBe(400);
  expect(await Audit.countDocuments({recordId:record._id})).toBe(1);
  expect((await post('/api/admin/reservations/'+record.id+'/cancel').send({reason:'Booking no longer needed',refundDecision:'refunded'})).status).toBe(200);
  expect((await post('/api/admin/reservations/'+record.id+'/cancel').send({reason:'Booking no longer needed',refundDecision:'refunded'})).status).toBe(409);
  const response=await history('reservation',record.id);
  expect(response.status).toBe(200);expect(response.body.data).toHaveLength(2);
  expect(response.body.data[0]).toMatchObject({action:'reservation_cancelled',actorId:String(fixtures.admin._id),actorRole:'admin',recordId:record.id,
    reason:'Booking no longer needed',changes:{status:{from:'Reserved',to:'Cancelled'},refundDecision:{from:null,to:'refunded'}}});
  expect(response.body.data[1]).toMatchObject({action:'payment_approved',changes:{status:{from:'Payment Submitted',to:'Reserved'}}});
  expect(Number.isNaN(Date.parse(response.body.data[0].timestamp))).toBe(false);
 });
 it('records rejection reasons without receipt, credential or contact data',async()=>{
  const record=await reservation();
  const reason='Unclear proof; contact qa@example.invalid at 09170000000; otp=123456';
  expect((await post('/api/admin/reservations/'+record.id+'/reject').send({reason})).status).toBe(200);
  expect((await post('/api/admin/reservations/'+record.id+'/reject').send({reason})).status).toBe(409);
  const response=await history('reservation',record.id);
  const entry=response.body.data[0],serialized=JSON.stringify(entry);
  expect(entry.action).toBe('payment_rejected');
  expect(entry.reason).toContain('Unclear proof');
  for(const value of ['qa@example.invalid','09170000000','123456','customerName','customerPhone','paymentProofUrl','paymentReference','password'])expect(serialized).not.toContain(value);
  expect(response.body.data).toHaveLength(1);
 });
 it('audits service payment approvals, rejections and cancellation',async()=>{
  const first=await service();
  expect((await post('/api/admin/service-requests/'+first.id+'/confirm-payment')).status).toBe(200);
  expect((await post('/api/admin/service-requests/'+first.id+'/confirm-payment')).status).toBe(409);
  expect((await put('/api/service-requests/status/admin').send({requestId:first.id,status:'cancelled',reason:'Customer requested cancellation',refundDecision:'refunded'})).status).toBe(200);
  expect((await history('service',first.id)).body.data.map(row=>row.action)).toEqual(['service_cancelled','payment_approved']);
  const second=await service();
  expect((await post('/api/admin/service-requests/'+second.id+'/reject-payment').send({reason:'Proof is unreadable'})).status).toBe(200);
  expect((await history('service',second.id)).body.data[0]).toMatchObject({action:'payment_rejected',changes:{paymentStatus:{from:'Payment Submitted',to:'Payment Pending'}}});
 });
 it('captures a pending-booking reassignment and treats retries as no additional change',async()=>{
  const second=await Mechanic.create({specialization:'general',yearsOfExperience:2,username:'audit.mechanic',password:'SyntheticPass1',firstName:'QA',lastName:'Mechanic',phoneNumber:'09000000001',createdBy:fixtures.admin._id});
  const record=await service({paymentStatus:'Confirmed'});
  const body={requestId:record.id,mechanicId:second.id};
  expect((await put('/api/service-requests/assign').send(body)).status).toBe(200);
  expect((await put('/api/service-requests/assign').send(body)).status).toBe(200);
  const response=await history('service',record.id);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.data[0]).toMatchObject({action:'mechanic_reassigned',actorRole:'admin',changes:{mechanic:{from:fixtures.mechanic.id,to:second.id}}});
 });
 it('records completed-sale corrections, ignores injected revenue fields and does not duplicate concurrent retries',async()=>{
  const record=await Order.create({customerName:'Synthetic',customerPhone:'09000000000',totalPrice:1200,status:'completed',items:[]});
  const response=await put('/api/dashboard/transactions/'+record.id).send({status:'pending',totalPrice:999999,items:[{quantity:999}]});
  expect(response.status).toBe(200);
  expect(response.body.data.totalPrice).toBe(1200);expect(response.body.data.items).toEqual([]);
  const retried=await Promise.all([1,2].map(()=>put('/api/dashboard/transactions/'+record.id).send({status:'pending'})));
  expect(retried.every(row=>row.status===200)).toBe(true);
  const result=await history('order',record.id);
  expect(result.body.data).toHaveLength(1);
  expect(result.body.data[0]).toMatchObject({action:'completed_sale_corrected',changes:{status:{from:'completed',to:'pending'}}});
 });
 it('rolls the mutation back if writing its audit fails',async()=>{
  const record=await Order.create({customerName:'Synthetic',customerPhone:'09000000000',totalPrice:1200,status:'completed',items:[]});
  vi.spyOn(Audit,'create').mockRejectedValueOnce(new Error('Synthetic audit write failure'));
  expect((await put('/api/dashboard/transactions/'+record.id).send({status:'cancelled'})).status).toBe(500);
  expect((await Order.findById(record.id)).status).toBe('completed');
  expect(await Audit.countDocuments()).toBe(0);
 });
 it('rolls back a payment review and its audit when a later action fails',async()=>{
  const record=await reservation();
  vi.spyOn(Notification,'create').mockRejectedValueOnce(new Error('Synthetic notification failure'));
  expect((await post('/api/admin/reservations/'+record.id+'/confirm')).status).toBe(500);
  expect((await Reservation.findById(record.id)).status).toBe('Payment Submitted');
  expect(await Audit.countDocuments()).toBe(0);
 });
 it('restricts history to Admin and rejects malformed or unsupported record references',async()=>{
  const record=await service();
  const path='/api/dashboard/audit/service/'+record.id;
  expect((await api.get(path)).status).toBe(401);
  for(const other of [signCustomer(fixtures.customer),signMechanic(fixtures.mechanic)]){
    expect((await api.get(path).set('Authorization','Bearer '+other)).status).toBe(403);
  }
  for(const type of ['unknown','constructor','__proto__'])expect((await history(type,record.id)).status).toBe(400);
  expect((await history('service','invalid')).status).toBe(400);
  expect((await history('service',record.id)).body.data).toEqual([]);
 });
 it('preserves history when a completed legacy sale is deleted',async()=>{
  const record=await Order.create({customerName:'Synthetic',customerPhone:'09000000000',totalPrice:1200,status:'completed',items:[]});
  expect((await api.delete('/api/dashboard/transactions/'+record.id).set('Authorization','Bearer '+token)).status).toBe(200);
  expect((await api.delete('/api/dashboard/transactions/'+record.id).set('Authorization','Bearer '+token)).status).toBe(404);
  expect(await Order.findById(record.id)).toBeNull();
  const result=await history('order',record.id);
  expect(result.body.data).toHaveLength(1);
  expect(result.body.data[0]).toMatchObject({action:'completed_sale_deleted',changes:{status:{from:'completed',to:'deleted'}}});
 });

});
