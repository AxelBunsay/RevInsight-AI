import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildScopedRevenue, resolveRevenueScope } = require('../utils/revenueScope');
const { buildRevenueChartData } = require('../utils/revenue');
const { gatherRevenueAnalysisData, getRevenueCardInsights, askRevenueAI } = require('../controllers/adminControllers/aiController');
const entries = [[2, [4000,3000,2000,1000]], [3,[6000,2500,1000,500]]].flatMap(([quarter,amounts]) =>
  amounts.map((revenue,i) => ({ year:2026, quarter, month:quarter*3-1, dateLabel:'2026-'+(quarter===2?'05':'08')+'-15', source:'order', recordId:quarter+':'+i, name:['Pads','Battery','Cable','Labor'][i], contributorType:i===3?'Labor service':'Parts', revenue })));
const response = () => ({ statusCode:200, status(n){this.statusCode=n;return this;}, json(data){this.data=data;return data;} });
const ok = data => async (_req,res)=>res.json({success:true,data});
const dashboard = { getDashboardStats:ok({}),getQuarterlyData:ok([]),getRevenueRisk:ok({}),getRevenueConcentration:ok({}),getRevenueData:ok([]),getRevenueChartEntries:ok(entries),
 getScopedRevenue:async(req,res)=>res.json({success:true,data:buildScopedRevenue(entries,req.query)}) };
const card = {summary:'Recorded figures.',recommendation:'Review the mix.',ifFollowed:'Risk may change.',ifIgnored:'Risk could persist.'};
const insights=Object.fromEntries(['trend','risk','concentration','service','forecast'].map(k=>[k,card]));
describe('one revenue scope for dashboard, export and AI',()=>{
 it('independently matches equal-total, different-mix quarters and all records',async()=>{
  for(const [scope,selectedQuarter,topOneShare,topThreeShare,hhi] of [
   ['selectedQuarter','2026-Q2',40,90,.3],['selectedQuarter','2026-Q3',60,95,.435],['allRecords','2026-Q3',50,92.5,.35375]
  ]){
   const data=buildScopedRevenue(entries,{scope,selectedQuarter});
   expect(data.concentration.totalRevenue).toBe(scope==='allRecords'?20000:10000);
   expect(data.concentration.contributors[0].name).toBe('Pads');
   expect(data.concentration.indicators).toMatchObject({topOneShare,topThreeShare,hhi:Number(hhi.toFixed(4)),concentrationLevel:'High'});
   expect(data.reportRecords.reduce((sum,row)=>sum+row.amount,0)).toBe(data.concentration.totalRevenue);
   const prompt=await gatherRevenueAnalysisData({body:{scope,selectedQuarter}},dashboard,new Date());
   expect(prompt.revenueConcentration).toEqual(data.concentration);
   expect(prompt.analysisScopes.concentration).toBe(data.scope.label);
   const res=response(), generate=vi.fn().mockResolvedValue('Verified scoped answer.');
   await askRevenueAI({body:{scope,selectedQuarter,question:'Explain risk.'}},res,{dashboardController:dashboard,generateRevenueInsights:generate});
   expect(generate.mock.calls[0][1].revenueConcentration).toEqual(data.concentration);
   const chart=buildRevenueChartData('top_contributors',data.entries,data.quarters,new Date(),data.scope);
   expect(chart.title).toContain(data.scope.label);
   expect(chart.datasets[0].data[0]).toBe(data.concentration.contributors[0].revenue);
  }
 });
 it('does not reuse cached insights across scopes with equal totals',async()=>{
  const generate=vi.fn().mockResolvedValue({source:'ai',insights});
  const deps={dashboardController:dashboard,generateCardInsights:generate,cache:new Map(),requests:new Map(),refreshes:new Map()};
  for(const [scope,selectedQuarter]of[['selectedQuarter','2026-Q2'],['selectedQuarter','2026-Q3'],['allRecords','2026-Q3'],['selectedQuarter','2026-Q2']]){
   await getRevenueCardInsights({body:{scope,selectedQuarter},query:{}},response(),deps);
  }
  expect(generate).toHaveBeenCalledTimes(3);
  expect(generate.mock.calls.map(c=>c[0].revenueConcentration.indicators.topOneShare)).toEqual([40,60,50]);
 });
 it('uses exclusive Manila quarter boundaries and rejects invalid scopes',()=>{
  const rows=[{...entries[0],dateLabel:'2026-03-31'},{...entries[0],dateLabel:'2026-04-01'},{...entries[0],dateLabel:'2026-06-30'},{...entries[0],dateLabel:'2026-07-01'}];
  expect(buildScopedRevenue(rows,{scope:'selectedQuarter',selectedQuarter:'2026-Q2'}).entries).toHaveLength(2);
  expect(()=>resolveRevenueScope({scope:'selectedQuarter'})).toThrow();
  expect(()=>resolveRevenueScope({scope:'unknown'})).toThrow();
 });
});
