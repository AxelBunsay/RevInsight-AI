const fs=require('node:fs');const path=require('node:path');
require('./acceptance-env.cjs');
const mongoose=require('../backend/node_modules/mongoose');const jwt=require('../backend/node_modules/jsonwebtoken');
const state=JSON.parse(fs.readFileSync(path.join(__dirname,'.acceptance-state.json')));
const models={};for(const [key,file] of Object.entries({User:'user',Mechanic:'mechanic',Product:'product',Service:'service',ServiceRequest:'serviceRequest',BusinessRecord:'businessRecord',Notification:'notification',Reservation:'orderingModels/reservation',Settings:'reservationSettings',PendingUser:'pendingUser'}))models[key]=require('../backend/models/'+file);
const tokens={admin:jwt.sign({id:state.admin,role:'admin'},process.env.JWT_SECRET)};
state.customers.forEach((id,i)=>tokens['customer'+(i+1)]=jwt.sign({userId:id,role:'customer'},process.env.JWT_SECRET));
state.mechanics.forEach((id,i)=>tokens['mechanic'+(i+1)]=jwt.sign({userId:id,role:'mechanic'},process.env.JWT_SECRET));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pWQAAAAASUVORK5CYII=','base64');
async function api(url,role='admin',body,method=body===undefined?'GET':'POST'){
 const started=performance.now();const multipart=body instanceof FormData;
 const response=await fetch('http://localhost:5100'+url,{method,headers:{...(tokens[role]?{Authorization:'Bearer '+tokens[role]}:{}),...(body!==undefined&&!multipart?{'Content-Type':'application/json'}:{})},...(body===undefined?{}:{body:multipart?body:JSON.stringify(body)}),signal:AbortSignal.timeout(70000)});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data={text:text.slice(0,1000)}}return{status:response.status,ms:performance.now()-started,data,headers:Object.fromEntries(response.headers)};
}
function upload(reference,bytes=png,field='proof'){const f=new FormData();f.set('reference',reference);f.set(field,new Blob([bytes],{type:'image/png'}),'QA-TEST-NOT-A-PAYMENT.png');return f;}
const ensure=(condition,message)=>{if(!condition)throw new Error(message)};
function futureDate(offset=1){let d=new Date();d.setDate(d.getDate()+offset);if(d.getDay()===0)d.setDate(d.getDate()+1);return d.toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});}
async function reservation(role='customer1',product=state.products[0],qty=1,extra={}){const r=await api('/api/reservations',role,{items:[{productId:product,qty,...extra}]});ensure(r.status===201,JSON.stringify(r));return r.data.reservation;}
async function booking(role='customer1',extra={}){const r=await api('/api/services/bookings',role,{bookings:[{serviceId:state.services[0],date:futureDate(),startTime:'10:00',vehicle:'QA Fake Motorcycle',partsSource:'shop',...extra}]});ensure(r.status===200,JSON.stringify(r));return r.data.results[0];}
async function connect(){if(mongoose.connection.readyState===0)await mongoose.connect(state.mongoUri);}
module.exports={fs,path,mongoose,state,models,tokens,png,api,upload,ensure,futureDate,reservation,booking,connect};
