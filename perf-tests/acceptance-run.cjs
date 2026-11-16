// Same application source and production bundle throughout; restart between
// independent phases to keep earlier investigations out of rate-limit preconditions.
const fs=require('fs');const path=require('path');const{spawn}=require('child_process');const root=path.resolve(__dirname,'..');
const dir=path.join(root,'docs/acceptance/evidence/final');fs.mkdirSync(dir,{recursive:true});
async function restart(){const now=new Date();fs.utimesSync(path.join(root,'backend/app.js'),now,now);await new Promise(r=>setTimeout(r,1800));for(let i=0;i<30;i++){try{const r=await fetch('http://localhost:5100/api/products?limit=1',{signal:AbortSignal.timeout(3000)});if(r.status===200)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Isolated server not ready');}
async function run(file,subdir,extra={}){await restart();console.log('START',subdir,new Date().toISOString());const log=fs.openSync(path.join(dir,subdir+'.txt'),'w');const child=spawn(process.execPath,[path.join(__dirname,file),'final/'+subdir],{cwd:root,env:{...process.env,...extra},windowsHide:true,stdio:['ignore',log,log]});const code=await new Promise(r=>child.on('exit',r));fs.closeSync(log);console.log('END',subdir,'exit',code,new Date().toISOString());if(code!==0)throw Error(subdir+' runner stopped; retain evidence and fix before final rerun');}
async function main(){for(const[file,name,env]of [
 ['acceptance-functional.cjs','functional-api'],['acceptance-extra.cjs','functional-extra'],
 ['acceptance-browser.cjs','navigation-retest',{QA_PHASE:'navigation'}],
 ['acceptance-browser.cjs','workflows',{QA_PHASE:'workflows'}],
 ['acceptance-operations.cjs','operations'],['acceptance-ui.cjs','functional-ui'],
 ['acceptance-quote-ui.cjs','quote-ui'],['acceptance-final-details.cjs','details-retest'],
 ['acceptance-mechanic-integrity.cjs','mechanic-integrity'],
 ['acceptance-resilience.cjs','resilience'],['acceptance-logout.cjs','logout'],
 ['acceptance-concurrent.cjs','concurrent-retest'],['login-cycles.cjs','login-cycles'],
 ['acceptance-settings-ui.cjs','settings-ui']
])await run(file,name,env||{});console.log('Core final phases complete; run unavailable-AI check and isolated genuine-AI phase next.');}
main().catch(e=>{console.error(e);process.exitCode=1});
