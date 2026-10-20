import { describe, expect, it } from 'vitest';
import {
  createWorkOrderSchema,
  publicReportSchema,
  registerSchema,
  transitionSchema,
  updateSlaPoliciesSchema,
  workOrderListQuerySchema,
} from '../src/index.js';

const uuid = '0b9d1f5e-4a3c-4d2e-9f1a-2b3c4d5e6f70';

describe('schemas', () => {
  it('normalizes emails', () => {
    const r = registerSchema.parse({ name: 'Ada Lovelace', email: '  Ada@Example.COM ', password: 'correct-horse-1' });
    expect(r.email).toBe('ada@example.com');
  });

  it('rejects short passwords', () => {
    expect(registerSchema.safeParse({ name: 'Ada', email: 'a@b.co', password: 'short' }).success).toBe(false);
  });

  it('work orders need a location or asset', () => {
    expect(createWorkOrderSchema.safeParse({ title: 'Leaking tap', categoryId: uuid }).success).toBe(false);
    expect(createWorkOrderSchema.safeParse({ title: 'Leaking tap', categoryId: uuid, assetId: uuid }).success).toBe(true);
  });

  it('transition payloads are action-specific', () => {
    expect(transitionSchema.safeParse({ action: 'hold', expectedVersion: 2 }).success).toBe(false);
    expect(transitionSchema.safeParse({ action: 'hold', expectedVersion: 2, reason: 'Waiting for parts' }).success).toBe(true);
    expect(transitionSchema.safeParse({ action: 'teleport', expectedVersion: 2 }).success).toBe(false);
    const submit = transitionSchema.parse({ action: 'submit_resolution', expectedVersion: 3, notes: 'Replaced the fan motor.' });
    expect(submit).toMatchObject({ attachmentIds: [] });
  });

  it('list queries parse comma lists and booleans', () => {
    const q = workOrderListQuerySchema.parse({ status: 'OPEN,ASSIGNED', overdue: 'true', page: '2' });
    expect(q).toMatchObject({ status: ['OPEN', 'ASSIGNED'], overdue: true, page: 2, pageSize: 25, sort: 'createdAt' });
    expect(workOrderListQuerySchema.safeParse({ status: 'OPEN,BOGUS' }).success).toBe(false);
  });

  it('SLA policies need one per priority with sane bounds', () => {
    const p = (priority: string, r = 60, res = 120) => ({ priority, responseMinutes: r, resolutionMinutes: res, warningPercent: 75, escalationEnabled: true });
    expect(updateSlaPoliciesSchema.safeParse({ policies: [p('CRITICAL'), p('HIGH'), p('MEDIUM'), p('LOW')] }).success).toBe(true);
    expect(updateSlaPoliciesSchema.safeParse({ policies: [p('CRITICAL'), p('CRITICAL'), p('MEDIUM'), p('LOW')] }).success).toBe(false);
    expect(updateSlaPoliciesSchema.safeParse({ policies: [p('CRITICAL', 120, 60), p('HIGH'), p('MEDIUM'), p('LOW')] }).success).toBe(false);
  });

  it('public reports reject the honeypot and invalid contact details', () => {
    const base = { title: 'Broken light', guestName: 'Sam', guestContact: 'sam@example.com' };
    expect(publicReportSchema.safeParse(base).success).toBe(true);
    expect(publicReportSchema.safeParse({ ...base, website: 'spam' }).success).toBe(false);
    expect(publicReportSchema.safeParse({ ...base, guestContact: 'nope' }).success).toBe(false);
  });
});
