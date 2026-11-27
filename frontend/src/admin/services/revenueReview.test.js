import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '../../services/api';
import { adminApi } from './adminApi';
vi.mock('../../services/api',()=>({request:vi.fn()}));
afterEach(()=>vi.clearAllMocks());
describe('Admin quarter review requests',()=>{
 it('loads exactly the selected quarter through the Admin API',async()=>{
  request.mockResolvedValue({data:{selectedQuarter:'2026-Q3'}});
  await adminApi.getQuarterReview('2026-Q3');
  expect(request).toHaveBeenCalledWith('/api/dashboard/analytics/quarter-review?selectedQuarter=2026-Q3',{tokenKey:'adminToken'});
 });
 it('sends an explicit zero-sales decision and the observed version without personal fields',async()=>{
  request.mockResolvedValue({success:true});
  const decision={selectedQuarter:'2026-Q3',monthKey:'2026-08',fingerprint:'a'.repeat(64),confirmZeroSales:true};
  await adminApi.reviewRevenueMonth(decision);
  const [url,options]=request.mock.calls[0];
  expect(url).toBe('/api/dashboard/analytics/month-review');
  expect(options.method).toBe('POST');expect(options.tokenKey).toBe('adminToken');
  expect(JSON.parse(options.body)).toEqual(decision);
 });
});
