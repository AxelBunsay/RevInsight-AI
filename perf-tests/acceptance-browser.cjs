const L=require('./acceptance-lib.cjs');const {fs,path,state,models:M,tokens,api,ensure,connect,mongoose}=L;
const {chromium}=require('playwright');const out=path.resolve(__dirname,'../docs/acceptance/evidence',process.argv[2]||'final');fs.mkdirSync(out,{recursive:true});
const trials=[],checks=[],errors=[];let browser;const pages={};
function save(){fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({trials,checks,errors},null,2));}
async function settled(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function timed(id,action,trial,limitMs,page,fn){const start=performance.now();try{const actual=await fn();await settled(page);const elapsedMs=performance.now()-start;trials.push({id,action,trial,limitMs,elapsedMs,status:elapsedMs<=limitMs?'PASS':'FAIL',actual});}catch(e){trials.push({id,action,trial,limitMs,elapsedMs:performance.now()-start,status:'FAIL',actual:e.message});await page.screenshot({path:path.join(out,`${id}-${action.replace(/[^a-z0-9]/gi,'_')}-${trial}-failure.png`),fullPage:true}).catch(()=>{});}save();console.log(id,action,trial,trials.at(-1).status,Math.round(trials.at(-1).elapsedMs));}
const pagePlans={
 '/customer/shop':async p=>{await p.getByLabel('Search products',{exact:true}).waitFor();await p.locator('.product-card:not(.product-skeleton)').first().waitFor();},
 '/customer/services':async p=>{await p.getByText('QA Tune Up',{exact:true}).first().waitFor();},
 '/customer/cart':async p=>{await p.locator('h1').filter({hasText:'Cart'}).waitFor();await p.locator('.customer-empty-cart, .customer-cart-layout').first().waitFor();},
 '/my-purchases':async p=>{await p.locator('h1').filter({hasText:/My purchases/i}).waitFor();await p.getByText('Loading purchases and bookings...',{exact:true}).waitFor({state:'hidden'});},
 '/admin/dashboard':async p=>{await p.getByLabel('Business overview',{exact:true}).waitFor();await p.locator('.admin-sales-hero canvas, .admin-sales-hero .admin-empty-state').first().waitFor();await p.getByLabel('Loading service revenue').waitFor({state:'hidden'});await p.locator('.admin-dashboard-lower').waitFor();await p.waitForTimeout(250);},
 '/admin/transactions':async p=>{await p.getByRole('tab',{name:/^All/}).waitFor();await p.locator('.transactions-table-scroll').waitFor();await p.locator('.transactions-table tbody tr:not(.transactions-skeleton-row)').first().waitFor();},
 '/admin/inventory':async p=>{await p.getByPlaceholder('Search items...').waitFor();await p.locator('.inventory-table tbody tr').filter({has:p.getByRole('button',{name:'Edit',exact:true})}).first().waitFor();},
 '/admin/mechanics':async p=>{await p.getByText('Test Mechanic1',{exact:true}).first().waitFor();},
 '/mechanic/jobs':async p=>{await p.locator('.jobs-panel').first().waitFor();await p.locator('.mechanic-job-table tbody tr').first().waitFor();},
};
async function go(page,url){await page.goto('http://localhost:5100'+url);await pagePlans[url](page);}
async function main(){await connect();browser=await chromium.launch();
 for(const role of ['customer1','admin','mechanic1']){
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await context.tracing.start({screenshots:true,snapshots:true,sources:true});const p=await context.newPage();p.setDefaultTimeout(10000);pages[role]=p;p.on('pageerror',e=>{errors.push({role,message:e.message,url:p.url()});save()});
  const kind=role.replace(/1$/,'');
  if(process.env.QA_PHASE==='workflows')await context.addInitScript(({kind,token})=>localStorage.setItem(kind+'Token',token),{kind,token:tokens[role]});
  for(let trial=1;trial<=(process.env.QA_PHASE==='workflows'?0:3);trial++){
   await p.goto('http://localhost:5100/'+kind+'/login');await p.getByLabel(kind==='customer'?'Username or email':'Username',{exact:true}).fill(role==='admin'?'qa_admin':'qa_'+role.replace('1',kind==='customer'?'1':'1'));
   // Fixture logins are qa_customer1 / qa_mechanic1.
   await p.getByLabel('Password',{exact:true}).fill('AcceptancePass1');
   await timed(kind==='customer'?'PT-001':'PT-002',kind+' login',trial,3000,p,async()=>{const response=p.waitForResponse(r=>r.url().endsWith('/api/'+(kind==='customer'?'users':kind==='admin'?'admin':'mechanics')+'/login'));await p.locator('button[type=submit]').click();const r=await response;ensure(r.status()===200,'Login HTTP '+r.status());await p.waitForURL(u=>kind==='admin'?u.pathname==='/admin':u.pathname==='/'+kind+'/'+(kind==='customer'?'shop':'dashboard'));if(kind==='customer')await pagePlans['/customer/shop'](p);else if(kind==='admin')await pagePlans['/admin/dashboard'](p);else {await p.getByRole('heading',{name:/dashboard/i}).first().waitFor();await p.locator('.availability-panel p').filter({hasText:/^Specialization: general /}).waitFor();}return{httpStatus:r.status()};});
   if(trial<3){await p.evaluate(()=>{localStorage.clear();sessionStorage.clear()});}
  }
 }
 for(let t=1;t<=(process.env.QA_PHASE==='workflows'?0:3);t++)for(const [url,ready]of Object.entries(pagePlans)){const role=url.startsWith('/admin')?'admin':url.startsWith('/mechanic')?'mechanic1':'customer1';await timed('PT-004',url,t,3000,pages[role],()=>go(pages[role],url));}
 const customer=pages.customer1,admin=pages.admin,mechanic=pages.mechanic1;
 if(process.env.QA_PHASE!=='workflows'){
 for(let t=1;t<=3;t++){
  await timed('PT-005','shop opening',t,3000,customer,()=>go(customer,'/customer/shop'));
  await timed('PT-005','product search',t,3000,customer,async()=>{await customer.getByLabel('Search products',{exact:true}).fill('QA Brake');await customer.waitForFunction(()=>document.querySelectorAll('.product-card').length===1&&document.querySelector('.product-card').textContent.includes('QA Brake Pad'));});
  await customer.getByLabel('Search products',{exact:true}).fill('');
  await timed('PT-005','category filter',t,3000,customer,async()=>{await customer.getByRole('button',{name:/^Brakes/}).click();await customer.waitForFunction(()=>[...document.querySelectorAll('.product-card .product-badge')].length>0&&[...document.querySelectorAll('.product-card .product-badge')].every(e=>e.textContent==='Brakes'));});
  await timed('PT-012','dashboard all panels',t,5000,admin,()=>go(admin,'/admin/dashboard'));
  await timed('PT-014','revenue risk concentration forecast cards',t,5000,admin,async()=>{await admin.goto('http://localhost:5100/admin/dashboard');await admin.locator('.ai-revenue-card').nth(4).waitFor();ensure(await admin.locator('.ai-revenue-card').count()===5,'Missing analysis card');});
 }
 // Toggle each required sales period. Wait for its actual chart and completed animation.
 await go(admin,'/admin/dashboard');for(const period of ['Weekly','Monthly','Daily'])await timed('PT-013',period,1,3000,admin,async()=>{await admin.getByRole('button',{name:period,exact:true}).click();await admin.getByRole('img',{name:new RegExp('Sales by '+period.toLowerCase())}).waitFor();await admin.locator('.admin-sales-chart__updating').waitFor({state:'hidden'});await admin.waitForTimeout(250);});
 }
 if(process.env.QA_PHASE==='navigation'){for(const [role,p]of Object.entries(pages)){await p.context().tracing.stop({path:path.join(out,role+'-browser-trace.zip')});}await browser.close();await mongoose.disconnect();save();return;}
 // Three real cart checkouts; fixture population uses the actual UI add-to-cart action.
 const reservations=[];
 for(let t=1;t<=3;t++){
  await go(customer,'/customer/shop');await customer.getByRole('group',{name:'Product categories'}).getByRole('button',{name:/^All/}).click();
  for(const name of ['QA Brake Pad','QA Test Battery','QA Test Cable']){await customer.getByLabel('Search products',{exact:true}).fill(name);await customer.getByRole('link',{name:new RegExp('^'+name+',')}).click();const dialog=customer.getByRole('dialog');await dialog.waitFor();await dialog.getByRole('button',{name:/Add to cart/i}).click();await customer.getByRole('button',{name:/Close product/i}).click();}
  await customer.goto('http://localhost:5100/customer/cart');await customer.getByRole('button',{name:'Continue to checkout',exact:true}).waitFor();
  const before=await M.Product.find({_id:{$in:state.products.slice(0,3)}}).lean();
  await timed('PT-006','three item checkout',t,5000,customer,async()=>{await customer.getByRole('button',{name:'Continue to checkout',exact:true}).click();await customer.getByRole('button',{name:'Continue to payment',exact:true}).click();await customer.getByRole('button',{name:'Pay with GCash',exact:true}).waitFor();const r=await M.Reservation.findOne({customerId:state.customers[0]}).sort({createdAt:-1}).lean();ensure(r.items.length===3,'Not three items');for(const p of before)ensure((await M.Product.findById(p._id)).reservedQty===p.reservedQty+1,'Stock hold missing');reservations.push(r);return{reservationId:r._id,code:r.code,items:r.items.length,stockHeld:r.stockHeld};});
  if(!reservations[t-1])continue;
  if(!await customer.getByRole('dialog').isVisible())await customer.getByRole('button',{name:'Pay with GCash',exact:true}).click();const dialog=customer.getByRole('dialog');await dialog.getByLabel('GCash reference number').fill(String(Date.now())+t);await dialog.getByLabel('Attach receipt file').setInputFiles(path.join(__dirname,'data/QA-test-receipt.png'));
  await timed('PT-007','receipt upload 1–2 MB',t,10000,customer,async()=>{await dialog.getByRole('button',{name:'Submit payment',exact:true}).click();await dialog.waitFor({state:'hidden',timeout:65000});const r=await M.Reservation.findById(reservations[t-1]._id);ensure(r.status==='Payment Submitted','Payment not submitted');return{bytes:fs.statSync(path.join(__dirname,'data/QA-test-receipt.png')).size,reservationId:r.id};});
  await go(admin,'/admin/transactions');await admin.getByRole('tab',{name:/^Items/}).click();await admin.getByPlaceholder('Search code, customer, phone, or payment reference...').fill(reservations[t-1].code);const row=admin.locator('tr').filter({hasText:reservations[t-1].code});await row.getByRole('button',{name:'Review payment',exact:true}).click();const review=admin.getByRole('dialog');
  await timed('PT-008','confirm submitted payment',t,3000,admin,async()=>{await review.getByRole('button',{name:'Confirm payment',exact:true}).click();await review.waitFor({state:'hidden'});await row.getByText('Reserved',{exact:true}).waitFor();return{reservationId:reservations[t-1]._id};});
 }
 // Reports: ready dialog and saved/opened CSV, both action-to-result timings.
 for(let t=1;t<=3;t++){
  await go(admin,'/admin/dashboard');await admin.locator('.ai-revenue-card').first().waitFor();
  await timed('PT-020','quarter report ready',t,5000,admin,async()=>{await admin.getByRole('button',{name:/Export report/}).click();await admin.getByRole('button',{name:'Print / Save as PDF',exact:true}).waitFor();await admin.getByText('Loading business records…',{exact:true}).first().waitFor({state:'hidden'});return{table:await admin.locator('.ai-revenue-report__table').innerText()};});await admin.getByRole('button',{name:'Close report'}).click();
  await go(admin,'/admin/transactions');await admin.getByRole('tab',{name:/^Items/}).click();await admin.getByPlaceholder('Search code, customer, phone, or payment reference...').fill('09170000001');await admin.locator('.search-filter select').first().selectOption('Reserved');await admin.locator('.transactions-skeleton-row').first().waitFor({state:'hidden'});
  await timed('PT-020','filtered transactions CSV saved',t,5000,admin,async()=>{const download=admin.waitForEvent('download');await admin.getByRole('button',{name:'Export',exact:true}).click();const d=await download;const file=path.join(out,'transactions-'+t+'.csv');await d.saveAs(file);const csv=fs.readFileSync(file,'utf8');ensure(csv.includes('Record/Reservation ID'),'CSV header missing');return{file:path.basename(file),bytes:Buffer.byteLength(csv),rows:csv.split('\r\n').length};});
 }
 for(const [role,p]of Object.entries(pages)){await p.screenshot({path:path.join(out,role+'-desktop.png'),fullPage:true});await p.context().tracing.stop({path:path.join(out,role+'-browser-trace.zip')});}
 await browser.close();await mongoose.disconnect();save();
}
main().catch(async e=>{for(const [role,p]of Object.entries(pages)){await p.screenshot({path:path.join(out,role+'-runner-error.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(out,role+'-runner-body.txt'),await p.locator('body').innerText().catch(()=>''));}checks.push({status:'FAIL',action:'runner error',actual:e.stack});save();console.error(e);await browser?.close();await mongoose.disconnect();process.exit(1)});
