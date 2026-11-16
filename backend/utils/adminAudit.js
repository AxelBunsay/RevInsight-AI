const { randomUUID } = require('crypto');
const AdminAudit = require('../models/adminAudit');
const fields = ['status', 'paymentStatus', 'mechanic', 'mechanicId', 'amountPaid', 'balanceDue', 'totalPrice', 'refundDecision', 'completedAt'];
function auditSnapshot(record) {
  return Object.fromEntries(fields.map(key => {
    const value = record?.[key];
    return [key, value == null ? null : value instanceof Date ? value.toISOString() : typeof value === 'object' ? String(value._id || value) : value];
  }));
}
function redactAuditReason(reason) {
  return String(reason || '')
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]')
    .replace(/\b(password|token|secret|otp|api[-_ ]?key|authorization)\b["']?\s*[:=]\s*.*$/gim, '$1=[redacted]')
    .replace(/https?:\/\/\S+/gi, '[link redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]')
    .replace(/(?:\+?\d[\d ()-]{8,}\d)/g, '[number redacted]')
    .trim().slice(0, 300);
}
async function recordAuditChange({ req, session, recordType, before, after, action, reason = '' }) {
  if (!session?.inTransaction()) throw new Error('Audit writes require the action transaction.');
  const current = auditSnapshot(after);
  const changes = Object.fromEntries(fields.filter(key => before[key] !== current[key]).map(key => [key, { from: before[key], to: current[key] }]));
  if (!Object.keys(changes).length) return;
  const actorId = req.admin?.id || req.user?.userId || req.user?.id;
  const actorRole = req.admin ? 'admin' : req.user?.role;
  await AdminAudit.create([{
    eventId: randomUUID(), actorId, actorRole, timestamp: new Date(),
    recordType, recordId: after._id, action, changes, reason: redactAuditReason(reason)
  }], { session });
}
module.exports = { auditSnapshot, recordAuditChange, redactAuditReason };
