const L=require('./acceptance-lib.cjs');const{fs,path,state,models:M,ensure,connect,mongoose}=L;
const backup=path.join(__dirname,'.acceptance-scenario-backup.json');
async function main(){await connect();const command=process.argv[2];
 if(command==='expire-item'){
  const code=process.argv[3],seconds=Number(process.argv[4]||60);ensure(/^RSV-\d+$/.test(code||'')&&Number.isInteger(seconds)&&seconds>=1&&seconds<=3600,'Usage: expire-item RSV-0001 60');
  const r=await M.Reservation.findOne({code,customerId:{$in:state.customers},status:'Pending Down Payment'});ensure(r,'Only a seeded test customer’s pending reservation may be shortened');r.paymentDueAt=new Date(Date.now()+seconds*1000);await r.save();console.log(JSON.stringify({code:r.code,paymentDueAt:r.paymentDueAt,stockHeld:r.stockHeld}));
 }else if(command==='restore-revenue'){
  ensure(fs.existsSync(backup),'No scenario backup exists');const data=JSON.parse(fs.readFileSync(backup));ensure(data.mongoUri===state.mongoUri,'Backup belongs to another isolated test database');for(const[name,items]of Object.entries(data.rows))if(items.length)await M[name].bulkWrite(items.map(r=>({updateOne:{filter:{_id:r._id},update:{$set:{status:r.status}}}})));fs.unlinkSync(backup);console.log('Original test revenue statuses restored');
 }else if(['empty-revenue','short-history'].includes(command)){
  ensure(!fs.existsSync(backup),'Restore the previous revenue scenario first');const rows={Reservation:await M.Reservation.find({status:'Completed'}).select('_id status code').lean(),ServiceRequest:await M.ServiceRequest.find({status:'completed'}).select('_id status').lean()};fs.writeFileSync(backup,JSON.stringify({mongoUri:state.mongoUri,rows},null,2));
  if(command==='empty-revenue'){await M.Reservation.updateMany({status:'Completed'},{$set:{status:'Cancelled'}});await M.ServiceRequest.updateMany({status:'completed'},{$set:{status:'cancelled'}});}else await M.Reservation.updateMany({code:{$in:['QA-HISTORY-0','QA-HISTORY-1','QA-HISTORY-2','QA-HISTORY-3']}},{$set:{status:'Cancelled'}});
  console.log('Scenario active only in the isolated test DB. Refresh the browser. Restore with: node perf-tests/manual-scenario.cjs restore-revenue');
 }else throw Error('Use expire-item, empty-revenue, short-history, or restore-revenue');await mongoose.disconnect();}
main().catch(async e=>{console.error(e.message);await mongoose.disconnect();process.exit(1)});
