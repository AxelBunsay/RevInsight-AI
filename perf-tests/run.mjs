import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const resultsPath = path.join(scriptDir, 'output', 'results.json');

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

async function loadConfiguration() {
  let fileValues = {};
  try {
    fileValues = parseEnvFile(await readFile(path.join(scriptDir, '.env'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const env = { ...fileValues, ...process.env };
  const required = [
    'PERF_BASE_URL',
    'PERF_CUSTOMER_EMAIL',
    'PERF_CUSTOMER_PASSWORD',
    'PERF_ADMIN_USERNAME',
    'PERF_ADMIN_PASSWORD',
    'PERF_MECHANIC_USERNAME',
    'PERF_MECHANIC_PASSWORD'
  ];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) {
    throw new Error(
      `Missing performance configuration: ${missing.join(', ')}. `
      + `Set these variables in the environment or ${path.join(scriptDir, '.env')}.`
    );
  }
  return env;
}

function urlFor(baseUrl, pathname) {
  return new URL(pathname.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`);
}

async function request(baseUrl, pathname, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const startedAt = performance.now();
  const response = await fetch(urlFor(baseUrl, pathname), {
    method,
    headers,
    signal: AbortSignal.timeout(70000),
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  const elapsedMs = performance.now() - startedAt;
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${method} ${pathname}: ${text.slice(0, 300)}`);
  }
  return { statusCode: response.status, elapsedMs, data };
}

function tokenFrom(result) {
  const token = result.data?.token || result.data?.data?.token;
  if (!result.statusCode || result.statusCode < 200 || result.statusCode >= 300 || !token) {
    throw new Error(`Login failed with HTTP ${result.statusCode}.`);
  }
  return token;
}

async function login(baseUrl, role, env) {
  const configurations = {
    customer: {
      path: '/api/users/login',
      body: { email: env.PERF_CUSTOMER_EMAIL, password: env.PERF_CUSTOMER_PASSWORD }
    },
    admin: {
      path: '/api/admin/login',
      body: { username: env.PERF_ADMIN_USERNAME, password: env.PERF_ADMIN_PASSWORD }
    },
    mechanic: {
      path: '/api/mechanics/login',
      body: { username: env.PERF_MECHANIC_USERNAME, password: env.PERF_MECHANIC_PASSWORD }
    }
  };
  const config = configurations[role];
  const result = await request(baseUrl, config.path, { method: 'POST', body: config.body });
  return { token: tokenFrom(result), elapsedMs: result.elapsedMs };
}

const thresholds = {
  'PT-001': 3000,
  'PT-002': 3000,
  'PT-003': 3000,
  'PT-004': 3000,
  'PT-005': 3000,
  'PT-006': 5000,
  'PT-007': 10000,
  'PT-008': 3000,
  'PT-009': 5000,
  'PT-010': 3000,
  'PT-011': 5000,
  'PT-012': 5000,
  'PT-013': 3000,
  'PT-014': 5000,
  'PT-015': 5000,
  'PT-016': 60000,
  'PT-017': 60000,
  'PT-018': 60000,
  'PT-019': 3000,
  'PT-020': 5000,
  'PT-021': 5000,
  'PT-022': 5000
};

const testPlans = [
  { ID: 'PT-001', title: 'Customer login API', roles: ['customer'], run: async ({ baseUrl, env }) => [{ elapsedMs: (await login(baseUrl, 'customer', env)).elapsedMs, limitMs: 3000 }] },
  { ID: 'PT-002', title: 'Admin and mechanic login APIs', roles: ['admin', 'mechanic'], run: async ({ baseUrl, env }) => Promise.all(['admin', 'mechanic'].map(async (role) => ({ elapsedMs: (await login(baseUrl, role, env)).elapsedMs, limitMs: 3000 }))) },
  { ID: 'PT-003', title: 'Single login API request (repeated logout flow not exercised)', roles: ['customer'], run: async ({ baseUrl, env }) => [{ elapsedMs: (await login(baseUrl, 'customer', env)).elapsedMs, limitMs: 3000 }] },
  {
    ID: 'PT-004',
    title: 'Protected page data requests',
    roles: ['customer', 'admin', 'mechanic'],
    run: async ({ baseUrl, tokens }) => {
      const endpoints = [
        ['/api/products', tokens.customer],
        ['/api/services', tokens.customer],
        ['/api/cart', tokens.customer],
        ['/api/users/purchase-history', tokens.customer],
        ['/api/dashboard/dashboard', tokens.admin],
        ['/api/dashboard/transactions', tokens.admin],
        ['/api/dashboard/inventory', tokens.admin],
        ['/api/mechanics/all', tokens.admin],
        ['/api/service-requests/mechanic', tokens.mechanic]
      ];
      return Promise.all(endpoints.map(async ([endpoint, token]) => ({ elapsedMs: (await request(baseUrl, endpoint, { token })).elapsedMs, limitMs: 3000 })));
    }
  },
  { ID: 'PT-005', title: 'Shop product list API (search/filter not exercised)', roles: ['customer'], run: async ({ baseUrl }) => [{ elapsedMs: (await request(baseUrl, '/api/products')).elapsedMs, limitMs: 3000 }] },
  { ID: 'PT-006', title: 'Cart API proxy (checkout not exercised)', roles: ['customer'], run: async ({ baseUrl, tokens }) => [{ elapsedMs: (await request(baseUrl, '/api/cart', { token: tokens.customer })).elapsedMs, limitMs: 5000 }] },
  { ID: 'PT-007', title: 'Receipt list API proxy (upload not exercised)', roles: ['customer'], run: async ({ baseUrl, tokens }) => [{ elapsedMs: (await request(baseUrl, '/api/users/receipts', { token: tokens.customer })).elapsedMs, limitMs: 10000 }] },
  { ID: 'PT-008', title: 'Admin reservation list API proxy (review not exercised)', roles: ['admin'], run: async ({ baseUrl, tokens }) => [{ elapsedMs: (await request(baseUrl, '/api/admin/reservations', { token: tokens.admin })).elapsedMs, limitMs: 3000 }] },
  {
    ID: 'PT-009',
    title: 'Booking time slots and submission',
    roles: ['customer'],
    run: async ({ baseUrl, tokens }) => {
      const result = await request(baseUrl, '/api/services');
      const services = Array.isArray(result.data) ? result.data : result.data?.data;
      if (!Array.isArray(services) || !services[0]?._id) {
        throw new Error('No service ID was returned; cannot request a booking slot.');
      }
      const date = new Date().toISOString().slice(0, 10);
      return [{ elapsedMs: (await request(baseUrl, `/api/services/${services[0]._id}/slots?date=${date}`, { token: tokens.customer })).elapsedMs, limitMs: 3000 }];
    }
  },
  { ID: 'PT-010', title: 'Mechanic jobs API proxy (state transitions not exercised)', roles: ['mechanic'], run: async ({ baseUrl, tokens }) => [{ elapsedMs: (await request(baseUrl, '/api/service-requests/mechanic', { token: tokens.mechanic })).elapsedMs, limitMs: 3000 }] },
  { ID: 'PT-011', title: 'Inventory list API (create/edit not exercised)', roles: ['admin'], run: async ({ baseUrl, tokens }) => [{ elapsedMs: (await request(baseUrl, '/api/dashboard/inventory', { token: tokens.admin })).elapsedMs, limitMs: 3000 }] },
  {
    ID: 'PT-012',
    title: 'Initial dashboard data',
    roles: ['admin'],
    run: async ({ baseUrl, tokens }) => Promise.all([
      '/api/dashboard/dashboard',
      '/api/admin/dashboard/service-revenue',
      '/api/dashboard/inventory'
    ].map(async (endpoint) => ({ elapsedMs: (await request(baseUrl, endpoint, { token: tokens.admin })).elapsedMs, limitMs: 5000 })))
  },
  {
    ID: 'PT-013',
    title: 'Sales chart period data',
    roles: ['admin'],
    run: async ({ baseUrl, tokens }) => Promise.all([
      '/api/dashboard/dashboard/daily',
      '/api/dashboard/dashboard/revenue',
      '/api/dashboard/dashboard/quarterly'
    ].map(async (endpoint) => ({ elapsedMs: (await request(baseUrl, endpoint, { token: tokens.admin })).elapsedMs, limitMs: 3000 })))
  },
  {
    ID: 'PT-014',
    title: 'Revenue analysis data',
    roles: ['admin'],
    run: async ({ baseUrl, tokens }) => Promise.all([
      '/api/dashboard/analytics/revenue-risk',
      '/api/dashboard/analytics/revenue-concentration',
      '/api/dashboard/analytics/projected-revenue'
    ].map(async (endpoint) => ({ elapsedMs: (await request(baseUrl, endpoint, { token: tokens.admin })).elapsedMs, limitMs: 5000 })))
  },
  { ID: 'PT-015', title: 'Dashboard refresh API proxy (no new record created)', roles: ['admin'], run: async ({ baseUrl, tokens }) => [{ elapsedMs: (await request(baseUrl, '/api/dashboard/dashboard', { token: tokens.admin })).elapsedMs, limitMs: 5000 }] },
  { ID: 'PT-016', title: 'Ask AI API response', roles: ['admin'], run: async ({ baseUrl, tokens }) => [{ elapsedMs: (await request(baseUrl, '/api/admin/revenue/ask-ai', { method: 'POST', token: tokens.admin, body: { question: 'Summarize the current revenue trends and suggest one action.' } })).elapsedMs, limitMs: 60000 }] },
  { ID: 'PT-017', title: 'Three Ask AI API requests', roles: ['admin'], run: async ({ baseUrl, tokens }) => Promise.all([1, 2, 3].map(async (index) => ({ elapsedMs: (await request(baseUrl, '/api/admin/revenue/ask-ai', { method: 'POST', token: tokens.admin, body: { question: `Summarize revenue trend ${index} and suggest an action.` } })).elapsedMs, limitMs: 60000 }))) },
  { ID: 'PT-018', title: 'AI card insights API request', roles: ['admin'], run: async ({ baseUrl, tokens }) => [{ elapsedMs: (await request(baseUrl, '/api/admin/ai/card-insights', { method: 'POST', token: tokens.admin, body: {} })).elapsedMs, limitMs: 60000 }] },
  { ID: 'PT-019', title: 'Card insights API proxy (saved-cache retrieval not exposed)', roles: ['admin'], run: async ({ baseUrl, tokens }) => [{ elapsedMs: (await request(baseUrl, '/api/dashboard/analytics/revenue-risk', { token: tokens.admin })).elapsedMs, limitMs: 3000 }] },
  {
    ID: 'PT-020',
    title: 'Report data requests',
    roles: ['admin'],
    run: async ({ baseUrl, tokens }) => Promise.all([
      '/api/dashboard/reports/sales',
      '/api/dashboard/transactions'
    ].map(async (endpoint) => ({ elapsedMs: (await request(baseUrl, endpoint, { token: tokens.admin })).elapsedMs, limitMs: 5000 })))
  },
  {
    ID: 'PT-021',
    title: 'Five concurrent read-only API requests across configured roles',
    roles: ['customer', 'admin', 'mechanic'],
    run: async ({ baseUrl, tokens }) => {
      const jobs = [
        ['/api/products', tokens.customer],
        ['/api/services', tokens.customer],
        ['/api/dashboard/dashboard', tokens.admin],
        ['/api/dashboard/transactions', tokens.admin],
        ['/api/service-requests/mechanic', tokens.mechanic]
      ];
      return Promise.all(jobs.map(async ([endpoint, token]) => ({ elapsedMs: (await request(baseUrl, endpoint, { token })).elapsedMs, limitMs: 5000 })));
    }
  }
];

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function expectedText(id) {
  if (id === 'PT-022') return 'Within 5 seconds; manual 30-minute mobile sustained-use test';
  if (id === 'PT-009') return 'Slots within 3 seconds; booking confirmation within 5 seconds';
  if (id === 'PT-011') return 'Inventory list within 3 seconds; create within 5 seconds; edit within 3 seconds';
  if (id === 'PT-013') return 'Updated chart within 3 seconds';
  if (id === 'PT-020') return 'Report and CSV each within 5 seconds';
  if (id === 'PT-021') return 'All actions succeed within 5 seconds for five concurrent users';
  const seconds = thresholds[id] / 1000;
  return `Within ${seconds} seconds for each questionnaire action (API-only proxy may cover fewer steps)`;
}

async function main() {
  const env = await loadConfiguration();
  const baseUrl = env.PERF_BASE_URL;
  const roles = [...new Set(testPlans.flatMap((plan) => plan.roles))];
  const tokens = {};
  const authResults = {};

  for (const role of roles) {
    try {
      const result = await login(baseUrl, role, env);
      tokens[role] = result.token;
      authResults[role] = result.elapsedMs;
    } catch (error) {
      throw new Error(`Could not authenticate the configured ${role} account: ${error.message}`);
    }
  }

  const results = [];
  for (const plan of testPlans) {
    const runs = [];
    for (let trial = 1; trial <= 3; trial += 1) {
      if (plan.ID === 'PT-018' && trial > 1) await delay(30000);
      try {
        const measures = await plan.run({ baseUrl, env, tokens });
        const elapsedMs = measures.length ? Math.max(...measures.map((item) => item.elapsedMs)) : NaN;
        const allWithinLimit = measures.every((item) => (
          Number.isFinite(item.elapsedMs) && item.elapsedMs <= item.limitMs
        ));
        runs.push({
          trial,
          responseTimesMs: measures.map((item) => ({
            ms: Number(item.elapsedMs.toFixed(2)),
            thresholdMs: item.limitMs
          })),
          elapsedMs: Number(elapsedMs.toFixed(2)),
          requestsSucceeded: allWithinLimit
        });
      } catch (error) {
        runs.push({ trial, responseTimesMs: [], elapsedMs: null, requestsSucceeded: false, error: error.message });
      }
    }
    const validRuns = runs.filter((run) => Number.isFinite(run.elapsedMs));
    const average = validRuns.length
      ? Number((validRuns.reduce((sum, run) => sum + run.elapsedMs, 0) / validRuns.length).toFixed(2))
      : null;
    const passed = runs.length === 3 && runs.every((run) => run.requestsSucceeded);
    results.push({
      ID: plan.ID,
      test: plan.title,
      measurement: 'HTTP API response time only; does not include browser rendering or full user-workflow verification',
      runs,
      average,
      expected: expectedText(plan.ID),
      status: passed ? 'PASS' : 'FAIL'
    });
  }

  results.push({
    ID: 'PT-022',
    test: 'Mobile device and sustained use',
    measurement: 'Manual mobile-browser test',
    runs: [],
    average: null,
    expected: expectedText('PT-022'),
    status: 'NOT MEASURED - manual test'
  });

  await mkdir(path.dirname(resultsPath), { recursive: true });
  await writeFile(resultsPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl,
    measurementScope: 'API-only proxy timings; not equivalent to questionnaire browser-visible usability timings',
    authenticationMs: authResults,
    results
  }, null, 2)}\n`, 'utf8');

  console.log('| ID | Test | Average (ms) | Expected | Status |');
  console.log('|---|---|---:|---|---|');
  for (const result of results) {
    console.log(`| ${result.ID} | ${result.test} | ${result.average ?? 'N/A'} | ${result.expected} | ${result.status} |`);
  }
  console.log(`\nSaved results to ${resultsPath}`);
}

main().catch((error) => {
  console.error(`Performance test runner stopped: ${error.message}`);
  process.exitCode = 1;
});
