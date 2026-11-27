export function auditRecordReference(record) {
  const recordType = record?.isReservation ? 'reservation'
    : record?.isServiceRequest || record?.recordType === 'service' ? 'service' : 'order';
  const id = record?.sourceId || record?._id || record?.id;
  const recordId = typeof id === 'object' ? id?._id : id;
  return { recordType, recordId: String(recordId || '') };
}
