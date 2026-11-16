import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {buildScopedRevenue}=require('../utils/revenueScope');
const {revenueCoverage}=require('../utils/revenueCoverage');
describe('recorded revenue coverage is not certification',()=>{
 it('counts source records once across line items and reports observed dates only',()=>{
  const entries=[{source:'order',recordId:'one',dateLabel:'2026-07-01'},{source:'order',recordId:'one',dateLabel:'2026-07-01'},{source:'service',recordId:'one',dateLabel:'2026-09-12'}];
  const coverage=revenueCoverage(entries);
  expect(coverage).toMatchObject({includedTransactions:2,firstRecordedDate:'2026-07-01',lastRecordedDate:'2026-09-12',completeness:'unknown',confirmedZeroSales:null,empty:false});
 });
 it('distinguishes an empty in-progress quarter from a closed but unverified quarter',()=>{
  for(const [now,quarterInProgress]of[['2026-08-15T12:00:00+08:00',true],['2026-10-01T00:00:00+08:00',false]]){
   const data=buildScopedRevenue([],{scope:'selectedQuarter',selectedQuarter:'2026-Q3'},new Date(now));
   expect(data.coverage).toMatchObject({includedTransactions:0,empty:true,completeness:'unknown',confirmedZeroSales:null,firstRecordedDate:null,lastRecordedDate:null,quarterInProgress});
   expect(data.concentration.indicators).toMatchObject({hhi:null,topOneShare:null,topThreeShare:null,concentrationLevel:'Not enough data'});
   expect(data.risk.indicators.qoqChange.coverageWarning).toContain('completeness is unknown');
  }
 });
 it('uses the Manila quarter transition, independent of the machine timezone',()=>{
  const input={scope:'selectedQuarter',selectedQuarter:'2026-Q3'};
  expect(buildScopedRevenue([],input,new Date('2026-09-30T15:59:59Z')).coverage.quarterInProgress).toBe(true);
  expect(buildScopedRevenue([],input,new Date('2026-09-30T16:00:00Z')).coverage.quarterInProgress).toBe(false);
 });
});
