import { describe, expect, it } from 'vitest';
import {
  ACTION_DEFINITIONS,
  WORK_ORDER_ACTIONS,
  WORK_ORDER_STATUSES,
  evaluateTransition,
  getAvailableActions,
  validateResolutionSubmission,
  type WorkflowActor,
  type WorkflowPolicy,
  type WorkflowWorkOrder,
  type WorkOrderStatus,
} from '../src/index.js';

const NOW = new Date('2026-05-10T12:00:00Z');
const REQUESTER = 'u-requester';
const TECH = 'u-tech';
const OTHER_TECH = 'u-tech-2';

const policy: WorkflowPolicy = { requesterCanVerify: true, technicianSelfAssign: false, reopenWindowDays: 7 };

const wo = (status: WorkOrderStatus, extra: Partial<WorkflowWorkOrder> = {}): WorkflowWorkOrder => ({
  status,
  requesterId: REQUESTER,
  assigneeId: status === 'OPEN' ? null : TECH,
  resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date('2026-05-08T12:00:00Z') : null,
  ...extra,
});

const actors = {
  admin: { userId: 'u-admin', role: 'ORG_ADMIN' },
  manager: { userId: 'u-manager', role: 'MANAGER' },
  tech: { userId: TECH, role: 'TECHNICIAN' },
  otherTech: { userId: OTHER_TECH, role: 'TECHNICIAN' },
  requester: { userId: REQUESTER, role: 'REQUESTER' },
  strangerRequester: { userId: 'u-someone', role: 'REQUESTER' },
  system: { userId: null, role: 'SYSTEM' },
} satisfies Record<string, WorkflowActor>;

const opts = { now: NOW, targetAssigneeId: OTHER_TECH, previousAssigneeActive: true };

describe('state validity', () => {
  it.each(WORK_ORDER_ACTIONS.flatMap((a) => WORK_ORDER_STATUSES.map((s) => [a, s] as const)))(
    '%s from %s is only possible from its declared source states',
    (action, status) => {
      const r = evaluateTransition(action, wo(status), actors.admin, policy, opts);
      if (!ACTION_DEFINITIONS[action].from.includes(status)) {
        expect(r).toMatchObject({ allowed: false, code: 'INVALID_STATE' });
      }
    },
  );

  it('terminal CANCELLED has no outgoing transitions for anyone', () => {
    for (const actor of Object.values(actors)) {
      expect(getAvailableActions(wo('CANCELLED'), actor, policy, NOW)).toEqual([]);
    }
  });
});

describe('assignment', () => {
  it('managers and admins assign OPEN work', () => {
    expect(evaluateTransition('assign', wo('OPEN'), actors.manager, policy, opts)).toMatchObject({ allowed: true, to: 'ASSIGNED' });
    expect(evaluateTransition('assign', wo('OPEN'), actors.admin, policy, opts)).toMatchObject({ allowed: true });
  });

  it('requires a target technician', () => {
    expect(evaluateTransition('assign', wo('OPEN'), actors.manager, policy, { now: NOW })).toMatchObject({ code: 'ASSIGNEE_REQUIRED' });
  });

  it('technicians cannot assign unless self-assign policy is on, and then only to themselves', () => {
    const self = { now: NOW, targetAssigneeId: TECH };
    expect(evaluateTransition('assign', wo('OPEN'), actors.tech, policy, self)).toMatchObject({ code: 'POLICY_DISABLED' });
    const open = { ...policy, technicianSelfAssign: true };
    expect(evaluateTransition('assign', wo('OPEN'), actors.tech, open, self)).toMatchObject({ allowed: true });
    expect(evaluateTransition('assign', wo('OPEN'), actors.tech, open, opts)).toMatchObject({ code: 'NOT_PERMITTED' });
  });

  it('requesters never assign', () => {
    expect(evaluateTransition('assign', wo('OPEN'), actors.requester, policy, opts)).toMatchObject({ code: 'NOT_PERMITTED' });
  });

  it('reassign moves in-progress work back to ASSIGNED and rejects the same assignee', () => {
    expect(evaluateTransition('reassign', wo('IN_PROGRESS'), actors.manager, policy, opts)).toMatchObject({ allowed: true, to: 'ASSIGNED' });
    expect(
      evaluateTransition('reassign', wo('IN_PROGRESS'), actors.manager, policy, { now: NOW, targetAssigneeId: TECH }),
    ).toMatchObject({ code: 'SAME_ASSIGNEE' });
    expect(evaluateTransition('reassign', wo('ASSIGNED'), actors.tech, policy, opts)).toMatchObject({ code: 'NOT_PERMITTED' });
  });

  it('assigned technician may decline (unassign) with a reason', () => {
    expect(evaluateTransition('unassign', wo('ASSIGNED'), actors.tech, policy, opts)).toMatchObject({ allowed: true, to: 'OPEN', reasonRequired: true });
    expect(evaluateTransition('unassign', wo('ASSIGNED'), actors.otherTech, policy, opts)).toMatchObject({ allowed: false });
  });
});

