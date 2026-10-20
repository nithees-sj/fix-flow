import { Controller, Get, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Database } from '@fixflow/db';
import { PRIORITIES, formatWorkOrderNumber, publicReportSchema, type CategoryColor, type CategoryIcon, type PublicReportContext } from '@fixflow/shared';
import { z } from 'zod';
import type { AuthState } from '../../common/auth/actor.js';
import { OptionalAuth, Public } from '../../common/auth/decorators.js';
import { AppError, forbidden, notFound, unauthenticated } from '../../common/errors.js';
import { ZBody } from '../../common/zod.js';
import { DATABASE } from '../../infra/tokens.js';
import { LocationIndex } from '../locations/location-index.js';
import { WorkOrdersService } from '../work-orders/work-orders.service.js';
import { inSequence } from '../../common/sequential.js';

const TOKEN_RE = /^[\w-]{16,64}$/;

/** Authenticated members may omit guest fields; guests must provide them (PUBLIC mode only). */
const submitSchema = publicReportSchema.extend({
  guestName: publicReportSchema.shape.guestName.optional(),
  guestContact: publicReportSchema.shape.guestContact.optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
});

interface Target {
  organizationId: string;
  organizationName: string;
  qrReportingMode: 'AUTHENTICATED' | 'PUBLIC';
  assetId: string | null;
  locationId: string;
  categoryId: string | null;
}

/**
 * QR reporting. A printed label holds an unguessable, rotatable token. The public endpoint
 * resolves it with the system role (the visitor has no tenant context yet — audited system
 * path) and returns ONLY what the form needs: organization display name, the asset/location
 * name and the category list. Never ids of people, other work orders, or internal data.
 */
@ApiTags('public')
@Public()
@Controller('public/report')
export class PublicReportController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly workOrders: WorkOrdersService,
  ) {}

  private async resolve(token: string): Promise<Target> {
    if (!TOKEN_RE.test(token)) throw notFound('Report link');
    const s = this.db.system;
    const asset = await s.asset.findUnique({
      where: { publicReportToken: token },
      select: { id: true, locationId: true, categoryId: true, archivedAt: true, organization: { select: { id: true, name: true, qrReportingMode: true } } },
    });
    if (asset && !asset.archivedAt) {
      return { organizationId: asset.organization.id, organizationName: asset.organization.name, qrReportingMode: asset.organization.qrReportingMode, assetId: asset.id, locationId: asset.locationId, categoryId: asset.categoryId };
    }
    const loc = await s.location.findUnique({
      where: { publicReportToken: token },
      select: { id: true, archivedAt: true, organization: { select: { id: true, name: true, qrReportingMode: true } } },
    });
    if (loc && !loc.archivedAt) {
      return { organizationId: loc.organization.id, organizationName: loc.organization.name, qrReportingMode: loc.organization.qrReportingMode, assetId: null, locationId: loc.id, categoryId: null };
    }
    throw notFound('Report link');
  }

  @Get(':token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Public: minimal context for the QR report form' })
  async context(@Param('token') token: string): Promise<PublicReportContext> {
    const t = await this.resolve(token);
    // Reads below run under the resolved tenant's RLS context.
    return this.db.tx({ organizationId: t.organizationId, userId: null }, async (tx) => {
      const [categories, idx, asset] = await inSequence(
        () => tx.category.findMany({ where: { organizationId: t.organizationId, archivedAt: null }, select: { id: true, name: true, icon: true, color: true }, orderBy: { name: 'asc' } }),
        () => LocationIndex.load(tx, t.organizationId),
        () => t.assetId ? tx.asset.findUniqueOrThrow({ where: { id: t.assetId }, select: { name: true, assetTag: true } }) : null,
      );
      const loc = idx.get(t.locationId);
      return {
        organizationName: t.organizationName,
        qrReportingMode: t.qrReportingMode,
        target: asset
          ? { kind: 'asset', id: t.assetId!, name: asset.name, assetTag: asset.assetTag, locationName: loc?.name ?? '' }
          : { kind: 'location', id: t.locationId, name: loc?.name ?? '', path: idx.path(t.locationId) },
        categories: categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon as CategoryIcon, color: c.color as CategoryColor })),
        defaultCategoryId: t.categoryId,
      };
    });
  }

  @Post(':token')
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000, blockDuration: 10 * 60_000 } })
  @ApiOperation({ summary: 'Submit a report from a QR label (members, or guests when the organization allows it)' })
  async submit(
    @Param('token') token: string,
    @OptionalAuth() auth: AuthState | null,
    @ZBody(submitSchema) body: z.output<typeof submitSchema>,
  ): Promise<{ reference: string; workOrderNumber: number; trackable: boolean }> {
    const t = await this.resolve(token);
    const categoryId = body.categoryId ?? t.categoryId;
    if (!categoryId) throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Choose a category', { errors: [{ path: 'categoryId', message: 'Choose a category' }] });

    // Signed-in visitor: must be an ACTIVE member of the organization that owns the label.
    let member: { userId: string; role: string } | null = null;
    if (auth) {
      const m = await this.db.system.membership.findUnique({
        where: { organizationId_userId: { organizationId: t.organizationId, userId: auth.userId } },
        select: { status: true, role: true },
      });
      if (m?.status === 'ACTIVE') member = { userId: auth.userId, role: m.role };
    }
    if (!member) {
      if (t.qrReportingMode !== 'PUBLIC') {
        throw auth ? forbidden('Only members of this organization can report issues here.') : unauthenticated('Sign in to report an issue.');
      }
      if (!body.guestName || !body.guestContact) {
        throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Tell us who you are so we can follow up.', {
          errors: [
            ...(!body.guestName ? [{ path: 'guestName', message: 'Enter your name' }] : []),
            ...(!body.guestContact ? [{ path: 'guestContact', message: 'Enter an email or phone number' }] : []),
          ],
        });
      }
    }

    const created = await this.db.tx({ organizationId: t.organizationId, userId: member?.userId ?? null }, (tx) =>
      this.workOrders.createInTx(
        tx,
        { organizationId: t.organizationId, userId: member?.userId ?? null, role: member?.role },
        {
          title: body.title,
          description: body.description,
          priority: member ? body.priority : 'MEDIUM', // guests cannot self-escalate; managers triage
          categoryId,
          locationId: t.locationId,
          assetId: t.assetId,
          qrToken: token,
        },
        member ? { source: 'QR' } : { source: 'GUEST_QR', guest: { name: body.guestName!, contact: body.guestContact! } },
      ),
    );
    this.workOrders.afterCommit(
      t.organizationId,
      { id: created.id, number: created.number, version: 1, status: 'OPEN', requester: member ? { id: member.userId } : null, assignee: null },
      created.notifications,
      true,
    );
    return { reference: formatWorkOrderNumber(created.number), workOrderNumber: created.number, trackable: !!member };
  }
}
