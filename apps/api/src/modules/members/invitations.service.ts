import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { isUniqueViolation, type Database } from '@fixflow/db';
import {
  ROLE_LABELS,
  type AcceptInvitationInput,
  type CreateInvitationsInput,
  type InvitationDto,
  type Role,
} from '@fixflow/shared';
import { ENV, type Env } from '../../config/env.js';
import type { Actor, AuthState } from '../../common/auth/actor.js';
import type { ClientInfo } from '../../common/auth/decorators.js';
import { AppError, badRequest, forbidden, notFound } from '../../common/errors.js';
import { AuditService } from '../../infra/audit.service.js';
import { OutboxService } from '../../infra/outbox.service.js';
import { DATABASE } from '../../infra/tokens.js';
import { hashPassword, newSecret, sha256 } from '../auth/crypto.js';
import { SessionService, type IssuedTokens } from '../auth/session.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';

const INVITE_TTL_MS = 7 * 86_400_000;

type InvitationRow = {
  id: string;
  email: string;
  role: Role;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedBy: { id: string; name: string } | null;
};

const toDto = (i: InvitationRow): InvitationDto => ({
  id: i.id,
  email: i.email,
  role: i.role,
  invitedBy: i.invitedBy,
  createdAt: i.createdAt.toISOString(),
  expiresAt: i.expiresAt.toISOString(),
  status: i.acceptedAt ? 'ACCEPTED' : i.revokedAt ? 'REVOKED' : i.expiresAt.getTime() < Date.now() ? 'EXPIRED' : 'PENDING',
});

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly sessions: SessionService,
    private readonly orgs: OrganizationsService,
  ) {}

  list(actor: Actor): Promise<InvitationDto[]> {
    return this.db.tx(actor.ctx, async (tx) => {
      const rows = await tx.invitation.findMany({
        where: { organizationId: actor.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { invitedBy: { select: { id: true, name: true } } },
      });
      return rows.map(toDto);
    });
  }

  async create(actor: Actor, input: CreateInvitationsInput): Promise<{ invited: InvitationDto[]; skipped: { email: string; reason: string }[] }> {
    const result = await this.db.tx(actor.ctx, async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true } });
      const inviter = await tx.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } });
      const invited: InvitationDto[] = [];
      const skipped: { email: string; reason: string }[] = [];
      for (const inv of input.invitations) {
        if (inv.role === 'ORG_ADMIN' && actor.role !== 'ORG_ADMIN') {
          skipped.push({ email: inv.email, reason: 'Only admins can invite admins' });
          continue;
        }
        const member = await tx.membership.findFirst({ where: { organizationId: actor.organizationId, user: { email: inv.email } } });
        if (member) {
          skipped.push({ email: inv.email, reason: 'Already a member' });
          continue;
        }
        // One live invitation per email: revoke older pending ones.
        await tx.invitation.updateMany({
          where: { organizationId: actor.organizationId, email: inv.email, acceptedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        const secret = newSecret();
        const row = await tx.invitation.create({
          data: {
            organizationId: actor.organizationId,
            email: inv.email,
            role: inv.role,
            tokenHash: secret.hash,
            invitedById: actor.userId,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          },
          include: { invitedBy: { select: { id: true, name: true } } },
        });
        await this.outbox.add(tx, actor.organizationId, 'email.send', {
          to: inv.email,
          template: 'invitation',
          data: {
            organizationName: org.name,
            inviterName: inviter.name,
            role: ROLE_LABELS[inv.role].toLowerCase(),
            url: `${this.env.APP_WEB_URL}/invite/${secret.token}`,
          },
        });
        await this.audit.record(tx, actor, { action: 'invitation.created', entityType: 'Invitation', entityId: row.id, metadata: { email: inv.email, role: inv.role } });
        invited.push(toDto(row));
      }
      return { invited, skipped };
    });
    this.outbox.nudge();
    return result;
  }

  async revoke(actor: Actor, id: string): Promise<void> {
    await this.db.tx(actor.ctx, async (tx) => {
      const res = await tx.invitation.updateMany({
        where: { id, organizationId: actor.organizationId, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!res.count) throw notFound('Invitation');
      await this.audit.record(tx, actor, { action: 'invitation.revoked', entityType: 'Invitation', entityId: id });
    });
  }

  async resend(actor: Actor, id: string): Promise<InvitationDto> {
    const inv = await this.db.tx(actor.ctx, (tx) => tx.invitation.findFirst({ where: { id, organizationId: actor.organizationId } }));
    if (!inv || inv.acceptedAt) throw notFound('Invitation');
    const { invited } = await this.create(actor, { invitations: [{ email: inv.email, role: inv.role }] });
    if (!invited[0]) throw badRequest('Could not resend this invitation');
    return invited[0];
  }

  /**
   * System path: the invitation token is the credential. Returns only what the invite
   * screen needs (no other organization data).
   */
  async lookup(token: string) {
    const inv = await this.db.system.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { organization: { select: { name: true } }, invitedBy: { select: { name: true } } },
    });
    if (!inv || inv.revokedAt) throw notFound('Invitation');
    const accountExists = (await this.db.system.user.count({ where: { email: inv.email } })) > 0;
    return {
      organizationName: inv.organization.name,
      email: inv.email,
      role: inv.role,
      inviterName: inv.invitedBy?.name ?? null,
      accountExists,
      status: inv.acceptedAt ? 'ACCEPTED' : inv.expiresAt.getTime() < Date.now() ? 'EXPIRED' : 'PENDING',
    } as const;
  }

  /**
   * Accepts an invitation. Signed-in users must be the invited email. Visitors without an
   * account create one here (the token proves control of the inbox, so the email is verified).
   */
  async accept(
    input: AcceptInvitationInput,
    auth: AuthState | null,
    client: ClientInfo,
  ): Promise<{ organizationId: string; tokens: IssuedTokens | null; userId: string }> {
    const inv = await this.db.system.invitation.findUnique({ where: { tokenHash: sha256(input.token) } });
    if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt.getTime() < Date.now()) {
      throw badRequest('This invitation is no longer valid. Ask an admin to send a new one.', 'INVALID_TOKEN');
    }
    let userId: string;
    let tokens: IssuedTokens | null = null;
    const existing = await this.db.system.user.findUnique({ where: { email: inv.email }, select: { id: true } });
    if (auth) {
      if (!existing || existing.id !== auth.userId) throw forbidden(`This invitation was sent to ${inv.email}. Sign in with that account.`);
      userId = auth.userId;
    } else if (existing) {
      throw new AppError(HttpStatus.CONFLICT, 'CONFLICT', 'An account already exists for this email. Sign in to accept the invitation.');
    } else {
      if (!input.name || !input.password) throw badRequest('Enter your name and choose a password');
      const passwordHash = await hashPassword(input.password);
      try {
        const u = await this.db.system.user.create({
          data: { email: inv.email, name: input.name, passwordHash, emailVerifiedAt: new Date() },
          select: { id: true },
        });
        userId = u.id;
      } catch (e) {
        if (isUniqueViolation(e)) throw new AppError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'An account already exists for this email.');
        throw e;
      }
    }

    await this.db.tx({ organizationId: inv.organizationId, userId }, async (tx) => {
      const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date() } });
      if (!claimed.count) throw badRequest('This invitation was already used.', 'INVALID_TOKEN');
      await tx.membership.upsert({
        where: { organizationId_userId: { organizationId: inv.organizationId, userId } },
        create: { organizationId: inv.organizationId, userId, role: inv.role },
        update: { role: inv.role, status: 'ACTIVE' },
        select: { id: true },
      });
      await this.audit.record(tx, { organizationId: inv.organizationId, userId, ...client }, {
        action: 'invitation.accepted',
        entityType: 'Invitation',
        entityId: inv.id,
        metadata: { email: inv.email, role: inv.role },
      });
    });
    await this.orgs.invalidateMembership(inv.organizationId, userId);

    if (auth) await this.sessions.setActiveOrganization(auth.sessionId, inv.organizationId);
    else tokens = await this.sessions.create(userId, inv.organizationId, client);
    return { organizationId: inv.organizationId, tokens, userId };
  }
}
