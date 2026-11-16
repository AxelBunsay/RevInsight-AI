import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { auditSnapshot, recordAuditChange, redactAuditReason } = require('../utils/adminAudit');

describe('audit data minimization', () => {
  it('keeps business changes and excludes receipt, credential and customer fields', () => {
    const snapshot = auditSnapshot({ status: 'completed', totalPrice: 1200, customerName: 'Synthetic', customerPhone: '09000000000', paymentReference: 'reference', paymentProofUrl: 'https://invalid.example/receipt', password: 'synthetic-secret' });
    expect(snapshot).toMatchObject({ status: 'completed', totalPrice: 1200 });
    for (const field of ['customerName', 'customerPhone', 'paymentReference', 'paymentProofUrl', 'password']) expect(snapshot).not.toHaveProperty(field);
  });

  it('redacts credential-shaped reason text, contacts and receipt links', () => {
    for (const reason of ['Unreadable proof; "password": "synthetic secret with spaces"', 'Unreadable proof; otp=123456', 'Unreadable proof; qa@example.invalid 09000000000 https://invalid.example/receipt']) {
      const value = redactAuditReason(reason);
      expect(value).toContain('Unreadable proof');
      for (const secret of ['synthetic secret', '123456', 'qa@example.invalid', '09000000000', 'https://invalid.example/receipt']) expect(value).not.toContain(secret);
    }
  });

  it('requires the same transaction as the affected action', async () => {
    await expect(recordAuditChange({ session: { inTransaction: () => false } })).rejects.toThrow('Audit writes require the action transaction.');
  });
});
