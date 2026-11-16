// Interactive only. Never trace, record video, screenshot, or read an OTP value.
const L = require('./acceptance-lib.cjs');
const { fs, path, models: M, mongoose, connect, ensure } = L;
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs/acceptance/evidence/mobile-otp-20261113');
fs.mkdirSync(out, { recursive: true });
const mail = require('../backend/node_modules/dotenv').parse(fs.readFileSync(path.join(__dirname, '.acceptance-mail.env')));
const email = mail.ACCEPTANCE_TEST_MAILBOX;
const resumeExisting = process.argv.includes('--resume-existing');
const prior = resumeExisting ? JSON.parse(fs.readFileSync(path.join(out, 'otp-handoff.json'))) : null;
const username = prior?.username || 'qa_otp_' + Date.now().toString(36);
const password = 'AcceptancePass1';
const build = JSON.parse(fs.readFileSync(path.join(root, 'docs/acceptance/build-manifest.json'))).buildId;
const state = prior || { buildId: build, username, mailbox: '[user-controlled allowlisted inbox]', stage: 'starting',
  recordingPolicy: { screenshots: false, video: false, traces: false, otpReadByAutomation: false, requestBodiesLogged: false },
  registration: { emailDeliveryConfirmedByUser: false, wrongCodeRejected: false, correctCodeVerified: false, accountLoginVerified: false },
  twoFactor: { emailDeliveryConfirmedByUser: false, wrongPasswordEnableRejected: false, enabled: false, wrongCodeRejected: false, correctCodeVerified: false, wrongPasswordDisableRejected: false, disabled: false, subsequentLoginWithoutCode: false }, events: [] };
