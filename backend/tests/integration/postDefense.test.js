import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const { app, startReplicaSet, stopReplicaSet, clearCollections, createFixtures, mockCloudinary,
  Product, Mechanic, Service, ServiceRequest, BusinessRecord, Order, Reservation,
  signAdmin, signCustomer, signMechanic } = require('./helpers');
const { expireServiceBookings } = require('../../controllers/serviceRequestController');
const { expireReservations } = require('../../controllers/reservationController');
const WalkIn = require('../../models/walkIn');
const api = supertest(app);
let fixtures, staff, mechanic, customer;
const visits = '/api/dashboard/walk-ins';
const dashboard = '/api/dashboard/analytics/scoped-revenue';
const proof = Buffer.from([137,80,78,71,13,10,26,10,0]);

describe('walk-in posting and online payment holds', () => {
  beforeAll(startReplicaSet);
  afterAll(stopReplicaSet);
  beforeEach(async () => {
    await clearCollections();
    await WalkIn.deleteMany({});
    fixtures = await createFixtures();
    staff = 'Bearer ' + signAdmin(fixtures.admin);
    customer = 'Bearer ' + signCustomer(fixtures.customer);
    mechanic = 'Bearer ' + signMechanic(fixtures.mechanic);
    mockCloudinary();
    await Product.updateOne({}, { name: 'Oil', price: 300 });
    await Service.updateOne({}, { name: 'Installation', price: 100, mechanicFee: 50 });
  });

  function startVisit(method, items, serviceId) {
    return api.post(visits).set('Authorization', staff).send({ requestKey: 'test-visit-request-123', method, items, serviceId });
  }
  const productLine = () => ({ productId: fixtures.product.id, quantity: 1 });
  const act = (path, body = {}) => api.post(path).set('Authorization', staff).send(body);
  const jobStatus = (id, status) => api.put('/api/service-requests/status').set('Authorization', mechanic).send({ requestId: id, status });
  const assign = id => api.put('/api/service-requests/assign').set('Authorization', staff).send({ requestId: id, mechanicId: fixtures.mechanic.id });
  async function scope(query = {}) {
    const result = await api.get(dashboard).set('Authorization', staff).query(query).expect(200);
    return result.body.data.concentration;
  }
  it('posts a single paid PHP 450 receipt and recognizes each line at the correct event', async () => {
    const { visit } = (await startVisit('Cash', [productLine()], fixtures.service.id).expect(200)).body;
    expect(visit).toMatchObject({ total: 450, customer: 'Walk-in Guest', handledBy: fixtures.admin.id, status: 'Unpaid' });
    expect((await startVisit('Cash', [productLine()], fixtures.service.id)).body.visit._id).toBe(visit._id);
    expect(await ServiceRequest.countDocuments()).toBe(1);
    expect((await scope()).totalRevenue).toBe(0);
    const results = await Promise.all([act(visits+'/'+visit._id+'/confirm'),act(visits+'/'+visit._id+'/confirm')]);
    expect(results.map(r => r.status)).toEqual([200,200]);
    expect(await Order.countDocuments({ walkInId: visit._id })).toBe(1);
    expect((await Product.findById(fixtures.product.id)).quantity).toBe(4);
    expect((await scope()).totalRevenue).toBe(300);
    await assign(visit.jobId).expect(200);
    await jobStatus(visit.jobId, 'in-progress').expect(200);
    expect((await Mechanic.findById(fixtures.mechanic.id)).availabilityStatus).toBe('busy');
    await jobStatus(visit.jobId, 'completed').expect(200);
    await jobStatus(visit.jobId, 'completed').expect(400);
    expect((await Mechanic.findById(fixtures.mechanic.id)).availabilityStatus).toBe('available');
    expect(await BusinessRecord.countDocuments({ recordType: 'service', sourceId: visit.jobId })).toBe(1);
    const totals = await scope();
    expect(totals.totalRevenue).toBe(450);
    expect(totals.coverage.includedTransactions).toBe(1);
    expect(totals.salesMix).toMatchObject({ itemSales: 300, serviceRevenue: 150 });
    expect(totals.contributors.map(row => [row.name,row.revenue])).toEqual([['Oil',300],['Installation',150]]);
    expect((await scope({ scope:'selectedQuarter', selectedQuarter:'2020-Q1' })).totalRevenue).toBe(0);
  });
  it('fulfills a historical paid appointment and excludes a cancelled service-only visit from revenue', async () => {
    const { visit } = (await startVisit('Cash', [], fixtures.service.id).expect(200)).body;
    await act(visits + '/' + visit._id + '/confirm').expect(200);
    await api.put('/api/service-requests/status/admin').set('Authorization', staff)
      .send({ requestId: visit.jobId, status: 'cancelled', refundDecision: 'refunded' }).expect(200);
    expect((await scope()).totalRevenue).toBe(0);
    const legacy = await ServiceRequest.create({ user: fixtures.customer.id, mechanic: fixtures.mechanic.id, status: 'assigned',
      scheduledDate: new Date('2025-09-01'), startTime: '10:00', endTime: '11:00', serviceType: 'Legacy installation',
      description: 'Isolated appointment', paymentStatus: 'Confirmed', estimatedPrice: 150 });
    await jobStatus(legacy.id, 'in-progress').expect(200);
    await jobStatus(legacy.id, 'completed').expect(200);
    expect((await scope()).totalRevenue).toBe(150);
  });

  it('requires GCash receipt verification before posting a product-only visit', async () => {
    const { visit } = (await startVisit('GCash', [productLine()]).expect(200)).body;
    expect(visit.jobId).toBeUndefined();
    const path = visits + '/' + visit._id;
    await act(path+'/confirm').expect(409);
    await api.post(path+'/receipt').set('Authorization', staff).field('reference','1234567890123').attach('proof',proof,{filename:'test.png',contentType:'image/png'}).expect(200);
    expect((await scope()).totalRevenue).toBe(0);
    await act(path+'/reject', { reason:'Reference did not match the test transfer.' }).expect(200);
    await act(path+'/confirm').expect(409);
    await api.post(path+'/receipt').set('Authorization', staff).field('reference','1234567890124')
      .attach('proof',proof,{filename:'corrected.png',contentType:'image/png'}).expect(200);
    await act(path+'/confirm').expect(200);
    const saved = await WalkIn.findById(visit._id);
    expect(saved.submissions.map(attempt => attempt.status)).toEqual(['Rejected','Confirmed']);
    expect((await scope()).totalRevenue).toBe(300);
  });
  it('holds online Cash product stock until collection, cancellation or expiry', async () => {
    const submit = key => api.post('/api/reservations').set('Authorization',customer).send({
      paymentMethod:'Cash', requestKey:key, items:[{productId: fixtures.product.id,qty:1}]
    });
    const reservation = (await submit('cash-product-001').expect(201)).body.reservation;
    expect((await submit('cash-product-001')).body.reservation._id).toBe(reservation._id);
    expect(reservation).toMatchObject({ paymentMethod:'Cash', downPaymentAmount:90, amountPaid:0, stockHeld:true });
    expect(reservation.paymentDueAt).toBeTruthy();
    await act('/api/admin/reservations/'+reservation._id+'/confirm',{cashReceived:true}).expect(200);
    expect(await Reservation.findById(reservation._id)).toMatchObject({status:'Reserved',amountPaid:90,balanceDue:210});
    const cancelled = (await submit('cash-product-cancel')).body.reservation;
    await api.post('/api/reservations/'+cancelled._id+'/cancel').set('Authorization',customer).send({ reason:'Test cancellation' }).expect(200);
    expect((await Product.findById(fixtures.product.id)).reservedQty).toBe(1);
    const next = (await submit('cash-product-002')).body.reservation;
    await Reservation.updateOne({_id:next._id},{paymentDueAt:new Date(0)});
    await expireReservations();
    expect((await Reservation.findById(next._id)).status).toBe('Expired');
    expect((await Product.findById(fixtures.product.id)).reservedQty).toBe(1);
  });
  it('serves a paid queue member while another awaits cash and releases unpaid positions', async () => {
    const submit = (key, paymentMethod='Cash') => api.post('/api/services/bookings').set('Authorization',customer)
      .send({bookings:[{requestKey:key,queue:true,paymentMethod,partsSource:'shop',serviceId:fixtures.service.id,vehicle:'Test motorcycle'}]});
    const duplicate = await Promise.all([submit('queue-online-001'),submit('queue-online-001')]);
    const first = duplicate[0].body.results[0].serviceRequest;
    expect(duplicate[1].body.results[0].serviceRequest._id).toBe(first._id);
    const second = (await submit('queue-online-002')).body.results[0].serviceRequest;
    expect(first.scheduledDate).toBeNull();
    expect(first.paymentDueAt).toBeTruthy();
    expect((await submit('queue-online-002')).body.results[0].serviceRequest._id).toBe(second._id);
    await act('/api/admin/service-requests/'+second._id+'/cash-deposit').expect(200);
    expect(await ServiceRequest.findById(second._id)).toMatchObject({amountPaid:45,balanceDue:105,paymentStatus:'Confirmed'});
    await assign(second._id).expect(200);
    await jobStatus(second._id,'in-progress').expect(200);
    await assign(first._id).expect(400);
    const mine = await api.get('/api/service-requests/my').set('Authorization',customer).expect(200);
    expect(mine.body.requests.find(r => r._id === second._id).status).toBe('in-progress');
    await jobStatus(second._id,'completed').expect(200);
    await Mechanic.updateOne({_id:fixtures.mechanic.id},{availabilityStatus:'on-leave'});
    await assign(first._id).expect(400);
    await api.post('/api/service-requests/'+first._id+'/queue/cancel').set('Authorization',customer).expect(200);
    const third = (await submit('queue-online-003','GCash')).body.results[0].serviceRequest;
    expect(third.paymentMethod).toBe('GCash');
    await act('/api/admin/service-requests/'+third._id+'/paid-at-shop').expect(409);
    await ServiceRequest.updateOne({_id:third._id},{paymentDueAt:new Date(0)});
    await expireServiceBookings();
    expect((await ServiceRequest.findById(third._id)).status).toBe('cancelled');
  });
});
