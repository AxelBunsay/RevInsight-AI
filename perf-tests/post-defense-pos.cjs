// Run after the frontend production build: node perf-tests/post-defense-pos.cjs
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { chromium } = require('playwright');

async function run() {
  const server = http.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  process.env.FRONTEND_URL = origin;
  const h = require('../backend/tests/integration/helpers');
  let browser;
  try {
    await h.startReplicaSet();
    const fixture = await h.createFixtures();
    await h.Product.updateOne({ _id: fixture.product.id }, { name: 'Oil', price: 300 });
    await h.Service.updateOne({ _id: fixture.service.id }, { name: 'Installation', price: 100, mechanicFee: 50 });
    await h.Order.create({ customerName: 'Test guest', customerPhone: '000', totalPrice: 150, status: 'completed',
      items: [{ productName: 'Washer', category: 'Hardware', price: 150, quantity: 1 }], createdAt: new Date('2023-01-02') });
    server.on('request', h.app);

    browser = await chromium.launch();
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.addInitScript(token => localStorage.setItem('adminToken', token), h.signAdmin(fixture.admin));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/admin/ai/')) return route.fulfill({ status: 503, json: { message: 'Offline test' } });
      return url.origin === origin ? route.continue() : route.abort();
    });

    await page.goto(origin + '/admin/transactions');
    await page.getByRole('button', { name: 'Walk-in POS' }).click();
    await page.locator('label').filter({ hasText: /^Product / }).locator('select').selectOption(fixture.product.id);
    await page.getByRole('button', { name: 'Set product quantity' }).click();
    await page.locator('label').filter({ hasText: /^Service / }).locator('select').selectOption(fixture.service.id);
    await page.getByRole('button', { name: 'Queue service and open checkout' }).click();
    await page.getByText(/450\.00.*Cash.*Unpaid/).first().waitFor();
    await page.getByRole('button', { name: 'Confirm cash received' }).click();
    await page.getByText(/450\.00.*Cash.*Paid in full/).first().waitFor();

    await page.goto(origin + '/admin/service-requests');
    const assignment = page.waitForResponse(r => r.url().endsWith('/service-requests/assign'));
    await page.getByLabel('Assign mechanic for Installation').selectOption(fixture.mechanic.id);
    assert.equal((await assignment).status(), 200);
    const job = await h.ServiceRequest.findOne({ walkInId: { $exists: true } });
    for (const status of ['in-progress', 'completed']) {
      const result = await fetch(origin + '/api/service-requests/status', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + h.signMechanic(fixture.mechanic) },
        body: JSON.stringify({ requestId: job.id, status })
      });
      assert.equal(result.status, 200);
    }
    await page.goto(origin + '/admin');
    const search = page.getByLabel('Search revenue contributors');
    const contributors = search.locator('xpath=ancestor::section[1]');
    await contributors.getByText(/Oil.*66\.67%/).waitFor();
    await search.fill('oil');
    assert.equal(await contributors.locator('li').count(), 1);
    await page.getByRole('button', { name: 'All records', exact: true }).click();
    await search.fill('oil');
    await contributors.getByText(/Oil.*50\.00%/).waitFor();
    console.log('PASS: PHP450 receipt, queue assignment, completion, and search across PHP450 and PHP600 scopes.');

    await page.addInitScript(({ token, product }) => {
      localStorage.setItem('customerToken', token);
      if (!localStorage.getItem('revinsightCustomerPrototype')) localStorage.setItem('revinsightCustomerPrototype', JSON.stringify({
        vehicles: [{ name: 'Test motorcycle' }], cart: [{ kind: 'product', id: product, key: product, name: 'Oil', price: 300, stock: 4, quantity: 1, selected: true }]
      }));
    }, { token: h.signCustomer(fixture.customer), product: fixture.product.id });
    await page.goto(origin + '/customer/checkout?flow=products');
    await page.getByRole('radio', { name: /Cash Pay at the shop/ }).check();
    await page.getByRole('button', { name: 'Continue to payment' }).click();
    await page.getByText(/Pending cash payment - Pay the deposit/).waitFor();
    await page.goto(origin + '/customer/services/' + fixture.service.id);
    await page.getByLabel('Motorcycle', { exact: true }).selectOption('Test motorcycle');
    await page.getByRole('button', { name: 'Add booking to cart' }).click();
    await page.waitForURL('**/customer/cart');
    await page.goto(origin + '/customer/checkout?flow=services');
    await page.getByRole('button', { name: 'Review service booking' }).click();
    await page.getByRole('button', { name: 'Submit 1 service booking' }).click();
    await page.getByText(/Request created/).first().waitFor();
    const queued = await h.ServiceRequest.findOne({ queueKey: { $exists: true } });
    assert.equal(queued.paymentMethod, 'Cash');
    assert.equal(queued.scheduledDate, null);
    await page.goto(origin + '/admin/service-requests');
    const deposit = page.waitForResponse(r => r.url().endsWith('/cash-deposit'));
    await page.getByRole('button', { name: /Record cash deposit received/ }).click();
    assert.equal((await deposit).status(), 200);
    const collected = await h.ServiceRequest.findById(queued.id);
    assert.equal(collected.amountPaid, 45);
    assert.equal(collected.balanceDue, 105);
    await page.goto(origin + '/customer/reservations/' + queued.id);
    await page.getByText(/Service queue/).first().waitFor();
    console.log('PASS: online Cash product hold, service queue request, PHP45 deposit, PHP105 balance.');
  } finally {
    await browser?.close();
    server.close();
    await h.stopReplicaSet();
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; });
