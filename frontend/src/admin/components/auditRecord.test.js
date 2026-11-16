import { describe, it, expect } from 'vitest';
import { auditRecordReference } from './auditRecord';
describe('audit history follows the source record, not a report projection',()=>{
 it.each([
  [{_id:'projection',sourceId:'original',recordType:'service'},{recordType:'service',recordId:'original'}],
  [{_id:'reservation',isReservation:true},{recordType:'reservation',recordId:'reservation'}],
  [{_id:'order'},{recordType:'order',recordId:'order'}],
  [{_id:'service',isServiceRequest:true},{recordType:'service',recordId:'service'}],
 ])('resolves %j',(record,expected)=>expect(auditRecordReference(record)).toEqual(expected));
});
