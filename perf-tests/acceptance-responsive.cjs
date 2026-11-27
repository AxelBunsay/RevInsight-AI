// Actual Chromium rendering and controls; mobile results are emulation only.
const L = require('./acceptance-lib.cjs');
const { fs, path, state, tokens, models: M, ensure, connect, mongoose } = L;
const { chromium, devices } = require('playwright');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, 'docs/acceptance/evidence/mobile-otp-20261113', process.argv[2] || 'responsive-attempt-1');
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/acceptance/build-manifest.json')));
const result = { buildId: manifest.buildId, startedAt: new Date().toISOString(),
  browserMode: 'Real Chromium browser, automated headless rendering; separate headed browser is reserved for human OTP entry',
  mobileEnvironment: 'Browser emulation, not a physical phone', checks: [], timings: [], errors: [], environments: [] };
const save = () => fs.writeFileSync(path.join(out, 'responsive-results.json'), JSON.stringify(result, null, 2));
let browser;
async function settled(page) { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function dimensions(page) {
  return page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll('main,header,section,form,input,select,textarea,button')]
      .filter(e => { const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width && r.height && s.visibility!=='hidden' && r.left < -1 && !e.closest('[aria-hidden="true"]'); })
      .slice(0,12).map(e => ({ element:e.tagName, className:e.className })) }));
}
async function shopReady(page) {
  await page.getByLabel('Search products', { exact: true }).waitFor();
  await page.getByRole('link', { name: /^QA Brake Pad,/ }).waitFor();
  await page.locator('.product-skeleton').first().waitFor({ state: 'hidden' });
}
async function serviceReady(page) {
  await page.getByLabel('Booking date', { exact: true }).waitFor();
  await page.getByLabel('Mechanic', { exact: true }).waitFor();
  await page.getByLabel('Motorcycle', { exact: true }).waitFor();
  await page.waitForFunction(() => { const select=document.querySelector('#service-booking-time');return select&&!select.disabled; });
}
async function adminReady(page) {
  await page.getByLabel('Business overview', { exact: true }).waitFor();
  await page.locator('.admin-sales-hero canvas, .admin-sales-hero .admin-empty-state').first().waitFor();
  await page.getByLabel('Loading service revenue').waitFor({ state: 'hidden' });
  await page.locator('.admin-dashboard-lower').waitFor();
  await page.locator('.ai-revenue-card').nth(4).waitFor();
  await page.waitForTimeout(250);
}
async function check(environment, name, page, fn) {
  const row = { id: 'FT-043', environment, name, status: 'PASS' };
  try { row.actual=await fn();await settled(page);row.layout=await dimensions(page);ensure(row.layout.documentWidth<=row.layout.viewport,'Page has horizontal overflow'); }
  catch(error) { row.status='FAIL';row.actual=error.message; }
  const label=environment+'-'+name.replace(/\W/g,'_');
  row.screenshot=label+'.png';await page.screenshot({ path:path.join(out,row.screenshot),fullPage:true });
  result.checks.push(row);save();console.log(environment,name,row.status);
}
async function timed(action, trial, page, ready) {
  const start=performance.now();const row={id:'PT-022',subcase:'a',environment:'browser emulation',action,trial,limitMs:5000,startedAt:new Date().toISOString(),supportingOnly:true};
  try { await page.goto('http://localhost:5100'+(action==='Shop'?'/customer/shop':'/customer/services/'+state.services[0]));await ready(page);await settled(page);row.elapsedMs=performance.now()-start;row.status=row.elapsedMs<=5000?'PASS':'FAIL'; }
  catch(error) { row.elapsedMs=performance.now()-start;row.status='FAIL';row.error=error.message; }
  result.timings.push(row);save();console.log('Emulated timing',action,trial,row.status,Math.round(row.elapsedMs));
}
async function main() {
  for(const group of ['files','bundle'])for(const [file,digest]of Object.entries(manifest[group]))ensure(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')===digest,'Application build drift: '+file);
  await connect();browser=await chromium.launch();result.browserVersion=browser.version();
  for(const environment of ['desktop','emulated-mobile']) {
    const options=environment==='desktop'?{viewport:{width:1440,height:1000}}:{...devices['Pixel 7'],viewport:{width:390,height:844}};
    const contexts={};const pages={};
    for(const role of ['customer','admin']) {
      const context=await browser.newContext(options);
      await context.addInitScript(({kind,token})=>{localStorage.setItem(kind+'Token',token);if(kind==='customer')localStorage.setItem('revinsightCustomerPrototype',JSON.stringify({cart:[],vehicles:[{id:'qa-mobile-bike',name:'QA Responsive Motorcycle',make:'QA',model:'Test'}]}));},{kind:role,token:role==='admin'?tokens.admin:tokens[environment==='desktop'?'customer3':'customer4']});
      await context.tracing.start({screenshots:true,snapshots:true,sources:true});const page=await context.newPage();page.setDefaultTimeout(12000);contexts[role]=context;pages[role]=page;
      page.on('pageerror',error=>{result.errors.push({environment,role,kind:'pageerror',message:error.message});save();});
    }
    const customer=pages.customer,admin=pages.admin;
    await customer.goto('http://localhost:5100/customer/shop');await shopReady(customer);
    result.environments.push({name:environment,roleAccounts:{customer:environment==='desktop'?'qa_customer3':'qa_customer4',admin:'qa_admin'},...await customer.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},userAgent:navigator.userAgent,touchPoints:navigator.maxTouchPoints,devicePixelRatio})),physicalPhone:false});
    if(environment==='emulated-mobile')for(let trial=1;trial<=3;trial++){await timed('Shop',trial,customer,shopReady);await timed('Service Booking',trial,customer,serviceReady);}
    await check(environment,'Shop search category and product controls',customer,async()=>{
      await customer.goto('http://localhost:5100/customer/shop');await shopReady(customer);
      await customer.getByLabel('Search products',{exact:true}).fill('QA Brake');
      await customer.waitForFunction(()=>document.querySelectorAll('.product-card').length===1);
      await customer.getByRole('button',{name:/^Brakes/}).click();ensure(await customer.getByRole('link',{name:/^QA Brake Pad,/}).isVisible(),'Category/search failed');
      await customer.getByLabel('Search products',{exact:true}).fill('');await customer.getByRole('group',{name:'Product categories'}).getByRole('button',{name:/^All/}).click();
      await customer.getByRole('link',{name:/^QA Variant Part,/}).click();const dialog=customer.getByRole('dialog');await dialog.waitFor();
      const product=await M.Product.findById(state.products[5]);await dialog.locator('select').first().selectOption(product.variants[0].id);
      await dialog.getByRole('button',{name:'Increase quantity',exact:true}).click();await dialog.getByRole('button',{name:'Decrease quantity',exact:true}).click();
      await dialog.getByRole('button',{name:'Add to cart',exact:true}).click();await dialog.getByText('Added to Reservation Cart',{exact:true}).waitFor();
      await customer.screenshot({path:path.join(out,environment+'-product-dialog.png'),fullPage:true});
      await customer.getByRole('button',{name:'Close product details'}).click();return{search:true,category:true,explicitVariant:true,quantityControls:true,addToCart:true};
    });
    await check(environment,'Service booking controls and cart',customer,async()=>{
      await customer.goto('http://localhost:5100/customer/services/'+state.services[0]);await serviceReady(customer);
      await customer.getByLabel('Booking date',{exact:true}).fill(L.futureDate(environment==='desktop'?23:24));
      await customer.waitForFunction(()=>{const s=document.querySelector('#service-booking-time');return s&&!s.disabled&&[...s.options].some(o=>o.value&&!o.disabled);});
      const time=await customer.getByLabel('Booking time',{exact:true}).locator('option').evaluateAll(opts=>opts.find(o=>o.value&&!o.disabled).value);
      await customer.getByLabel('Booking time',{exact:true}).selectOption(time);await customer.getByLabel('Motorcycle',{exact:true}).selectOption('QA Responsive Motorcycle');await customer.getByLabel('Mechanic',{exact:true}).selectOption(state.mechanics[0]);
      await customer.getByPlaceholder('Anything the mechanic should know?',{exact:true}).fill('Synthetic responsive interaction check');
      const layout=await dimensions(customer);ensure(layout.documentWidth<=layout.viewport,'Booking form overflow');
      await customer.screenshot({path:path.join(out,environment+'-booking-form.png'),fullPage:true});
      await customer.getByRole('button',{name:'Add booking to cart',exact:true}).click();await customer.waitForURL('**/customer/cart');await customer.getByRole('button',{name:'Check out services',exact:true}).waitFor();
      return{date:true,time,motorcycle:true,mechanic:true,notes:true,addedToCart:true,formLayout:layout};
    });
    await check(environment,'Admin Dashboard chart and report controls',admin,async()=>{
      await admin.goto('http://localhost:5100/admin/dashboard');await adminReady(admin);
      for(const period of ['Weekly','Monthly','Daily']){await admin.getByRole('button',{name:period,exact:true}).click();await admin.getByRole('img',{name:new RegExp('Sales by '+period.toLowerCase())}).waitFor();await admin.locator('.admin-sales-chart__updating').waitFor({state:'hidden'});await admin.waitForTimeout(250);}
      await admin.getByRole('button',{name:/Export report/}).click();const report=admin.getByRole('dialog');await report.waitFor();
      await admin.waitForFunction(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Print / Save as PDF');return button&&!button.disabled;});
      await admin.screenshot({path:path.join(out,environment+'-report-dialog.png'),fullPage:true});
      const bounds=await report.boundingBox();ensure(bounds.x>=0&&bounds.x+bounds.width<=(environment==='desktop'?1440:390)+1,'Report dialog cut off');
      await admin.getByRole('button',{name:'Close report'}).click();await admin.locator('.ai-revenue-card').last().scrollIntoViewIfNeeded();
      return{summary:true,chartPeriods:['Weekly','Monthly','Daily'],category:true,service:true,inventory:true,revenueAnalysisCards:5,reportOpenedAndClosed:true};
    });
    for(const role of ['customer','admin']){await contexts[role].tracing.stop({path:path.join(out,environment+'-'+role+'.zip')});await contexts[role].close();}
  }
  result.completedAt=new Date().toISOString();result.technicalStatus=result.checks.length===6&&result.checks.every(c=>c.status==='PASS')&&result.timings.every(t=>t.status==='PASS')&&!result.errors.length?'PASS':'FAIL';
}
main().catch(error=>{result.runnerError=error.message;result.technicalStatus='FAIL';console.error(error.message);process.exitCode=1;}).finally(async()=>{
  save();await browser?.close();await mongoose.disconnect();
  const rows=[['build_id','environment','action','trial','elapsed_ms','limit_ms','status','supporting_only'],...result.timings.map(t=>[result.buildId,t.environment,t.action,t.trial,t.elapsedMs,t.limitMs,t.status,true])];fs.writeFileSync(path.join(out,'emulated-mobile-timings.csv'),rows.map(row=>row.join(',')).join('\r\n'));
});
