// Distinct settings prove the browser uses saved values rather than seed defaults.
const L = require('./acceptance-lib.cjs');
const { fs, path, state, models: M, api, ensure, connect, mongoose, tokens } = L;
const { chromium } = require('playwright');
const out = path.resolve(__dirname, '../docs/acceptance/evidence/final/settings-ui');
fs.mkdirSync(out, { recursive: true });
let browser;
async function main() {
  await connect();
  const previous = await M.Settings.findOne({ key: 'reservation' }).lean();
  const result = { id: 'FT-030', subcase: 'distinct settings consumed by checkout, GCash dialog and booking slots', status: 'FAIL' };
  let reservation;
  try {
    const settings = { downPaymentPercent: 40, serviceDownPaymentPercent: 35, pendingPaymentHours: 3, holdDays: 4,
      pickupAddress: 'QA Changed Pickup Address', pickupHours: '10:00-13:00 QA pickup', contactNumber: '09175555555',
      paymentInstructions: { methodName: 'GCash', accountName: 'QA Changed Receiver', accountNumber: '09175555555' } };
    ensure((await api('/api/admin/reservations/settings', 'admin', settings, 'PUT')).status === 200, 'Settings save failed');
    const gcash = { gcashAccountName: 'QA Changed Receiver', gcashAccountNumber: '09175555555', paymentInstructions: 'QA changed instructions. Do not transfer money.' };
    ensure((await api('/api/admin/payment-settings', 'admin', gcash, 'PUT')).status === 200, 'GCash save failed');
    const schedule = { openDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], openTime: '10:00', closeTime: '13:00', slotCapacity: 2, maxDaysAhead: 30 };
    ensure((await api('/api/admin/reservations/booking-schedule', 'admin', schedule, 'PUT')).status === 200, 'Schedule save failed');
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(t => localStorage.setItem('customerToken', t), tokens.customer5);
    await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await context.newPage();
    await page.goto('http://localhost:5100/customer/shop');
    await page.getByLabel('Search products', { exact: true }).fill('QA Brake Pad');
    await page.getByRole('link', { name: /^QA Brake Pad,/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add to cart', exact: true }).click();
    await page.getByRole('button', { name: 'Close product details' }).click();
    await page.goto('http://localhost:5100/customer/cart');
    await page.getByRole('button', { name: 'Check out products', exact: true }).click();
    await page.getByText('Down payment (40%): due now', { exact: true }).waitFor();
    await page.getByText(/Pickup at QA Changed Pickup Address.*10:00-13:00 QA pickup/).waitFor();
    const review = await page.locator('.customer-reservation-payment-instructions').innerText();
    ensure(review.includes('400.00') && review.includes('600.00'), 'Changed percentage not shown');
    await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('QA Changed Receiver', { exact: true }).waitFor();
    await dialog.getByText('09175555555', { exact: true }).waitFor();
    await dialog.getByText(gcash.paymentInstructions, { exact: true }).waitFor();
    const payment = await dialog.innerText();
    reservation = await M.Reservation.findOne({ customerId: state.customers[4] }).sort({ createdAt: -1 }).lean();
    ensure(reservation.downPaymentAmount === 400 && reservation.downPaymentPercent === 40 && reservation.stockHeld, 'New reservation snapshot mismatch');
    const deadlineHours = (new Date(reservation.paymentDueAt) - new Date(reservation.createdAt)) / 3600000;
    ensure(Math.abs(deadlineHours - 3) < .01, 'Changed payment deadline not used');
    await page.screenshot({ path: path.join(out, 'changed-payment.png'), fullPage: true });
    await page.goto('http://localhost:5100/customer/services/' + state.services[0]);
    await page.getByLabel('Booking date', { exact: true }).fill(L.futureDate(20));
    await page.waitForFunction(() => { const select = document.querySelector('#service-booking-time'); return select && !select.disabled && [...select.options].some(o => o.value === '10:00' && !o.disabled); });
    const slots = await page.getByLabel('Booking time', { exact: true }).locator('option').evaluateAll(options => options.filter(o => o.value && !o.disabled).map(o => o.value));
    ensure(slots.length && slots.every(t => t >= '10:00' && t < '13:00') && !slots.includes('09:00'), 'Saved schedule not used');
    await page.screenshot({ path: path.join(out, 'changed-slots.png'), fullPage: true });
    await context.tracing.stop({ path: path.join(out, 'settings-ui.zip') });
    result.status = 'PASS';
    result.actual = { review, payment, schedule, slots, reservation: { id: reservation._id, code: reservation.code, downPaymentPercent: reservation.downPaymentPercent, downPaymentAmount: reservation.downPaymentAmount, deadlineHours }, restored: true };
  } catch (e) { result.actual = e.stack; }
  finally {
    if (reservation) await api('/api/reservations/' + reservation._id + '/cancel', 'customer5', { reason: 'QA settings verification complete' });
    await M.Settings.replaceOne({ _id: previous._id }, previous);
    await browser?.close();
    await mongoose.disconnect();
    fs.writeFileSync(path.join(out, 'settings-ui.json'), JSON.stringify([result], null, 2));
  }
  console.log(result.id, result.status);
}
main().catch(e => { console.error(e); process.exit(1); });
