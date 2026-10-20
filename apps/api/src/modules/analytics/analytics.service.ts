import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Database, type Tx } from '@fixflow/db';
import {
  PRIORITIES,
  STATUS_META,
  formatWorkOrderNumber,
  type AnalyticsReport,
  type CategoryColor,
  type DashboardSummary,
  type Priority,
  type WorkOrderStatus,
} from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { DATABASE } from '../../infra/tokens.js';
import { bucketKeys, granularityFor, type Granularity } from './buckets.js';

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Math.round(Number(v)));
const rate = (met: number, total: number): number | null => (total > 0 ? met / total : null);

/**
 * All analytics are computed in SQL inside a tenant transaction: RLS confines every row to
 * the organization, and each query ALSO filters organization_id explicitly (defense in depth).
 * `scope` narrows dashboards for technicians (their jobs) and requesters (their requests).
 * Every query uses Prisma.sql tagged templates — parameters are never string-concatenated.
 */
@Injectable()
export class AnalyticsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scope(actor: Actor): Prisma.Sql {
    if (actor.role === 'TECHNICIAN') return Prisma.sql`AND w.assignee_id = ${actor.userId}::uuid`;
    if (actor.role === 'REQUESTER') return Prisma.sql`AND w.requester_id = ${actor.userId}::uuid`;
    return Prisma.empty;
  }

  async dashboard(actor: Actor, from: Date, to: Date): Promise<DashboardSummary> {
    return this.db.tx(actor.ctx, async (tx) => {
      const org = actor.organizationId;
      const tz = await this.timezone(tx, org);
      const scope = this.scope(actor);
      const now = new Date();

      const [snapshot] = await tx.$queryRaw<Record<string, bigint>[]>(Prisma.sql`
        SELECT
          count(*) FILTER (WHERE w.created_at BETWEEN ${from} AND ${to}) AS total,
          count(*) FILTER (WHERE w.status = 'OPEN') AS open,
          count(*) FILTER (WHERE w.status IN ('ASSIGNED','IN_PROGRESS','ON_HOLD')) AS in_progress,
          count(*) FILTER (WHERE w.status = 'PENDING_VERIFICATION') AS pending,
          count(*) FILTER (WHERE w.resolved_at BETWEEN ${from} AND ${to}) AS resolved,
          count(*) FILTER (WHERE w.status IN ('OPEN','ASSIGNED','IN_PROGRESS','ON_HOLD','PENDING_VERIFICATION')
            AND ((w.responded_at IS NULL AND w.response_due_at < ${now}) OR (w.resolution_submitted_at IS NULL AND w.resolution_due_at < ${now}))) AS overdue
        FROM work_orders w
        WHERE w.organization_id = ${org}::uuid ${scope}`);

      const [times] = await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        SELECT
          avg(extract(epoch FROM (w.responded_at - w.cycle_started_at)) / 60) FILTER (WHERE w.responded_at BETWEEN ${from} AND ${to}) AS avg_response,
          avg(extract(epoch FROM (w.resolution_submitted_at - w.cycle_started_at)) / 60) FILTER (WHERE w.resolved_at BETWEEN ${from} AND ${to}) AS avg_resolution
        FROM work_orders w
        WHERE w.organization_id = ${org}::uuid ${scope}`);

      const sla = await this.slaCompliance(tx, org, scope, from, to, now);

      const byPriority = await tx.$queryRaw<{ priority: Priority; open: bigint; total: bigint }[]>(Prisma.sql`
        SELECT w.priority,
          count(*) FILTER (WHERE w.status IN ('OPEN','ASSIGNED','IN_PROGRESS','ON_HOLD','PENDING_VERIFICATION')) AS open,
          count(*) FILTER (WHERE w.created_at BETWEEN ${from} AND ${to}) AS total
        FROM work_orders w WHERE w.organization_id = ${org}::uuid ${scope}
        GROUP BY w.priority`);

      const keys = bucketKeys(from, to, tz, 'day');
      const created = await this.bucketCounts(tx, org, scope, 'created_at', 'day', tz, from, to);
      const resolved = await this.bucketCounts(tx, org, scope, 'resolved_at', 'day', tz, from, to);

      const workload = await tx.$queryRaw<{ user_id: string; name: string; assigned: bigint; in_progress: bigint; on_hold: bigint; completed: bigint }[]>(Prisma.sql`
        SELECT m.user_id, u.name,
          count(w.id) FILTER (WHERE w.status = 'ASSIGNED') AS assigned,
          count(w.id) FILTER (WHERE w.status = 'IN_PROGRESS') AS in_progress,
          count(w.id) FILTER (WHERE w.status = 'ON_HOLD') AS on_hold,
          count(w.id) FILTER (WHERE w.resolved_at BETWEEN ${from} AND ${to}) AS completed
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        LEFT JOIN work_orders w ON w.organization_id = m.organization_id AND w.assignee_id = m.user_id
        WHERE m.organization_id = ${org}::uuid AND m.role = 'TECHNICIAN' AND m.status = 'ACTIVE'
          ${actor.role === 'TECHNICIAN' ? Prisma.sql`AND m.user_id = ${actor.userId}::uuid` : Prisma.empty}
        GROUP BY m.user_id, u.name
        ORDER BY (count(w.id) FILTER (WHERE w.status IN ('ASSIGNED','IN_PROGRESS','ON_HOLD'))) DESC, u.name
        LIMIT 12`);

      const activity = await tx.$queryRaw<{ id: string; at: Date; actor_id: string | null; actor_name: string | null; to_status: WorkOrderStatus; from_status: WorkOrderStatus | null; wo_id: string; number: number; title: string }[]>(Prisma.sql`
        SELECT h.id, h.created_at AS at, h.actor_id, u.name AS actor_name, h.to_status, h.from_status, w.id AS wo_id, w.number, w.title
        FROM work_order_status_history h
        JOIN work_orders w ON w.id = h.work_order_id AND w.organization_id = h.organization_id
        LEFT JOIN users u ON u.id = h.actor_id
        WHERE h.organization_id = ${org}::uuid ${scope}
        ORDER BY h.created_at DESC
        LIMIT 12`);

      const s = snapshot ?? {};
      return {
        range: { from: from.toISOString(), to: to.toISOString() },
        totals: {
          total: num(s.total),
          open: num(s.open),
          inProgress: num(s.in_progress),
          pendingVerification: num(s.pending),
          resolved: num(s.resolved),
          overdue: num(s.overdue),
        },
        avgResponseMinutes: numOrNull(times?.avg_response),
        avgResolutionMinutes: numOrNull(times?.avg_resolution),
        slaCompliance: sla,
        byPriority: PRIORITIES.map((p) => {
          const r = byPriority.find((x) => x.priority === p);
          return { priority: p, open: num(r?.open), total: num(r?.total) };
        }),
        volume: keys.map((date) => ({ date, created: created.get(date) ?? 0, resolved: resolved.get(date) ?? 0 })),
        technicianWorkload: workload.map((w) => ({
          userId: w.user_id,
          name: w.name,
          assigned: num(w.assigned),
          inProgress: num(w.in_progress),
          onHold: num(w.on_hold),
          completed: num(w.completed),
        })),
        recentActivity: activity.map((a) => ({
          id: a.id,
          at: a.at.toISOString(),
          actor: a.actor_id ? { id: a.actor_id, name: a.actor_name ?? 'Someone' } : null,
          summary:
            a.from_status === null
              ? `reported ${formatWorkOrderNumber(a.number)} · ${a.title}`
              : `moved ${formatWorkOrderNumber(a.number)} to ${STATUS_META[a.to_status].label}`,
          workOrderId: a.wo_id,
          workOrderNumber: a.number,
        })),
      };
    });
  }

  async report(actor: Actor, from: Date, to: Date): Promise<AnalyticsReport> {
    return this.db.tx(actor.ctx, async (tx) => {
      const org = actor.organizationId;
      const tz = await this.timezone(tx, org);
      const unit = granularityFor(from, to);
      const now = new Date();
      const none = Prisma.empty;
      const inRange = Prisma.sql`w.organization_id = ${org}::uuid AND w.created_at BETWEEN ${from} AND ${to}`;

      const [status, priority, category] = await Promise.all([
        tx.$queryRaw<{ status: WorkOrderStatus; count: bigint }[]>(Prisma.sql`SELECT w.status, count(*) FROM work_orders w WHERE ${inRange} GROUP BY w.status`),
        tx.$queryRaw<{ priority: Priority; count: bigint }[]>(Prisma.sql`SELECT w.priority, count(*) FROM work_orders w WHERE ${inRange} GROUP BY w.priority`),
        tx.$queryRaw<{ id: string; name: string; color: string; count: bigint }[]>(Prisma.sql`
          SELECT c.id, c.name, c.color, count(w.id) FROM work_orders w JOIN categories c ON c.id = w.category_id AND c.organization_id = w.organization_id
          WHERE ${inRange} GROUP BY c.id, c.name, c.color ORDER BY count(w.id) DESC`),
      ]);

      const keys = bucketKeys(from, to, tz, unit);
      const created = await this.bucketCounts(tx, org, none, 'created_at', unit, tz, from, to);
      const resolvedRows = await tx.$queryRaw<{ bucket: string; n: bigint; avg_min: unknown }[]>(Prisma.sql`
        SELECT to_char(date_trunc(${unit}, w.resolved_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS bucket, count(*) AS n,
               avg(extract(epoch FROM (w.resolution_submitted_at - w.cycle_started_at)) / 60) AS avg_min
        FROM work_orders w WHERE w.organization_id = ${org}::uuid AND w.resolved_at BETWEEN ${from} AND ${to}
        GROUP BY 1`);
      const resolvedBy = new Map(resolvedRows.map((r) => [r.bucket, r]));

      const slaRows = await tx.$queryRaw<{ bucket: string; rm: bigint; rx: bigint; sm: bigint; sx: bigint }[]>(Prisma.sql`
        SELECT to_char(date_trunc(${unit}, w.created_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS bucket,
          ${this.slaCounters(now)}
        FROM work_orders w WHERE ${inRange} AND w.status <> 'CANCELLED' GROUP BY 1`);
      const slaBy = new Map(slaRows.map((r) => [r.bucket, r]));

      const slaPriority = await tx.$queryRaw<{ priority: Priority; rm: bigint; rx: bigint; sm: bigint; sx: bigint; total: bigint }[]>(Prisma.sql`
        SELECT w.priority, ${this.slaCounters(now)}, count(*) AS total
        FROM work_orders w WHERE ${inRange} AND w.status <> 'CANCELLED' GROUP BY w.priority`);

      const techs = await tx.$queryRaw<{ user_id: string; name: string; completed: bigint; open: bigint; avg_min: unknown; met: bigint; rework: bigint }[]>(Prisma.sql`
        SELECT m.user_id, u.name,
          count(w.id) FILTER (WHERE w.resolved_at BETWEEN ${from} AND ${to}) AS completed,
          count(w.id) FILTER (WHERE w.status IN ('ASSIGNED','IN_PROGRESS','ON_HOLD')) AS open,
          avg(extract(epoch FROM (w.resolution_submitted_at - w.cycle_started_at)) / 60) FILTER (WHERE w.resolved_at BETWEEN ${from} AND ${to}) AS avg_min,
          count(w.id) FILTER (WHERE w.resolved_at BETWEEN ${from} AND ${to} AND w.resolution_submitted_at <= w.resolution_due_at) AS met,
          count(w.id) FILTER (WHERE w.resolved_at BETWEEN ${from} AND ${to} AND w.rework_count > 0) AS rework
        FROM memberships m JOIN users u ON u.id = m.user_id
        LEFT JOIN work_orders w ON w.organization_id = m.organization_id AND w.assignee_id = m.user_id
        WHERE m.organization_id = ${org}::uuid AND m.role = 'TECHNICIAN'
        GROUP BY m.user_id, u.name ORDER BY completed DESC, u.name`);

      const assets = await tx.$queryRaw<{ id: string; name: string; asset_tag: string; location_id: string; location: string; failures: bigint; last: Date }[]>(Prisma.sql`
        SELECT a.id, a.name, a.asset_tag, l.id AS location_id, l.name AS location, count(w.id) AS failures, max(w.created_at) AS last
        FROM work_orders w
        JOIN assets a ON a.id = w.asset_id AND a.organization_id = w.organization_id
        JOIN locations l ON l.id = a.location_id AND l.organization_id = a.organization_id
        WHERE ${inRange} AND w.source <> 'SCHEDULED'
        GROUP BY a.id, a.name, a.asset_tag, l.id, l.name
        ORDER BY failures DESC, last DESC LIMIT 10`);

      return {
        range: { from: from.toISOString(), to: to.toISOString() },
        granularity: unit,
        statusDistribution: status.map((s) => ({ status: s.status, count: num(s.count) })),
        priorityDistribution: PRIORITIES.map((p) => ({ priority: p, count: num(priority.find((x) => x.priority === p)?.count) })),
        categoryDistribution: category.map((c) => ({ categoryId: c.id, name: c.name, color: c.color as CategoryColor, count: num(c.count) })),
        trend: keys.map((bucket) => ({
          bucket,
          created: created.get(bucket) ?? 0,
          resolved: num(resolvedBy.get(bucket)?.n),
          avgResolutionMinutes: numOrNull(resolvedBy.get(bucket)?.avg_min),
        })),
        sla: keys.map((bucket) => {
          const r = slaBy.get(bucket);
          return { bucket, responseMet: num(r?.rm), responseMissed: num(r?.rx), resolutionMet: num(r?.sm), resolutionMissed: num(r?.sx) };
        }),
        slaByPriority: PRIORITIES.map((p) => {
          const r = slaPriority.find((x) => x.priority === p);
          return {
            priority: p,
            responseRate: rate(num(r?.rm), num(r?.rm) + num(r?.rx)),
            resolutionRate: rate(num(r?.sm), num(r?.sm) + num(r?.sx)),
            total: num(r?.total),
          };
        }),
        technicians: techs.map((t) => ({
          userId: t.user_id,
          name: t.name,
          completed: num(t.completed),
          open: num(t.open),
          avgResolutionMinutes: numOrNull(t.avg_min),
          slaMetRate: rate(num(t.met), num(t.completed)),
          reworkRate: rate(num(t.rework), num(t.completed)),
        })),
        assetFailures: assets.map((a) => ({
          assetId: a.id,
          name: a.name,
          assetTag: a.asset_tag,
          location: a.location,
          failures: num(a.failures),
          lastFailureAt: a.last.toISOString(),
        })),
      };
    });
  }

  /**
   * SLA outcome counters. A clock is evaluated once it completed or its deadline passed:
   *   response met   = responded_at ≤ response_due_at
   *   resolution met = approved resolution submitted ≤ resolution_due_at
   */
  private slaCounters(now: Date): Prisma.Sql {
    return Prisma.sql`
      count(*) FILTER (WHERE w.responded_at IS NOT NULL AND w.responded_at <= w.response_due_at) AS rm,
      count(*) FILTER (WHERE (w.responded_at IS NOT NULL AND w.responded_at > w.response_due_at) OR (w.responded_at IS NULL AND w.response_due_at < ${now})) AS rx,
      count(*) FILTER (WHERE w.resolved_at IS NOT NULL AND w.resolution_submitted_at <= w.resolution_due_at) AS sm,
      count(*) FILTER (WHERE (w.resolved_at IS NOT NULL AND w.resolution_submitted_at > w.resolution_due_at)
                          OR (w.resolved_at IS NULL AND w.resolution_submitted_at IS NULL AND w.resolution_due_at < ${now})) AS sx`;
  }

  private async slaCompliance(tx: Tx, org: string, scope: Prisma.Sql, from: Date, to: Date, now: Date) {
    const [r] = await tx.$queryRaw<{ rm: bigint; rx: bigint; sm: bigint; sx: bigint }[]>(Prisma.sql`
      SELECT ${this.slaCounters(now)}
      FROM work_orders w
      WHERE w.organization_id = ${org}::uuid AND w.created_at BETWEEN ${from} AND ${to} AND w.status <> 'CANCELLED' ${scope}`);
    const rm = num(r?.rm), rx = num(r?.rx), sm = num(r?.sm), sx = num(r?.sx);
    return { response: rate(rm, rm + rx), resolution: rate(sm, sm + sx), overall: rate(rm + sm, rm + rx + sm + sx) };
  }

  private async bucketCounts(tx: Tx, org: string, scope: Prisma.Sql, column: 'created_at' | 'resolved_at', unit: Granularity, tz: string, from: Date, to: Date) {
    const col = Prisma.raw(`w.${column}`); // column name is a fixed literal, never user input
    const rows = await tx.$queryRaw<{ bucket: string; n: bigint }[]>(Prisma.sql`
      SELECT to_char(date_trunc(${unit}, ${col} AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS bucket, count(*) AS n
      FROM work_orders w
      WHERE w.organization_id = ${org}::uuid AND ${col} BETWEEN ${from} AND ${to} ${scope}
      GROUP BY 1`);
    return new Map(rows.map((r) => [r.bucket, num(r.n)]));
  }

  private async timezone(tx: Tx, org: string): Promise<string> {
    const o = await tx.organization.findUniqueOrThrow({ where: { id: org }, select: { timezone: true } });
    return o.timezone;
  }
}
