import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import supertest from 'supertest';

const require = createRequire(import.meta.url);
const {
  app,
  Notification,
  startReplicaSet,
  stopReplicaSet,
  clearCollections,
  createFixtures,
  signCustomer,
  signAdmin
} = require('./helpers');
const Admin = require('../../models/adminModels/admin');

const api = supertest(app);
let fixtures;
let customerToken;
let secondCustomerToken;
let adminToken;
let secondAdminToken;
let secondAdminId;

function notification({ audience, customerId = null, message = 'A notification was created.' }) {
  return {
    audience,
    customerId,
    type: 'payment_confirmed',
    message,
    link: '/notifications',
    recordId: fixtures.product._id,
    recordType: 'item',
    read: false
  };
}

describe('notification clear integration', () => {
  beforeAll(async () => {
    await startReplicaSet();
  }, 180000);

  afterAll(async () => {
    await stopReplicaSet();
  }, 180000);

  beforeEach(async () => {
    await clearCollections();
    fixtures = await createFixtures();
    const secondAdmin = await Admin.create({
      username: 'second_admin',
      password: 'IntegrationPass2'
    });
    secondAdminId = secondAdmin._id;
    customerToken = signCustomer(fixtures.customer);
    secondCustomerToken = signCustomer(fixtures.secondCustomer);
    adminToken = signAdmin(fixtures.admin);
    secondAdminToken = signAdmin(secondAdmin);
  });

  it('clears only the requesting customer notifications and preserves other customer documents', async () => {
    const [ownedNotification, otherNotification] = await Notification.create([
      notification({ audience: 'customer', customerId: fixtures.customer._id }),
      notification({ audience: 'customer', customerId: fixtures.secondCustomer._id, message: 'Keep this notification.' })
    ]);

    const cleared = await api.delete('/api/notifications')
      .set('Authorization', 'Bearer ' + customerToken);
    const ownList = await api.get('/api/notifications').set('Authorization', 'Bearer ' + customerToken);
    const otherList = await api.get('/api/notifications').set('Authorization', 'Bearer ' + secondCustomerToken);

    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ success: true, unreadCount: 0 });
    expect(ownList.body).toMatchObject({ notifications: [], unreadCount: 0 });
    expect(otherList.body.notifications.map((item) => item._id)).toContain(String(otherNotification._id));
    expect(await Notification.countDocuments()).toBe(2);
    expect((await Notification.findById(ownedNotification._id)).clearedAt).toBeInstanceOf(Date);
  });

  it('hides shared admin notifications only for the admin who clears them', async () => {
    const [sharedNotification] = await Notification.create([
      notification({ audience: 'admin' })
    ]);

    const cleared = await api.delete('/api/admin/notifications').set('Authorization', 'Bearer ' + adminToken);
    const firstAdminList = await api.get('/api/admin/notifications').set('Authorization', 'Bearer ' + adminToken);
    const secondAdminList = await api.get('/api/admin/notifications').set('Authorization', 'Bearer ' + secondAdminToken);
    const persisted = await Notification.findById(sharedNotification._id).lean();

    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ success: true, unreadCount: 0 });
    expect(firstAdminList.body).toMatchObject({ notifications: [], unreadCount: 0 });
    expect(secondAdminList.body.notifications.map((item) => item._id)).toContain(String(sharedNotification._id));
    expect(secondAdminList.body.unreadCount).toBe(1);
    expect(persisted.clearedBy.map(String)).toEqual([String(fixtures.admin._id)]);
    expect(persisted.clearedBy.map(String)).not.toContain(String(secondAdminId));
    expect(await Notification.countDocuments()).toBe(1);
  });

  it('counts new admin notifications as unread and clears the badge when all are read', async () => {
    const [newNotification] = await Notification.create([
      notification({ audience: 'admin', message: 'A new payment needs review.' })
    ]);

    const beforeRead = await api.get('/api/admin/notifications').set('Authorization', 'Bearer ' + adminToken);
    const markedRead = await api.post('/api/admin/notifications/read-all').set('Authorization', 'Bearer ' + adminToken);
    const afterRead = await api.get('/api/admin/notifications').set('Authorization', 'Bearer ' + adminToken);

    expect(beforeRead.status).toBe(200);
    expect(beforeRead.body.notifications.map((item) => item._id)).toContain(String(newNotification._id));
    expect(beforeRead.body.unreadCount).toBe(1);
    expect(markedRead.status).toBe(200);
    expect(afterRead.body.unreadCount).toBe(0);
    expect((await Notification.findById(newNotification._id)).read).toBe(true);
  });

  it('shows notifications created after a customer clears the current list', async () => {
    await Notification.create(notification({ audience: 'customer', customerId: fixtures.customer._id }));
    await api.delete('/api/notifications').set('Authorization', 'Bearer ' + customerToken);
    const [newNotification] = await Notification.create([
      notification({
        audience: 'customer',
        customerId: fixtures.customer._id,
        message: 'This arrived after clearing.'
      })
    ]);

    const list = await api.get('/api/notifications').set('Authorization', 'Bearer ' + customerToken);

    expect(list.body.notifications.map((item) => item._id)).toEqual([String(newNotification._id)]);
    expect(list.body.unreadCount).toBe(1);
  });

  it('shows new shared admin notifications to an admin after they clear older notifications', async () => {
    await Notification.create(notification({ audience: 'admin' }));
    await api.delete('/api/admin/notifications').set('Authorization', 'Bearer ' + adminToken);
    const [newNotification] = await Notification.create([
      notification({ audience: 'admin', message: 'A new shared admin notification.' })
    ]);

    const list = await api.get('/api/admin/notifications').set('Authorization', 'Bearer ' + adminToken);

    expect(list.body.notifications.map((item) => item._id)).toEqual([String(newNotification._id)]);
    expect(list.body.unreadCount).toBe(1);
  });
});
