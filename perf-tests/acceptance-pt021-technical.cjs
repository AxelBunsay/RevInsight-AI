// PT-021 supporting interpretation: real logins, isolated contexts, shared start.
const L = require('./acceptance-lib.cjs');
const { fs, path, models: M, connect, mongoose, ensure } = L;
const { chromium } = require('playwright');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/acceptance/build-manifest.json')));
const out = path.resolve(root, 'docs/acceptance/evidence', process.argv[2] || 'retest-20261113/pt021-attempt-1');
ensure(out.startsWith(path.join(root, 'docs/acceptance/evidence') + path.sep), 'Evidence must stay inside acceptance workspace');
ensure(!fs.existsSync(path.join(out, 'concurrent-browser.json')), 'Preserve the prior attempt; choose a new output directory');
fs.mkdirSync(out, { recursive: true });
const report = {
  label: 'PT-021 technical retest using role-specific actions',
  id: 'PT-021', buildId: manifest.buildId, questionnaireStatus: 'PENDING',
  adviserApproval: 'PENDING; role-specific interpretation requires adviser confirmation for both IT experts',
  createdAt: new Date().toISOString(), browser: 'Playwright bundled Chromium, headless, 1440x1000',
  method: 'Five independent browser contexts; actual UI sign-in for all five before one shared workload barrier. All seven actions measured from browser action to visible/usable result; database checks occur after timing.',
  setup: [], actions: [], errors: [], databaseChecks: {}, technicalStatus: 'PENDING'
};
let browser;
const sessions = [];
const save = () => fs.writeFileSync(path.join(out, 'concurrent-browser.json'), JSON.stringify(report, null, 2));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
async function verifyBuild() {
  for (const group of ['files', 'bundle']) {
    const mismatches = Object.entries(manifest[group]).filter(([file, digest]) => !fs.existsSync(path.join(root, file)) || hash(fs.readFileSync(path.join(root, file))) !== digest);
    ensure(!mismatches.length, 'Recorded build drift: ' + mismatches.map(([file]) => file).join(', '));
  }
  const served = [];
  for (const [file, digest] of Object.entries(manifest.bundle).filter(([file]) => /index\.html$|assets\/.*\.(js|css)$/.test(file))) {
    const url = 'http://localhost:5100/' + file.replace('frontend/dist/', '');
    const response = await fetch(url);
    const actual = hash(Buffer.from(await response.arrayBuffer()));
    ensure(response.status === 200 && actual === digest, 'Served bundle differs from recorded build: ' + file);
    served.push({ file, status: response.status, sha256: actual });
  }
  report.buildVerification = { sourceFiles: Object.keys(manifest.files).length, bundleFiles: Object.keys(manifest.bundle).length, served };
}
async function adminReady(page) {
  await page.getByLabel('Business overview', { exact: true }).waitFor();
  await page.locator('.admin-sales-hero canvas, .admin-sales-hero .admin-empty-state').first().waitFor();
  await page.getByLabel('Loading service revenue').waitFor({ state: 'hidden' });
  await page.locator('.admin-dashboard-lower').waitFor();
  await page.waitForTimeout(250); // Chart.js uses a 220 ms rendering animation.
}
async function mechanicReady(page) {
  await page.getByRole('heading', { name: /dashboard/i }).first().waitFor();
  await page.locator('.availability-panel p').filter({ hasText: /^Specialization: general / }).waitFor();
  ensure(!await page.locator('.mechanic-alert').isVisible(), 'Mechanic dashboard error');
}
async function browseReady(page) {
  await page.getByLabel('Search products', { exact: true }).waitFor();
  await page.getByRole('link', { name: /^QA Brake Pad,/ }).waitFor();
  await page.locator('.product-skeleton').first().waitFor({ state: 'hidden' });
}
async function measure(session, action, fn) {
  const start = performance.now();
  const startedAt = new Date().toISOString();
  const errorStart = report.errors.length;
  const observation = { id: 'PT-021', session: session.label, action, startedAt,
    offsetFromSharedStartMs: start - report.sharedStart.monotonicMs, limitMs: 5000 };
  try {
    const actual = await fn();
    await session.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    observation.elapsedMs = performance.now() - start;
    observation.finishedAt = new Date().toISOString();
    observation.actual = actual;
    observation.status = observation.elapsedMs <= 5000 ? 'PASS' : 'FAIL';
  } catch (error) {
    observation.elapsedMs = performance.now() - start;
    observation.finishedAt = new Date().toISOString();
    observation.actual = error.stack;
    observation.status = 'FAIL';
  }
  observation.errors = report.errors.slice(errorStart).filter(error => error.session === session.label);
  if (observation.errors.some(error => error.kind !== 'navigation-abort')) observation.status = 'FAIL';
  report.actions.push(observation);
  save();
  console.log(session.label, action, observation.status, Math.round(observation.elapsedMs) + ' ms');
  return observation;
}
async function main() {
  await verifyBuild();
  await connect();
  const Admin = require('../backend/models/adminModels/admin');
  const suffix = Date.now().toString(36);
  const password = 'AcceptancePass1';
  const hashed = await require('../backend/node_modules/bcryptjs').hash(password, 10);
  const admins = await Admin.create([1, 2].map(n => ({ username: 'qapt_a' + n + '_' + suffix, password })));
  const customers = await M.User.create([1, 2].map(n => ({ username: 'qapt_c' + n + '_' + suffix,
    email: 'pt021-' + n + '-' + suffix + '@example.com', password: hashed,
    firstName: 'PT021', lastName: 'Customer' + n, phoneNumber: '0917999000' + n, isEmailVerified: true })));
  const mechanic = await M.Mechanic.create({ username: 'qapt_m1_' + suffix, password: hashed, firstName: 'PT021',
    lastName: 'Mechanic', phoneNumber: '09189990001', specialization: 'general', yearsOfExperience: 3,
    availabilityStatus: 'available', createdBy: admins[0]._id });
  const product = await M.Product.findOne({ name: 'QA Brake Pad', isArchived: { $ne: true } }).lean();
  ensure(product && product.quantity - product.reservedQty >= 2, 'Insufficient synthetic stock for two reservations');
  report.stockBefore = { id: product._id, quantity: product.quantity, reservedQty: product.reservedQty };
  browser = await chromium.launch();
  const definitions = [
    ['Customer 1', 'customer', customers[0]], ['Customer 2', 'customer', customers[1]],
    ['Admin 1', 'admin', admins[0]], ['Admin 2', 'admin', admins[1]], ['Mechanic 1', 'mechanic', mechanic]
  ];
  // Complete all sign-ins before scheduling any of the measured workloads.
  for (const [label, kind, account] of definitions) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const session = { label, kind, account, context, page, phase: 'sign-in' };
    sessions.push(session);
    page.on('pageerror', error => { report.errors.push({ session: label, phase: session.phase, kind: 'pageerror', at: new Date().toISOString(), message: error.message }); save(); });
    page.on('response', response => {
      if (response.status() >= 400) {
        report.errors.push({ session: label, phase: session.phase, kind: 'http', at: new Date().toISOString(), url: response.url(), status: response.status() }); save();
      }
    });
    page.on('requestfailed', request => {
      const message = request.failure()?.errorText || '';
      report.errors.push({ session: label, phase: session.phase, kind: message.includes('ERR_ABORTED') ? 'navigation-abort' : 'requestfailed', at: new Date().toISOString(), url: request.url(), message }); save();
    });
    await page.goto('http://localhost:5100/' + kind + '/login');
    await page.getByLabel(kind === 'customer' ? 'Username or email' : 'Username', { exact: true }).fill(account.username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/' + (kind === 'customer' ? 'users' : kind === 'admin' ? 'admin' : 'mechanics') + '/login'));
    await page.locator('button[type=submit]').click();
    const login = await response;
    ensure(login.status() === 200, label + ' sign-in failed: HTTP ' + login.status());
    if (kind === 'customer') await browseReady(page);
    else if (kind === 'admin') await adminReady(page);
    else await mechanicReady(page);
    const signedIn = await page.evaluate(kind => {
      const token = localStorage.getItem(kind + 'Token');
      return token ? JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) : null;
    }, kind);
    ensure(signedIn && String(signedIn.id || signedIn.userId) === String(account._id), label + ' authenticated identity mismatch');
    report.setup.push({ session: label, username: account.username, accountId: account._id,
      loginHttpStatus: login.status(), signedInAt: new Date().toISOString(), browserUrl: page.url(),
      context: definitions.findIndex(([name]) => name === label) + 1, authentication: 'actual UI login; no inserted tokens' });
    save();
    // Preserve authentication while giving all workload navigations a blank start page.
    await page.goto('about:blank');
  }
  ensure(report.setup.length === 5, 'All five sessions must be signed in first');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const workloads = sessions.map(async session => {
    await gate;
    session.phase = 'workload';
    const { page, kind } = session;
    if (kind === 'customer') {
      await measure(session, 'browse Shop', async () => {
        await page.goto('http://localhost:5100/customer/shop');
        await browseReady(page);
        return { visibleProducts: await page.locator('.product-card:not(.product-skeleton)').count() };
      });
      const result = await measure(session, 'make reservation through UI', async () => {
        await page.getByLabel('Search products', { exact: true }).fill('QA Brake Pad');
        await page.getByRole('link', { name: /^QA Brake Pad,/ }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Add to cart', exact: true }).click();
        await page.getByText('Added to Reservation Cart', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Close product details' }).click();
        await page.goto('http://localhost:5100/customer/cart');
        await page.getByRole('button', { name: 'Check out products', exact: true }).click();
        const response = page.waitForResponse(r => r.url().endsWith('/api/reservations') && r.request().method() === 'POST');
        await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
        const created = await response;
        const body = await created.json();
        ensure(created.status() === 201 && body.reservation?.code, 'Reservation checkout did not succeed');
        const reservation = body.reservation;
        await page.getByText(new RegExp(reservation.code)).first().waitFor();
        await page.getByRole('dialog').getByLabel('GCash reference number').waitFor();
        session.reservationId = reservation._id;
        return { code: reservation.code, reservationId: reservation._id, httpStatus: created.status(), confirmationUsable: true };
      });
      if (result.status === 'FAIL') await page.screenshot({ path: path.join(out, session.label.replace(/ /g, '-') + '-failure.png'), fullPage: true });
    } else if (kind === 'admin') {
      await measure(session, 'open Admin Dashboard', async () => {
        await page.goto('http://localhost:5100/admin/dashboard');
        await adminReady(page);
        return { summaryChartCategoryServiceInventoryUsable: true };
      });
    } else {
      await measure(session, 'open Mechanic Dashboard', async () => {
        await page.goto('http://localhost:5100/mechanic/dashboard');
        await mechanicReady(page);
        return { workloadEarningsAvailabilityAndJobsUsable: true };
      });
    }
    session.phase = 'after-workload';
  });
  report.sharedStart = { at: new Date().toISOString(), monotonicMs: performance.now(), signedInSessions: report.setup.length };
  save(); release();
  await Promise.all(workloads);
  const createdReservations = await M.Reservation.find({ customerId: { $in: customers.map(c => c._id) } }).lean();
  const after = await M.Product.findById(product._id).lean();
  report.databaseChecks = {
    reservationCount: createdReservations.length,
    reservations: createdReservations.map(r => ({ id: r._id, code: r.code, customerId: r.customerId, stockHeld: r.stockHeld, total: r.total, downPaymentAmount: r.downPaymentAmount, status: r.status })),
    stockAfter: { quantity: after.quantity, reservedQty: after.reservedQty },
    correct: createdReservations.length === 2 && createdReservations.every(r => r.stockHeld && r.items.length === 1 && r.items[0].qty === 1 && String(r.items[0].productId) === String(product._id)) && after.quantity === product.quantity && after.reservedQty === product.reservedQty + 2
  };
  report.technicalStatus = report.actions.length === 7 && report.actions.every(a => a.status === 'PASS') && report.databaseChecks.correct && !report.errors.some(e => e.phase === 'workload' && e.kind !== 'navigation-abort') ? 'PASS' : 'FAIL';
}
main().catch(error => { report.technicalStatus = 'FAIL'; report.runnerError = error.stack; console.error(error); process.exitCode = 1; })
  .finally(async () => {
    for (const session of sessions) {
      await session.page.screenshot({ path: path.join(out, session.label.replace(/ /g, '-') + '.png'), fullPage: true }).catch(() => {});
      await session.context.tracing.stop({ path: path.join(out, session.label.replace(/ /g, '-') + '.zip') }).catch(() => {});
    }
    await browser?.close();
    await mongoose.disconnect();
    report.completedAt = new Date().toISOString();
    save();
    const esc = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
    const rows = [['label','build_id','session','action','start_utc','finish_utc','elapsed_ms','limit_ms','technical_status','errors'],
      ...report.actions.map(a => [report.label,report.buildId,a.session,a.action,a.startedAt,a.finishedAt,a.elapsedMs,a.limitMs,a.status,JSON.stringify(a.errors)])];
    fs.writeFileSync(path.join(out, 'raw-timings.csv'), rows.map(row => row.map(esc).join(',')).join('\r\n'));
    console.log(report.label, report.technicalStatus, 'questionnaire PENDING', report.buildId);
  });
