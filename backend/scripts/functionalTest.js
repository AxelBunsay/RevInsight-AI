const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');

const scriptsDir = __dirname;
const casesPath = path.join(scriptsDir, 'data', 'functional-test-cases.md');
const outputDir = path.join(scriptsDir, 'output');
const resultsPath = path.join(outputDir, 'functional-results.json');
const testDataPath = path.join(outputDir, 'functional-testdata.json');
const allowedCollections = new Set([
  'products',
  'services',
  'servicerequests',
  'reservations',
  'users',
  'mechanics',
  'businessrecords'
]);

function parseEnvFile(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function loadEnvironment() {
  let fileValues = {};
  try {
    fileValues = parseEnvFile(await fs.readFile(path.join(scriptsDir, '.env'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ...fileValues, ...process.env };
}

function parseCases(markdown) {
  const cases = [];
  const sections = markdown.split(/(?=^FT-\d{3}\s*$)/m).slice(1);
  for (const section of sections) {
    const id = section.match(/^FT-\d{3}/)?.[0];
    const testCase = section.match(/^\s*TEST CASE:\s*(.+)$/m)?.[1]?.trim();
    if (!id || !testCase) continue;
    const fragments = testCase
      .split(/(?=\([a-z]\)\s*)/i)
      .map((text) => text.trim())
      .filter(Boolean);
    cases.push({
      ID: id,
      description: testCase,
      fragments: fragments.length ? fragments : [testCase]
    });
  }
  return cases;
}

function buildUrl(baseUrl, pathname) {
  return new URL(pathname.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`);
}

async function apiRequest(baseUrl, pathname, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(buildUrl(baseUrl, pathname), {
    method: options.method || 'GET',
    headers,
    signal: AbortSignal.timeout(30000),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body, text };
}

function messageOf(body) {
  return body && typeof body === 'object'
    ? body.message || body.error || JSON.stringify(body)
    : String(body || '(empty response)');
}

const authCache = new Map();
async function authenticate(baseUrl, env, role) {
  const cached = authCache.get(role);
  if (cached) return cached;

  const config = {
    customer: {
      endpoint: '/api/users/login',
      username: env.FUNC_CUSTOMER_EMAIL || env.FUNC_CUSTOMER_USERNAME,
      password: env.FUNC_CUSTOMER_PASSWORD
    },
    admin: {
      endpoint: '/api/admin/login',
      username: env.FUNC_ADMIN_USERNAME,
      password: env.FUNC_ADMIN_PASSWORD
    },
    mechanic: {
      endpoint: '/api/mechanics/login',
      username: env.FUNC_MECHANIC_USERNAME,
      password: env.FUNC_MECHANIC_PASSWORD
    }
  }[role];

  if (!config.username || !config.password) {
    return { unavailable: `FUNC_${role.toUpperCase()}_USERNAME/EMAIL and FUNC_${role.toUpperCase()}_PASSWORD are not configured.` };
  }
  const result = await apiRequest(baseUrl, config.endpoint, {
    method: 'POST',
    body: role === 'customer'
      ? { email: config.username, password: config.password }
      : { username: config.username, password: config.password }
  });
  const token = result.body?.token;
  if (result.status < 200 || result.status >= 300 || !token) {
    return { unavailable: `Configured ${role} login returned HTTP ${result.status}: ${messageOf(result.body)}` };
  }
  const context = { token };
  authCache.set(role, context);
  return context;
}

async function recordApiCheck(result, expectedStatus, description) {
  const passed = Array.isArray(expectedStatus)
    ? expectedStatus.includes(result.status)
    : result.status === expectedStatus;
  return {
    description,
    status: passed ? 'PASS' : 'FAIL',
    actual: `HTTP ${result.status}: ${messageOf(result.body)}`,
    expected: Array.isArray(expectedStatus) ? `HTTP ${expectedStatus.join(' or ')}` : `HTTP ${expectedStatus}`
  };
}

async function runApiCheck({ baseUrl, env, role, endpoint, method, body, expectedStatus, description }) {
  const context = role ? await authenticate(baseUrl, env, role) : {};
  if (context.unavailable) {
    return { description, status: 'NOT AUTOMATED', actual: context.unavailable, reason: 'Required test-account credentials or a successful login are unavailable.' };
  }
  const result = await apiRequest(baseUrl, endpoint, {
    method,
    body,
    token: context.token
  });
  return recordApiCheck(result, expectedStatus, description);
}

const apiChecks = {
  'FT-002': [{
    endpoint: '/api/users/register-request',
    method: 'POST',
    body: {},
    expectedStatus: 400,
    description: 'Reject registration with required fields missing'
  }],
  'FT-003': [
    { role: 'customer', endpoint: '/api/users/profile', expectedStatus: 200, description: 'Customer login and protected profile access' },
    { role: 'admin', endpoint: '/api/admin/admin', expectedStatus: 200, description: 'Admin login and protected admin access' },
    { role: 'mechanic', endpoint: '/api/mechanics/profile', expectedStatus: 200, description: 'Mechanic login and protected profile access' }
  ],
  'FT-005': [
    { endpoint: '/api/users/profile', expectedStatus: [401, 403], description: 'Reject customer profile access without a token' },
    { endpoint: '/api/dashboard/dashboard', expectedStatus: [401, 403], description: 'Reject admin dashboard access without a token' },
    { endpoint: '/api/service-requests/mechanic', expectedStatus: [401, 403], description: 'Reject mechanic job access without a token' }
  ],
  'FT-008': [{ endpoint: '/api/products', expectedStatus: 200, description: 'Fetch the public product list' }],
  'FT-014': [{ endpoint: '/api/services', expectedStatus: 200, description: 'Fetch the public service list' }],
  'FT-015': [{
    role: 'customer',
    endpoint: '/api/services/bookings',
    method: 'POST',
    body: {},
    expectedStatus: 400,
    description: 'Reject a service booking with all required selections missing'
  }],
  'FT-025': [{
    role: 'admin',
    endpoint: '/api/dashboard/inventory',
    method: 'POST',
    body: {},
    expectedStatus: 400,
    description: 'Reject an inventory item with required values missing'
  }],
  'FT-028': [{
    role: 'admin',
    endpoint: '/api/admin/services',
    method: 'POST',
    body: {},
    expectedStatus: 400,
    description: 'Reject a service with required values missing'
  }],
  'FT-029': [
    { role: 'admin', endpoint: '/api/dashboard/transactions', expectedStatus: 200, description: 'Fetch admin transactions' },
    { role: 'admin', endpoint: '/api/service-requests', expectedStatus: 200, description: 'Fetch admin service requests' }
  ],
  'FT-031': [{ role: 'admin', endpoint: '/api/dashboard/dashboard', expectedStatus: 200, description: 'Fetch admin dashboard summary data' }],
  'FT-032': [{ role: 'admin', endpoint: '/api/admin/dashboard/service-revenue', expectedStatus: 200, description: 'Fetch service revenue report data' }],
  'FT-034': [{ role: 'admin', endpoint: '/api/dashboard/inventory', expectedStatus: 200, description: 'Fetch inventory health source data' }],
  'FT-035': [
    { role: 'admin', endpoint: '/api/dashboard/analytics/revenue-risk', expectedStatus: 200, description: 'Fetch revenue risk analysis' },
    { role: 'admin', endpoint: '/api/dashboard/analytics/revenue-concentration', expectedStatus: 200, description: 'Fetch revenue concentration analysis' },
    { role: 'admin', endpoint: '/api/dashboard/analytics/projected-revenue', expectedStatus: 200, description: 'Fetch projected revenue analysis' }
  ],
  'FT-037': [{
    role: 'admin',
    endpoint: '/api/admin/revenue/ask-ai',
    method: 'POST',
    body: { question: '' },
    expectedStatus: 400,
    description: 'Reject an empty Ask AI question without making a valid AI request'
  }],
  'FT-040': [{ role: 'admin', endpoint: '/api/dashboard/reports/sales', expectedStatus: 200, description: 'Fetch sales report data' }],
  'FT-042': [
    { role: 'customer', endpoint: '/api/notifications', expectedStatus: 200, description: 'Fetch customer notifications' },
    { role: 'admin', endpoint: '/api/admin/notifications', expectedStatus: 200, description: 'Fetch admin notifications' },
    { role: 'mechanic', endpoint: '/api/mechanics/notifications', expectedStatus: 200, description: 'Fetch mechanic notifications' }
  ]
};

async function runTrackedCrudCheck({ baseUrl, env, state, collection, createEndpoint, getEndpoint, updateEndpoint, deleteEndpoint, payload, updatePayload, label, description }) {
  const admin = await authenticate(baseUrl, env, 'admin');
  if (admin.unavailable) {
    return [{
      description,
      status: 'NOT AUTOMATED',
      actual: admin.unavailable,
      reason: 'A configured admin account is required to create and clean up an isolated FUNC fixture.'
    }];
  }

  const created = await apiRequest(baseUrl, createEndpoint, {
    method: 'POST',
    token: admin.token,
    body: payload(label)
  });
  if (created.status < 200 || created.status >= 300) {
    return [await recordApiCheck(created, [201], `Create isolated ${collection} fixture`) ];
  }

  const extractEntity = (body) => body?.product || body?.service || body?.data;
  const entity = extractEntity(created.body);
  const id = entity?._id || created.body?._id;
  const entityName = entity?.name || payload(label).name;
  if (!id) {
    throw new Error(`The API created a ${collection} fixture but returned no ID; cleanup cannot safely track it.`);
  }
  trackCreatedRecord(state, collection, String(id), entityName);
  await saveTrackedData(state);

  const checks = [
    await recordApiCheck(created, 201, `Create FUNC-prefixed ${collection} fixture`)
  ];
  const fetched = await apiRequest(baseUrl, getEndpoint(String(id)), { token: admin.token });
  const fetchedEntity = extractEntity(fetched.body);
  const fetchedMatches = fetched.status === 200
    && String(fetchedEntity?._id) === String(id)
    && fetchedEntity?.name === entityName;
  checks.push({
    description: `Read the created ${collection} fixture`,
    status: fetchedMatches ? 'PASS' : 'FAIL',
    actual: `HTTP ${fetched.status}: ID=${fetchedEntity?._id || 'missing'}, name=${fetchedEntity?.name || 'missing'}`,
    expected: `HTTP 200 with matching ID and FUNC name ${entityName}`
  });

  const changes = updatePayload(entity);
  const updated = await apiRequest(baseUrl, updateEndpoint(String(id)), {
    method: 'PUT',
    token: admin.token,
    body: changes
  });
  const updatedEntity = extractEntity(updated.body);
  const updateMatches = updated.status === 200
    && String(updatedEntity?._id) === String(id)
    && Number(updatedEntity?.price) === Number(changes.price);
  checks.push({
    description: `Update the created ${collection} fixture`,
    status: updateMatches ? 'PASS' : 'FAIL',
    actual: `HTTP ${updated.status}: ID=${updatedEntity?._id || 'missing'}, price=${updatedEntity?.price ?? 'missing'}`,
    expected: `HTTP 200 with the created ID and updated price ${changes.price}`
  });

  const deleted = await apiRequest(baseUrl, deleteEndpoint(String(id)), {
    method: 'DELETE',
    token: admin.token
  });
  checks.push(await recordApiCheck(deleted, 200, `Delete only the created ${collection} fixture`));
  const afterDelete = await apiRequest(baseUrl, getEndpoint(String(id)), { token: admin.token });
  checks.push(await recordApiCheck(afterDelete, 404, `Verify the created ${collection} fixture was deleted`));
  return checks;
}

const trackedCrudChecks = {
  'FT-025': (context) => {
    const label = `FUNC Product ${randomUUID()}`;
    return runTrackedCrudCheck({
      ...context,
      collection: 'products',
      createEndpoint: '/api/dashboard/inventory',
      getEndpoint: (id) => `/api/dashboard/inventory/${id}`,
      updateEndpoint: (id) => `/api/dashboard/inventory/${id}`,
      deleteEndpoint: (id) => `/api/dashboard/inventory/${id}`,
      payload: (name) => ({ name, category: 'Accessory', price: 12, quantity: 20 }),
      updatePayload: (product) => ({
        name: product.name,
        category: product.category,
        price: 13,
        quantity: 21
      }),
      label,
      description: 'Create, read, update, and delete an isolated FUNC product'
    });
  },
  'FT-026': (context) => {
    const label = `FUNC Variant Product ${randomUUID()}`;
    return runTrackedCrudCheck({
      ...context,
      collection: 'products',
      createEndpoint: '/api/dashboard/inventory',
      getEndpoint: (id) => `/api/dashboard/inventory/${id}`,
      updateEndpoint: (id) => `/api/dashboard/inventory/${id}`,
      deleteEndpoint: (id) => `/api/dashboard/inventory/${id}`,
      payload: (name) => ({
        name,
        category: 'Brakes',
        variants: [{ brand: 'FUNC', model: 'Test', price: 12, stock: 20 }]
      }),
      updatePayload: (product) => ({
        name: product.name,
        category: product.category,
        variants: product.variants.map((variant) => ({
          _id: variant._id,
          brand: variant.brand,
          model: variant.model,
          size: variant.size,
          color: variant.color,
          price: 13,
          stock: 21
        }))
      }),
      label,
      description: 'Create, read, update, and delete an isolated FUNC variant product'
    });
  },
  'FT-028': (context) => {
    const label = `FUNC Service ${randomUUID()}`;
    return runTrackedCrudCheck({
      ...context,
      collection: 'services',
      createEndpoint: '/api/admin/services',
      getEndpoint: (id) => `/api/admin/services/${id}`,
      updateEndpoint: (id) => `/api/admin/services/${id}`,
      deleteEndpoint: (id) => `/api/admin/services/${id}`,
      payload: (name) => ({
        name,
        description: 'FUNC API functional test fixture',
        category: 'General',
        price: 120,
        mechanicFee: 30,
        durationMinutes: 60
      }),
      updatePayload: (service) => ({
        name: service.name,
        description: service.description,
        category: service.category,
        price: 121,
        mechanicFee: service.mechanicFee,
        durationMinutes: service.durationMinutes
      }),
      label,
      description: 'Create, read, update, and delete an isolated FUNC service'
    });
  }
};

const notAutomatedReasons = {
  'FT-001': 'Email delivery and OTP entry require access to the mailbox and browser registration flow.',
  'FT-002': 'Weak-password, invalid-mobile, and duplicate-account UI messages are not all verified by the missing-field API probe.',
  'FT-003': 'Dashboard rendering and role-specific page navigation are browser checks; API authentication is checked where credentials are configured.',
  'FT-004': 'Repeated failures can trigger account lockout/rate limits; no protected test account or controlled reset mechanism is configured.',
  'FT-005': 'Browser back-button behavior and cross-customer record ownership require an interactive session and seeded accounts.',
  'FT-006': 'Two-factor verification needs the emailed code and a controlled account setting.',
  'FT-007': 'Image upload and password-change behavior require file fixtures and an isolated customer account.',
  'FT-008': 'Search/filter behavior and variant selection are UI interactions; only the public list endpoint is checked.',
  'FT-009': 'Cart mutation, stock boundary cases, and totals need isolated product stock fixtures.',
  'FT-010': 'Checkout and receipt submission create records and need a unique receipt fixture/reference.',
  'FT-011': 'Payment approval/rejection mutates reservations and requires isolated submitted-payment fixtures.',
  'FT-012': 'Completion, refunds, and inventory/revenue effects mutate business records.',
  'FT-013': 'Cancellation, expiry, and purchase filtering require isolated reservations and controlled deadlines.',
  'FT-014': 'Booking creation, total calculation, and slot reservation are not verified by fetching the service list.',
  'FT-015': 'Only missing required selections are probed; closed-day, past-time, and per-unit limits need configured test fixtures.',
  'FT-016': 'Capacity races and mechanic leave rules need controlled slot/mechanic fixtures and concurrent writes.',
  'FT-017': 'Quote acceptance/rejection requires mechanic/customer accounts and isolated quote requests.',
  'FT-018': 'Payment confirmation and mechanic assignment mutate booking records.',
  'FT-019': 'Ratings require a completed booking and exercise write/duplicate constraints.',
  'FT-020': 'Workload and earnings ownership require seeded jobs and database-grounded comparison.',
  'FT-021': 'Job transitions mutate booking and revenue data and require controlled mechanic/job fixtures.',
  'FT-022': 'Quote submission/decline requires an isolated mechanic request.',
  'FT-023': 'Rating aggregates require completed and rated service records.',
  'FT-024': 'Mechanic CRUD and availability changes are destructive/record-mutating and need isolated records.',
  'FT-025': 'Image upload and remaining numeric validation need fixtures; the API runner separately verifies a valid FUNC product create/read/update/delete.',
  'FT-026': 'Historic-record archival behavior is not verified; a no-history FUNC variant product is created, updated, and deleted through the API.',
  'FT-027': 'Stock changes and low-stock notifications mutate inventory.',
  'FT-028': 'Category, duplicate, and numeric validation are not fully covered; a valid FUNC service is created, updated, and deleted through the API.',
  'FT-029': 'Search/status filtering and displayed totals require comparing returned records against known expected data.',
  'FT-030': 'Settings updates affect shared application behavior and require an isolated environment.',
  'FT-031': 'Chart period rendering and manual reconciliation against source records are not verified by the API response alone.',
  'FT-032': 'Revenue arithmetic and top-service results require comparison with known completed records.',
  'FT-033': 'Creating sales/services and checking empty periods changes or depends on database contents.',
  'FT-034': 'The endpoint is checked, but inventory counts are not independently compared against a known fixture.',
  'FT-035': 'Only analytics API availability is checked; thresholds and manual calculations need a deterministic data fixture.',
  'FT-036': 'AI response consistency with dashboard figures and quality of recommendations require human review.',
  'FT-037': 'Only empty input is probed; over-limit and unavailable-provider behavior are not tested.',
  'FT-038': 'Card content quality, word counts, refresh timing, and rate-limit UX are not reliably verified by this API probe.',
  'FT-039': 'Inspecting data sent to the AI requires an authorized technical trace, not an external API response.',
  'FT-040': 'Print/PDF rendering, CSV download, and file correctness require browser/file inspection.',
  'FT-041': 'Concurrency and idempotent completion require controlled parallel writes and isolated stock fixtures.',
  'FT-042': 'Only role notification list endpoints are checked; delivery targeting, read, and clear behavior mutate data.',
  'FT-043': 'Responsive layout and mobile/desktop rendering require browser/device testing.'
};

async function loadTrackedData() {
  try {
    const state = JSON.parse(await fs.readFile(testDataPath, 'utf8'));
    if (!Array.isArray(state.records)) throw new Error('functional-testdata.json must contain a records array.');
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return { prefix: 'FUNC', records: [] };
    throw error;
  }
}

function trackCreatedRecord(state, collection, id, label) {
  if (!allowedCollections.has(collection.toLowerCase())) {
    throw new Error(`Refusing to track unsupported collection "${collection}".`);
  }
  if (typeof label !== 'string' || !label.startsWith('FUNC')) {
    throw new Error('Refusing to track test data without a FUNC-prefixed name.');
  }
  if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Refusing to track invalid ${collection} ID.`);
  }
  if (!state.records.some((record) => record.collection === collection && record.id === id)) {
    state.records.push({ collection, id, label, prefix: 'FUNC' });
  }
}

async function saveTrackedData(state) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(testDataPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function cleanup(env) {
  const state = await loadTrackedData();
  if (!state.records.length) {
    await saveTrackedData(state);
    return [{
      ID: 'CLEANUP',
      subCases: [{ description: 'Delete tracked FUNC records', status: 'PASS', actual: 'No tracked records; nothing was deleted.' }],
      actualResult: 'No tracked records; nothing was deleted.',
      status: 'PASS'
    }];
  }
  if (!env.MONGODB_URI) throw new Error('MONGODB_URI is required to clean only the recorded IDs.');

  const invalidRecords = state.records.filter((record) => (
    record.prefix !== 'FUNC'
    || !allowedCollections.has(String(record.collection).toLowerCase())
    || !mongoose.Types.ObjectId.isValid(record.id)
  ));
  if (invalidRecords.length) throw new Error('Tracked data contains an invalid prefix, collection, or ID; refusing cleanup.');

  await mongoose.connect(env.MONGODB_URI, { autoIndex: false, autoCreate: false });
  try {
    const deleted = [];
    for (const collectionName of new Set(state.records.map((record) => record.collection))) {
      const ids = state.records
        .filter((record) => record.collection === collectionName)
        .map((record) => new mongoose.Types.ObjectId(record.id));
      const result = await mongoose.connection.collection(collectionName).deleteMany({ _id: { $in: ids } });
      deleted.push({ collection: collectionName, requested: ids.length, deleted: result.deletedCount });
    }
    state.records = [];
    state.cleanedAt = new Date().toISOString();
    await saveTrackedData(state);
    return [{
      ID: 'CLEANUP',
      subCases: [{ description: 'Delete tracked FUNC records by recorded IDs only', status: 'PASS', actual: JSON.stringify(deleted) }],
      actualResult: JSON.stringify(deleted),
      status: 'PASS'
    }];
  } finally {
    await mongoose.disconnect();
  }
}

async function runStage(stage, env, cases) {
  const range = {
    '1': [1, 15],
    '2': [16, 30],
    '3': [31, 43]
  }[stage];
  const selected = cases.filter((test) => {
    const number = Number(test.ID.slice(3));
    return number >= range[0] && number <= range[1];
  });
  const baseUrl = env.FUNC_BASE_URL;
  if (!baseUrl) throw new Error('FUNC_BASE_URL is required; set it in the environment or backend/scripts/.env.');

  const resultList = [];
  const state = await loadTrackedData();
  if (state.prefix !== 'FUNC') throw new Error('functional-testdata.json has an unexpected prefix; refusing to run.');
  for (const test of selected) {
    const checks = [];
    for (const check of apiChecks[test.ID] || []) {
      checks.push(await runApiCheck({ baseUrl, env, ...check }));
    }
    if (trackedCrudChecks[test.ID]) {
      checks.push(...await trackedCrudChecks[test.ID]({ baseUrl, env, state }));
    }
    const automated = checks.length;
    const notAutomated = test.fragments.map((fragment, index) => ({
      description: fragment,
      status: 'NOT AUTOMATED',
      actual: 'No result was collected for this UI, stateful, or unsupported sub-case.',
      reason: notAutomatedReasons[test.ID] || 'This sub-case cannot be verified reliably by the available API-level checks.'
    }));
    const subCases = [...checks, ...notAutomated];
    const hasFailure = checks.some((check) => check.status === 'FAIL');
    const status = hasFailure ? 'FAIL' : (automated === 0 || notAutomated.length > 0 ? 'PARTIAL' : 'PASS');
    const passed = checks.filter((check) => check.status === 'PASS').length;
    const failed = checks.filter((check) => check.status === 'FAIL').length;
    resultList.push({
      ID: test.ID,
      description: test.description,
      subCases,
      actualResult: `${passed} API sub-case(s) passed, ${failed} failed, ${notAutomated.length} not automated.`,
      status
    });
  }
  return resultList;
}

async function main() {
  const stageArg = process.argv.find((arg) => arg.startsWith('--stage='));
  const stage = stageArg?.slice('--stage='.length);
  if (!['1', '2', '3', 'cleanup'].includes(stage)) {
    throw new Error('Usage: node scripts/functionalTest.js --stage=1|2|3|cleanup');
  }
  const env = await loadEnvironment();
  const markdown = await fs.readFile(casesPath, 'utf8');
  const cases = parseCases(markdown);
  if (cases.length !== 43) throw new Error(`Expected 43 functional cases in ${casesPath}, found ${cases.length}.`);

  const results = stage === 'cleanup'
    ? await cleanup(env)
    : await runStage(stage, env, cases);
  if (stage !== 'cleanup') {
    const state = await loadTrackedData();
    if (state.prefix !== 'FUNC') throw new Error('functional-testdata.json has an unexpected prefix; refusing to continue.');
    await saveTrackedData(state);
  }
  const document = {
    generatedAt: new Date().toISOString(),
    stage,
    prefix: 'FUNC',
    results
  };
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(resultsPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  console.log('| ID | Actual result | Status |');
  console.log('|---|---|---|');
  for (const result of results) {
    console.log(`| ${result.ID} | ${result.actualResult} | ${result.status} |`);
  }
  console.log(`\nSaved results to ${resultsPath}`);
}

main().catch(async (error) => {
  console.error(`Functional test runner stopped: ${error.message}`);
  process.exitCode = 1;
});
