import type { Role, WorkOrderStatus } from './enums.js';

/**
 * Work-order lifecycle state machine.
 *
 * Every status change in FixFlow goes through `evaluateTransition`. The API calls it
 * before writing (authoritative); the web app calls `getAvailableActions` to decide
 * which buttons to render (convenience only — never a security boundary).
 */

export const WORK_ORDER_ACTIONS = [
  'assign',
  'reassign',
  'unassign',
  'start',
  'hold',
  'resume',
  'submit_resolution',
  'approve',
  'reject',
  'close',
  'reopen',
  'cancel',
] as const;
export type WorkOrderAction = (typeof WORK_ORDER_ACTIONS)[number];

export type ActorRole = Role | 'SYSTEM';

export interface WorkflowActor {
  /** null only for SYSTEM actors (worker automation). */
  userId: string | null;
  role: ActorRole;
}

export interface WorkflowPolicy {
  requesterCanVerify: boolean;
  technicianSelfAssign: boolean;
  reopenWindowDays: number;
}

export interface WorkflowWorkOrder {
  status: WorkOrderStatus;
  requesterId: string | null;
  assigneeId: string | null;
  resolvedAt: Date | null;
}

export interface TransitionOptions {
  now: Date;
  /** For assign/reassign: the technician receiving the job. */
  targetAssigneeId?: string | null;
  /** For reopen: whether the previous assignee is still an active technician. */
  previousAssigneeActive?: boolean;
}

export type DenyCode =
  | 'INVALID_STATE'
  | 'NOT_PERMITTED'
  | 'POLICY_DISABLED'
  | 'REOPEN_WINDOW_EXPIRED'
  | 'SELF_VERIFICATION'
  | 'ASSIGNEE_REQUIRED'
  | 'SAME_ASSIGNEE';

export type TransitionResult =
  | { allowed: true; to: WorkOrderStatus; reasonRequired: boolean }
  | { allowed: false; code: DenyCode; message: string };

interface ActionDefinition {
  from: readonly WorkOrderStatus[];
  reasonRequired: boolean;
  label: string;
}

