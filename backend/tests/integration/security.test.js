import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';
import bcrypt from 'bcryptjs';

const require = createRequire(import.meta.url);
const {
  app,
  BusinessRecord,
  Notification,
  Reservation,
  ServiceRequest,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  mockCloudinary,
  createFixtures,
  signCustomer,
  signMechanic,
  signAdmin,
  User
} = require('./helpers');

const api = supertest(app);
let fixtures;
let customerToken;
let mechanicToken;
let adminToken;

describe('security integration', () => {
  beforeAll(async () => {
    await startReplicaSet();
    mockCloudinary();
  }, 180000);

  afterAll(async () => {
    await stopReplicaSet();
  }, 180000);

  beforeEach(async () => {
    await clearCollections();
    fixtures = await createFixtures();
    customerToken = signCustomer(fixtures.customer);
    mechanicToken = signMechanic(fixtures.mechanic);
    adminToken = signAdmin(fixtures.admin);
  });

  it('rejects every role from three routes belonging to another role', async () => {
    const roleRoutes = [
      { path: '/api/customers/me', method: 'get', allowed: 'customer' },
      { path: '/api/customers/me/password', method: 'post', allowed: 'customer', body: {} },
      { path: '/api/customers/me', method: 'delete', allowed: 'customer', body: {} },
      { path: '/api/mechanic/parts', method: 'get', allowed: 'mechanic' },
      { path: '/api/mechanic/jobs/available', method: 'get', allowed: 'mechanic' },
      { path: `/api/mechanic/${fixtures.mechanic._id}/stats`, method: 'get', allowed: 'mechanic' },
      { path: '/api/dashboard/dashboard', method: 'get', allowed: 'admin' },
      { path: '/api/dashboard/business-records', method: 'get', allowed: 'admin' },
      { path: '/api/admin/reservations', method: 'get', allowed: 'admin' }
    ];
    const tokens = { customer: customerToken, mechanic: mechanicToken, admin: adminToken };

    for (const route of roleRoutes) {
      const deniedTokens = Object.entries(tokens).filter(([role]) => role !== route.allowed);
      for (const [, token] of deniedTokens) {
        const response = await api[route.method](route.path)
          .set('Authorization', `Bearer ${token}`)
          .send(route.body || {});
        expect(response.status, `${route.method.toUpperCase()} ${route.path}`).toBe(403);
      }
      const unauthenticated = await api[route.method](route.path).send(route.body || {});
      expect(unauthenticated.status, `missing token: ${route.method.toUpperCase()} ${route.path}`).toBe(401);
    }
  });

  it('rejects a deleted customer using a previously issued token', async () => {
    await User.updateOne({ _id: fixtures.customer._id }, { $set: { isDeleted: true } });

    const response = await api.get('/api/users/profile')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/deleted/i);
  });

  it('blocks account deletion when an active reservation exists', async () => {
    const password = 'CustomerPass1';
    await User.updateOne({ _id: fixtures.customer._id }, { $set: { password: await bcrypt.hash(password, 10) } });
    await Reservation.create({
      code: 'SECURITY-ACTIVE-RESERVATION',
      customerId: fixtures.customer._id,
      customerName: 'Casey Customer',
      customerPhone: '09171234567',
      items: [{
        productId: fixtures.product._id,
        name: fixtures.product.name,
        unitPrice: 1000,
        qty: 1,
        lineTotal: 1000
      }],
      status: 'Reserved',
      total: 1000,
      downPaymentPercent: 30,
      downPaymentAmount: 300,
      amountPaid: 300,
      balanceDue: 700
    });

    const response = await api.delete('/api/customers/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Finish or cancel your active reservations and bookings first.');
    expect((await User.findById(fixtures.customer._id)).isDeleted).not.toBe(true);
  });

  it('blocks account deletion when an accepted service booking exists', async () => {
    const password = 'CustomerPass1';
    await User.updateOne({ _id: fixtures.customer._id }, { $set: { password: await bcrypt.hash(password, 10) } });
    await ServiceRequest.create({
      user: fixtures.customer._id,
      customerId: fixtures.customer._id,
      serviceId: fixtures.service._id,
      mechanic: fixtures.mechanic._id,
      serviceType: fixtures.service.name,
      description: 'Accepted active booking',
      estimatedPrice: 2500,
      laborFee: 900,
      paymentStatus: 'Confirmed',
      status: 'accepted'
    });

    const response = await api.delete('/api/customers/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Finish or cancel your active reservations and bookings first.');
    expect((await User.findById(fixtures.customer._id)).isDeleted).not.toBe(true);
  });

  it('anonymizes historical customer records without changing their amounts or dates', async () => {
    const password = 'CustomerPass1';
    await User.updateOne({ _id: fixtures.customer._id }, { $set: { password: await bcrypt.hash(password, 10) } });
    const [notification] = await Notification.create([{
      audience: 'customer',
      customerId: fixtures.customer._id,
      type: 'payment_confirmed',
      message: 'A historical reservation was confirmed.',
      recordId: fixtures.product._id,
      recordType: 'item'
    }]);
    const purchasedAt = new Date('2025-08-12T09:30:00+08:00');
    const reservationDate = new Date('2025-08-14T16:15:00+08:00');
    const bookingDate = new Date('2025-08-16T11:45:00+08:00');
    const [reservation] = await Reservation.create([{
      code: 'SECURITY-PAST-RESERVATION',
      customerId: fixtures.customer._id,
      customerName: 'Casey Customer',
      customerPhone: '09171234567',
      items: [{
        productId: fixtures.product._id,
        name: fixtures.product.name,
        unitPrice: 1000,
        qty: 2,
        lineTotal: 2000
      }],
      status: 'Completed',
      total: 2000,
      downPaymentPercent: 30,
      downPaymentAmount: 600,
      amountPaid: 2000,
      balanceDue: 0,
      completedAt: reservationDate
    }]);
    const [booking] = await ServiceRequest.create([{
      user: fixtures.customer._id,
      customerId: fixtures.customer._id,
      serviceId: fixtures.service._id,
      serviceType: fixtures.service.name,
      description: 'Completed historical service',
      estimatedPrice: 2500,
      laborFee: 900,
      paymentStatus: 'Confirmed',
      status: 'completed',
      completedAt: bookingDate
    }]);
    await BusinessRecord.create([
      {
        recordType: 'product',
        sourceId: reservation._id,
        customer: 'Casey Customer',
        customerPhone: '09171234567',
        itemName: 'Historical reservation',
        amount: 2000,
        createdAt: purchasedAt,
        completedAt: reservationDate
      },
      {
        recordType: 'service',
        sourceId: booking._id,
        customer: 'Casey Customer',
        customerPhone: '09171234567',
        itemName: 'Historical service',
        amount: 2500,
        laborFee: 900,
        createdAt: purchasedAt,
        completedAt: bookingDate
      }
    ]);
    const beforeRecords = await BusinessRecord.find({ sourceId: { $in: [reservation._id, booking._id] } }).lean();

    const response = await api.delete('/api/customers/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Your account was deleted.');
    const retainedNotification = await Notification.findById(notification._id).lean();
    expect(retainedNotification).not.toBeNull();
    expect(retainedNotification.clearedAt).toBeInstanceOf(Date);
    const deletedUser = await User.findById(fixtures.customer._id).lean();
    expect(deletedUser).toMatchObject({
      isDeleted: true,
      email: `deleted-${fixtures.customer._id}@deleted.local`,
      firstName: 'Deleted',
      lastName: 'customer',
      phoneNumber: null
    });
    const updatedReservation = await Reservation.findById(reservation._id).lean();
    expect(updatedReservation).toMatchObject({ customerName: 'Deleted customer', customerPhone: '' });
    expect(updatedReservation.total).toBe(2000);
    expect(updatedReservation.completedAt).toEqual(reservationDate);
    const afterRecords = await BusinessRecord.find({ sourceId: { $in: [reservation._id, booking._id] } }).lean();
    expect(afterRecords).toHaveLength(2);
    for (const before of beforeRecords) {
      const after = afterRecords.find((record) => String(record._id) === String(before._id));
      expect(after.customer).toBe('Deleted customer');
      expect(after.customerPhone).toBe('');
      expect(after.amount).toBe(before.amount);
      expect(after.createdAt).toEqual(before.createdAt);
      expect(after.completedAt).toEqual(before.completedAt);
    }
    expect((await api.get('/api/users/profile').set('Authorization', `Bearer ${customerToken}`)).status).toBe(401);
  });
});