describe('field work', () => {
  it('only the assignee starts, and other technicians cannot', () => {
    expect(evaluateTransition('start', wo('ASSIGNED'), actors.tech, policy, opts)).toMatchObject({ allowed: true, to: 'IN_PROGRESS' });
    expect(evaluateTransition('start', wo('ASSIGNED'), actors.otherTech, policy, opts)).toMatchObject({ allowed: false });
    expect(evaluateTransition('start', wo('ASSIGNED'), actors.manager, policy, opts)).toMatchObject({ allowed: false });
  });

  it('hold requires a reason and resume returns to IN_PROGRESS', () => {
    expect(evaluateTransition('hold', wo('IN_PROGRESS'), actors.tech, policy, opts)).toMatchObject({ to: 'ON_HOLD', reasonRequired: true });
    expect(evaluateTransition('resume', wo('ON_HOLD'), actors.manager, policy, opts)).toMatchObject({ to: 'IN_PROGRESS' });
    expect(evaluateTransition('hold', wo('IN_PROGRESS'), actors.requester, policy, opts)).toMatchObject({ allowed: false });
  });

  it('only the assignee submits a resolution', () => {
    expect(evaluateTransition('submit_resolution', wo('IN_PROGRESS'), actors.tech, policy, opts)).toMatchObject({ to: 'PENDING_VERIFICATION' });
    expect(evaluateTransition('submit_resolution', wo('IN_PROGRESS'), actors.manager, policy, opts)).toMatchObject({ allowed: false });
  });
});

describe('verification', () => {
  const pending = wo('PENDING_VERIFICATION');

  it('requester of the work order may approve or reject when the policy allows', () => {
    expect(evaluateTransition('approve', pending, actors.requester, policy, opts)).toMatchObject({ to: 'RESOLVED' });
    expect(evaluateTransition('reject', pending, actors.requester, policy, opts)).toMatchObject({ to: 'IN_PROGRESS', reasonRequired: true });
    const strict = { ...policy, requesterCanVerify: false };
    expect(evaluateTransition('approve', pending, actors.requester, strict, opts)).toMatchObject({ code: 'POLICY_DISABLED' });
  });

  it('other requesters cannot verify', () => {
    expect(evaluateTransition('approve', pending, actors.strangerRequester, policy, opts)).toMatchObject({ code: 'NOT_PERMITTED' });
  });

  it('nobody verifies their own repair — even when they also requested it', () => {
    const selfReported = wo('PENDING_VERIFICATION', { requesterId: TECH });
    expect(evaluateTransition('approve', selfReported, actors.tech, policy, opts)).toMatchObject({ code: 'SELF_VERIFICATION' });
  });

  it('managers always may verify', () => {
    const strict = { ...policy, requesterCanVerify: false };
    expect(evaluateTransition('approve', pending, actors.manager, strict, opts)).toMatchObject({ allowed: true });
  });
});

describe('closing, reopening and cancelling', () => {
  it('managers and system close resolved work; requesters do not', () => {
    expect(evaluateTransition('close', wo('RESOLVED'), actors.system, policy, opts)).toMatchObject({ to: 'CLOSED' });
    expect(evaluateTransition('close', wo('RESOLVED'), actors.requester, policy, opts)).toMatchObject({ allowed: false });
  });

  it('reopen returns to ASSIGNED when the previous technician is still active, else OPEN', () => {
    expect(evaluateTransition('reopen', wo('RESOLVED'), actors.manager, policy, opts)).toMatchObject({ to: 'ASSIGNED' });
    expect(
      evaluateTransition('reopen', wo('RESOLVED'), actors.manager, policy, { now: NOW, previousAssigneeActive: false }),
    ).toMatchObject({ to: 'OPEN' });
  });

  it('requesters reopen only within the reopen window', () => {
    expect(evaluateTransition('reopen', wo('RESOLVED'), actors.requester, policy, opts)).toMatchObject({ allowed: true });
    const late = { ...opts, now: new Date('2026-05-30T00:00:00Z') };
    expect(evaluateTransition('reopen', wo('CLOSED'), actors.requester, policy, late)).toMatchObject({ code: 'REOPEN_WINDOW_EXPIRED' });
    expect(evaluateTransition('reopen', wo('CLOSED'), actors.manager, policy, late)).toMatchObject({ allowed: true });
  });

  it('requesters cancel only their own OPEN requests', () => {
    expect(evaluateTransition('cancel', wo('OPEN'), actors.requester, policy, opts)).toMatchObject({ to: 'CANCELLED' });
    expect(evaluateTransition('cancel', wo('ASSIGNED'), actors.requester, policy, opts)).toMatchObject({ allowed: false });
    expect(evaluateTransition('cancel', wo('OPEN'), actors.strangerRequester, policy, opts)).toMatchObject({ allowed: false });
    expect(evaluateTransition('cancel', wo('IN_PROGRESS'), actors.manager, policy, opts)).toMatchObject({ allowed: true });
  });
});

describe('getAvailableActions', () => {
  it('reflects role-specific affordances', () => {
    expect(getAvailableActions(wo('ASSIGNED'), actors.tech, policy, NOW)).toEqual(['unassign', 'start']);
    expect(getAvailableActions(wo('OPEN'), actors.requester, policy, NOW)).toEqual(['cancel']);
    expect(getAvailableActions(wo('PENDING_VERIFICATION'), actors.requester, policy, NOW)).toEqual(['approve', 'reject']);
    expect(getAvailableActions(wo('OPEN'), actors.manager, policy, NOW)).toEqual(['assign', 'cancel']);
  });
});

describe('validateResolutionSubmission', () => {
  it('collects every unmet precondition', () => {
    expect(
      validateResolutionSubmission({ notes: 'short', openRequiredChecklistItems: 2, evidenceCount: 0, requireEvidencePhoto: true }),
    ).toEqual(['NOTES_REQUIRED', 'CHECKLIST_INCOMPLETE', 'EVIDENCE_REQUIRED']);
  });

  it('evidence is optional when the policy says so', () => {
    expect(
      validateResolutionSubmission({ notes: 'Replaced the capacitor and tested.', openRequiredChecklistItems: 0, evidenceCount: 0, requireEvidencePhoto: false }),
    ).toEqual([]);
  });
});