export const ACTION_DEFINITIONS: Record<WorkOrderAction, ActionDefinition> = {
  assign: { from: ['OPEN'], reasonRequired: false, label: 'Assign' },
  reassign: { from: ['ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'], reasonRequired: false, label: 'Reassign' },
  unassign: { from: ['ASSIGNED'], reasonRequired: true, label: 'Unassign' },
  start: { from: ['ASSIGNED'], reasonRequired: false, label: 'Start work' },
  hold: { from: ['IN_PROGRESS'], reasonRequired: true, label: 'Put on hold' },
  resume: { from: ['ON_HOLD'], reasonRequired: false, label: 'Resume work' },
  submit_resolution: { from: ['IN_PROGRESS'], reasonRequired: false, label: 'Submit for verification' },
  approve: { from: ['PENDING_VERIFICATION'], reasonRequired: false, label: 'Approve resolution' },
  reject: { from: ['PENDING_VERIFICATION'], reasonRequired: true, label: 'Reject resolution' },
  close: { from: ['RESOLVED'], reasonRequired: false, label: 'Close' },
  reopen: { from: ['RESOLVED', 'CLOSED'], reasonRequired: true, label: 'Reopen' },
  cancel: { from: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD'], reasonRequired: true, label: 'Cancel' },
};

const isManagerial = (role: ActorRole) => role === 'MANAGER' || role === 'ORG_ADMIN';
const DAY_MS = 86_400_000;

const deny = (code: DenyCode, message: string): TransitionResult => ({ allowed: false, code, message });

export function evaluateTransition(
  action: WorkOrderAction,
  wo: WorkflowWorkOrder,
  actor: WorkflowActor,
  policy: WorkflowPolicy,
  opts: TransitionOptions,
): TransitionResult {
  const def = ACTION_DEFINITIONS[action];
  if (!def.from.includes(wo.status)) {
    return deny('INVALID_STATE', `Cannot ${def.label.toLowerCase()} a work order that is ${wo.status}.`);
  }

  const isAssignee = actor.userId !== null && actor.userId === wo.assigneeId;
  const isRequester = actor.userId !== null && actor.userId === wo.requesterId;
  const ok = (to: WorkOrderStatus): TransitionResult => ({
    allowed: true,
    to,
    reasonRequired: def.reasonRequired,
  });

  switch (action) {
    case 'assign': {
      if (!opts.targetAssigneeId) return deny('ASSIGNEE_REQUIRED', 'Choose a technician to assign.');
      if (isManagerial(actor.role) || actor.role === 'SYSTEM') return ok('ASSIGNED');
      if (actor.role === 'TECHNICIAN') {
        if (!policy.technicianSelfAssign) {
          return deny('POLICY_DISABLED', 'Self-assignment is disabled for this organization.');
        }
        if (opts.targetAssigneeId !== actor.userId) {
          return deny('NOT_PERMITTED', 'Technicians can only assign work to themselves.');
        }
        return ok('ASSIGNED');
      }
      return deny('NOT_PERMITTED', 'Only managers can assign work orders.');
    }

    case 'reassign': {
      if (!opts.targetAssigneeId) return deny('ASSIGNEE_REQUIRED', 'Choose a technician to assign.');
      if (opts.targetAssigneeId === wo.assigneeId) {
        return deny('SAME_ASSIGNEE', 'This technician is already assigned.');
      }
      if (isManagerial(actor.role) || actor.role === 'SYSTEM') return ok('ASSIGNED');
      return deny('NOT_PERMITTED', 'Only managers can reassign work orders.');
    }

    case 'unassign':
      if (isManagerial(actor.role) || (actor.role === 'TECHNICIAN' && isAssignee)) return ok('OPEN');
      return deny('NOT_PERMITTED', 'Only a manager or the assigned technician can unassign.');

    case 'start':
      if (actor.role === 'TECHNICIAN' && isAssignee) return ok('IN_PROGRESS');
      return deny('NOT_PERMITTED', 'Only the assigned technician can start work.');

    case 'hold':
      if (isManagerial(actor.role) || (actor.role === 'TECHNICIAN' && isAssignee)) return ok('ON_HOLD');
      return deny('NOT_PERMITTED', 'Only a manager or the assigned technician can put work on hold.');

    case 'resume':
      if (isManagerial(actor.role) || (actor.role === 'TECHNICIAN' && isAssignee)) {
        return ok('IN_PROGRESS');
      }
      return deny('NOT_PERMITTED', 'Only a manager or the assigned technician can resume work.');

    case 'submit_resolution':
      if (actor.role === 'TECHNICIAN' && isAssignee) return ok('PENDING_VERIFICATION');
      return deny('NOT_PERMITTED', 'Only the assigned technician can submit a resolution.');

    case 'approve':
    case 'reject': {
      // Separation of duties: nobody verifies their own repair.
      if (isAssignee) return deny('SELF_VERIFICATION', 'You cannot verify your own work.');
      const to: WorkOrderStatus = action === 'approve' ? 'RESOLVED' : 'IN_PROGRESS';
      if (isManagerial(actor.role)) return ok(to);
      if (isRequester) {
        if (!policy.requesterCanVerify) {
          return deny('POLICY_DISABLED', 'Requester verification is disabled; a manager will review.');
        }
        return ok(to);
      }
      return deny('NOT_PERMITTED', 'Only the requester or a manager can review this resolution.');
    }

    case 'close':
      if (isManagerial(actor.role) || actor.role === 'SYSTEM') return ok('CLOSED');
      return deny('NOT_PERMITTED', 'Only managers can close work orders.');

    case 'reopen': {
      const to: WorkOrderStatus =
        wo.assigneeId && opts.previousAssigneeActive ? 'ASSIGNED' : 'OPEN';
      if (isManagerial(actor.role)) return ok(to);
      if (isRequester) {
        const resolvedAt = wo.resolvedAt?.getTime();
        const windowEnd = resolvedAt !== undefined ? resolvedAt + policy.reopenWindowDays * DAY_MS : 0;
        if (opts.now.getTime() > windowEnd) {
          return deny(
            'REOPEN_WINDOW_EXPIRED',
            `Requests can be reopened within ${policy.reopenWindowDays} days of resolution.`,
          );
        }
        return ok(to);
      }
      return deny('NOT_PERMITTED', 'Only the requester or a manager can reopen this work order.');
    }

    case 'cancel':
      if (isManagerial(actor.role)) return ok('CANCELLED');
      if (isRequester && wo.status === 'OPEN') return ok('CANCELLED');
      return deny('NOT_PERMITTED', 'You cannot cancel this work order.');
  }
}

/**
 * Actions the actor could take right now. Assignment actions are evaluated with a
 * placeholder target (self for technicians) so the UI can offer "Assign to me".
 */
export function getAvailableActions(
  wo: WorkflowWorkOrder,
  actor: WorkflowActor,
  policy: WorkflowPolicy,
  now: Date,
): WorkOrderAction[] {
  return WORK_ORDER_ACTIONS.filter((action) => {
    const target =
      action === 'assign' || action === 'reassign'
        ? actor.role === 'TECHNICIAN'
          ? actor.userId
          : '__any__'
        : undefined;
    return evaluateTransition(action, wo, actor, policy, {
      now,
      targetAssigneeId: target,
      previousAssigneeActive: true,
    }).allowed;
  });
}

export type SubmissionIssue = 'NOTES_REQUIRED' | 'CHECKLIST_INCOMPLETE' | 'EVIDENCE_REQUIRED';

/** Preconditions for entering PENDING_VERIFICATION, beyond the state/role check. */
export function validateResolutionSubmission(input: {
  notes: string;
  openRequiredChecklistItems: number;
  evidenceCount: number;
  requireEvidencePhoto: boolean;
}): SubmissionIssue[] {
  const issues: SubmissionIssue[] = [];
  if (input.notes.trim().length < 10) issues.push('NOTES_REQUIRED');
  if (input.openRequiredChecklistItems > 0) issues.push('CHECKLIST_INCOMPLETE');
  if (input.requireEvidencePhoto && input.evidenceCount < 1) issues.push('EVIDENCE_REQUIRED');
  return issues;
}

export const SUBMISSION_ISSUE_MESSAGES: Record<SubmissionIssue, string> = {
  NOTES_REQUIRED: 'Describe the work performed (at least 10 characters).',
  CHECKLIST_INCOMPLETE: 'Complete all required checklist items first.',
  EVIDENCE_REQUIRED: 'Attach at least one photo of the completed repair.',
};