const save = () => fs.writeFileSync(path.join(out, 'otp-handoff.json'), JSON.stringify(state, null, 2));
function stage(name) { state.stage = name; state.updatedAt = new Date().toISOString(); save(); console.log(name); }
let requestedAction = '';
http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/status') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(state)); }
  if (req.method === 'POST' && req.url === '/resume') {
    let data = ''; req.on('data', chunk => { data += chunk; }); req.on('end', () => {
      try {
        const input = JSON.parse(data);
        if (Object.keys(input).some(key => key !== 'action') || !['start-two-factor','finish-two-factor','confirm-registration-email','confirm-login-email'].includes(input.action)) throw Error();
        if (input.action === 'confirm-registration-email') state.registration.emailDeliveryConfirmedByUser = true;
        else if (input.action === 'confirm-login-email') state.twoFactor.emailDeliveryConfirmedByUser = true;
        else requestedAction = input.action;
        save(); res.end('Recorded');
      } catch { res.statusCode = 400; res.end('Only workflow actions are accepted; never send a code here.'); }
    }); return;
  }
  res.statusCode = 404; res.end();
}).listen(5119, '127.0.0.1');
async function waitForAction(action) { while (requestedAction !== action) await new Promise(resolve => setTimeout(resolve, 750)); requestedAction = ''; }
async function profileState() {
  const user = await M.User.findOne({ email }).select('_id isEmailVerified twoFactorEnabled username').lean();
  return user ? { id: user._id, username: user.username, isEmailVerified: user.isEmailVerified, twoFactorEnabled: user.twoFactorEnabled === true } : null;
}
async function login(page) {
  await page.goto('http://localhost:5100/customer/login');
  await page.getByLabel('Username or email', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const pending = page.waitForResponse(r => r.url().endsWith('/api/users/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const response = await pending; ensure(response.status() === 200, 'Login did not succeed');
}
async function logout(page) {
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
}
async function toggle(page, enable) {
  await page.goto('http://localhost:5100/customer/profile');
  const label = enable ? 'Turn on' : 'Turn off';
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#two-factor-current-password').fill('WrongTestPassword1');
  const wrong = page.waitForResponse(r => r.url().endsWith('/api/users/2fa/' + (enable ? 'enable' : 'disable')));
  await dialog.getByRole('button', { name: label, exact: true }).click();
  ensure((await wrong).status() !== 200, 'Wrong password changed two-step verification');
  await dialog.getByText('Current password is incorrect.', { exact: true }).waitFor();
  state.twoFactor[enable ? 'wrongPasswordEnableRejected' : 'wrongPasswordDisableRejected'] = true;
  await dialog.locator('#two-factor-current-password').fill(password);
  const correct = page.waitForResponse(r => r.url().endsWith('/api/users/2fa/' + (enable ? 'enable' : 'disable')));
  await dialog.getByRole('button', { name: label, exact: true }).click();
  ensure((await correct).status() === 200, 'Two-step verification did not change');
  await page.getByText(enable ? 'Currently on' : 'Currently off', { exact: true }).waitFor();
  state.twoFactor[enable ? 'enabled' : 'disabled'] = true; save();
}
async function main() {
  await connect();
  if (!resumeExisting) ensure(!await M.User.exists({ email }), 'The allowlisted inbox already has an account in this isolated database; preserve it and use its existing browser login.');
  else ensure(await M.User.exists({ email, username, isEmailVerified: true }), 'The registered account has not been verified yet; leave its OTP browser open.');
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1280,950'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) { state.browserPath = new URL(frame.url()).pathname; save(); }
  });
  page.on('response', async response => {
    const route = new URL(response.url()).pathname;
    if (!['/api/users/verify-otp','/api/users/login/verify-otp'].includes(route)) return;
    // Status and a fixed server message only. Never inspect requests or input values.
    const body = await response.json().catch(() => ({}));
    const message = String(body.message || '').replace(/\b\d{6}\b/g, '[redacted]');
    state.events.push({ at: new Date().toISOString(), route, status: response.status(), message });
    const section = route === '/api/users/verify-otp' ? state.registration : state.twoFactor;
    if (response.status() === 200) section.correctCodeVerified = true;
    if (message === 'Invalid OTP.' || message === 'The login code is incorrect.') section.wrongCodeRejected = true;
    save();
  });
  if (!resumeExisting) {
  await page.goto('http://localhost:5100/customer/register');
  for (const [label,value] of [['First Name','QA'],['Last Name','OTP User'],['Email',email],['Phone Number','09179988888']]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  const pending = page.waitForResponse(r => r.url().endsWith('/api/users/register-request') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send OTP', exact: true }).click();
  const sent = await pending;
  state.registration.sendHttpStatus = sent.status();
  if (!sent.ok()) {
    const body = await sent.json().catch(() => ({}));
    state.registration.deliveryError = String(body.message || 'Email submission failed').replace(/\b\d{6}\b/g, '[redacted]');
    stage('email-provider-blocked'); return;
  }
  await page.getByRole('heading', { name: 'Verify your email', exact: true }).waitFor();
  stage('registration-otp-awaiting-user');
  await page.waitForURL('**/customer/shop', { timeout: 0 });
  } else { delete state.error; delete state.registration.deliveryError; await login(page); }
  await page.getByLabel('Search products', { exact: true }).waitFor();
  state.registration.account = await profileState();
  ensure(state.registration.account?.isEmailVerified, 'Verified account state was not saved');
  if (!state.registration.accountLoginVerified) { await logout(page); await login(page); await page.getByLabel('Search products', { exact: true }).waitFor(); }
  state.registration.accountLoginVerified = true;
  stage('registration-result-verified-awaiting-resume');
  await waitForAction('start-two-factor');
  await toggle(page, true); await logout(page); await login(page);
  await page.getByRole('heading', { name: 'Check your email', exact: true }).waitFor();
  stage('two-factor-otp-awaiting-user');
  await page.waitForURL('**/customer/shop', { timeout: 0 });
  await page.getByLabel('Search products', { exact: true }).waitFor();
  state.twoFactor.accountWhileEnabled = await profileState();
  stage('two-factor-result-verified-awaiting-resume');
  await waitForAction('finish-two-factor');
  await toggle(page, false); await logout(page); await login(page);
  await page.getByLabel('Search products', { exact: true }).waitFor();
  state.twoFactor.subsequentLoginWithoutCode = true;
  state.twoFactor.finalAccount = await profileState();
  stage('complete-browser-and-account-checks');
}
main().catch(error => { state.error = String(error.message).replace(/\b\d{6}\b/g, '[redacted]'); stage('blocked-or-browser-closed'); });
