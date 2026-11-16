const fs=require('fs'); const path=require('path'); const {chromium}=require('playwright');
const out=path.resolve(__dirname,'../docs/acceptance/evidence',process.argv[2]||'baseline');fs.mkdirSync(out,{recursive:true});
async function main(){
 const browser=await chromium.launch();const context=await browser.newContext();await context.tracing.start({screenshots:true,snapshots:true});const page=await context.newPage(); const trials=[];
 for(let i=1;i<=10;i++){
  await page.goto('http://localhost:5100/customer/login');await page.getByLabel('Username or email').fill('qa_customer1');await page.getByLabel('Password',{exact:true}).fill('AcceptancePass1');
  const started=performance.now();let retries=0, responses=[];
  while(true){
   const pending=page.waitForResponse(r=>r.url().endsWith('/api/users/login')&&r.request().method()==='POST');await page.getByRole('button',{name:'Sign In',exact:true}).click(); const r=await pending;responses.push({status:r.status(),elapsedMs:performance.now()-started});
   if(r.status()!==429)break;
   retries++;const seconds=Number(r.headers()['retry-after']||120);console.log(`Cycle ${i}: rate limited; waiting ${seconds}s (included in trial)`);await page.waitForTimeout(seconds*1000+100);
  }
  await page.getByLabel('Search products',{exact:true}).waitFor();await page.getByText('QA Brake Pad',{exact:true}).first().waitFor(); const elapsedMs=performance.now()-started;
  await page.getByRole('button',{name:'Account',exact:true}).click();await page.getByRole('menuitem',{name:'Sign out'}).click();
  await page.goto('http://localhost:5100/customer/cart');await page.getByLabel('Username or email').waitFor();
  trials.push({trial:i,elapsedMs,retries,responses,protectedAfterLogout:new URL(page.url()).pathname==='/customer/login',success:true});fs.writeFileSync(path.join(out,'PT-003.json'),JSON.stringify(trials,null,2));console.log(`Cycle ${i}: ${elapsedMs.toFixed(0)}ms`);
 }
 await context.tracing.stop({path:path.join(out,'login-cycles.zip')});await browser.close();
}
main().catch(e=>{console.error(e);process.exit(1)});
