import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildScopedRevenue, resolveRevenueScope } = require('../utils/revenueScope');
const { buildRevenueChartData, normalizeRevenueSources } = require('../utils/revenue');
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
 it('preserves an unsplit mixed sale and keeps it out of a product ranking',async()=>{
   const rows = normalizeRevenueSources({orders:[{_id:'mixed',createdAt:'2024-01-01',totalPrice:100,
     items:[{recordType:'mixed',name:'Parts and installation',price:80,quantity:1},
       {productName:'Pads',price:20,quantity:1}]}],manualOrders:new Set(['mixed'])});
   const data = buildScopedRevenue(rows);
   expect(data.concentration.salesMix).toMatchObject({itemSales:20,mixedRevenue:80,knownProductRevenue:20,manualItemSales:0});
   expect(data.reportRecords).toMatchObject([{amount:100,recordType:'mixed',itemName:'Parts and installation, Pads'}]);
   const chart = buildRevenueChartData('top_products',rows,data.quarters,new Date(),data.scope,data.concentration.salesMix);
   expect(chart.labels).toEqual(['Pads']);
   expect(chart.datasets[0].data).toEqual([20]);
 });
 it('explains daily totals, zero revenue and absent transactions separately',()=>{
   const historical = { ...entries[0], name:'Daily sales (historical record)', contributorType:'Uncategorized', category:'Uncategorized' };
   for (const [rows, reason, percent] of [
     [[historical], 'classified product or service', 0],
     [[{...historical, revenue:0}], 'total zero revenue', null],
     [[], 'No eligible transactions', null]
   ]) {
     const {risk, concentration} = buildScopedRevenue(rows, {scope:'selectedQuarter', selectedQuarter:'2026-Q2'});
     expect(concentration.unavailableReason).toContain(reason);
     expect(risk.overallRisk.reason).toBe(concentration.unavailableReason);
     expect(concentration.classification.contributors).toEqual({amount:0, percentOfEligible:percent});
     expect(concentration.indicators).toMatchObject({hhi:null, topOneShare:null, topThreeShare:null});
   }
 });
 it('keeps the sale total once and uses each metric’s classified denominator',()=>{
   const rows = normalizeRevenueSources({orders:[{_id:'one', createdAt:'2024-10-01', totalPrice:80, items:[
     {productId:'known', category:'Uncategorized', price:10, quantity:2},
     {productName:'Oil', category:'Fluids', price:10, quantity:1},
     {category:'Parts', price:30, quantity:1},
     {productName:'Daily sales (historical record)', category:'Uncategorized', price:20, quantity:1}
   ]}], productCategories:{known:'Parts'}, productNames:{known:'Pads'}});
   const {risk, coverage, concentration} = buildScopedRevenue(rows,{scope:'selectedQuarter',selectedQuarter:'2024-Q4'});
   expect(coverage.includedTransactions).toBe(1);
   expect(concentration.totalRevenue).toBe(80);
   expect(concentration.classification).toEqual({contributors:{amount:30,percentOfEligible:37.5},categories:{amount:60,percentOfEligible:75}});
   expect(concentration.contributors[0].name).toBe('Pads');
   expect(concentration.indicators).toMatchObject({topOneShare:66.67,topThreeShare:100,hhi:0.5556,concentrationLevel:'High'});
   expect(risk.riskByCategory[0].percentage).toBeCloseTo(100*50/60);
 });
 it('keeps sales with incomplete line weights and unnamed labor out of contributor rankings',()=>{
   const date = '2024-11-01';
   const rows = normalizeRevenueSources({
     orders:[{_id:'sale', createdAt:date, totalPrice:80, items:[
       {productName:'Pads', category:'Parts', price:20, quantity:1}, {quantity:1}
     ]}],
     services:[{_id:'labor', completedAt:date, estimatedPrice:20}]
   });
   const {concentration, coverage} = buildScopedRevenue(rows);
   expect(coverage.includedTransactions).toBe(2);
   expect(concentration.totalRevenue).toBe(100);
   expect(concentration.classification).toEqual({contributors:{amount:0,percentOfEligible:0},categories:{amount:20,percentOfEligible:20}});
   expect(concentration.indicators.hhi).toBeNull();
 });
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
