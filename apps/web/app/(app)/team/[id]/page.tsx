'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Gauge, ShieldCheck, Trash2, Users, Wrench } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, formatMinutes, formatWorkOrderNumber, type MemberProfileDto, type Role } from '@fixflow/shared';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Avatar, Badge, Card, CardHeader, EmptyState, Skeleton } from '@/components/ui/display';
import { NativeSelect } from '@/components/ui/input';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/work-orders/badges';
import { api, errorMessage } from '@/lib/api';
import { formatDate, percent, timeAgo } from '@/lib/format';
import { useCategories } from '@/lib/queries';
import { qk } from '@/lib/query-client';
import { useActor } from '@/lib/session';

export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { can, user } = useActor();
  const categories = useCategories();
  const q = useQuery({ queryKey: qk.member(id), queryFn: () => api<MemberProfileDto>(`/members/${id}`) });
  const m = q.data;
  // Unsaved skill edits layered over the server copy.
  const [skillEdits, setSkillEdits] = useState<Record<string, number>>({});
  const savedSkills: Record<string, number> = m ? Object.fromEntries(m.skills.map((s) => [s.categoryId, s.level])) : {};
  const skills = { ...savedSkills, ...skillEdits };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.member(id) });
    void qc.invalidateQueries({ queryKey: ['members'] });
  };
  const update = useMutation({
    mutationFn: (body: object) => api(`/members/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { toast.success('Member updated'); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveSkills = useMutation({
    mutationFn: () => api(`/members/${id}/skills`, { method: 'PUT', body: { skills: Object.entries(skills).filter(([, l]) => l > 0).map(([categoryId, level]) => ({ categoryId, level })) } }),
    onSuccess: () => { toast.success('Skills saved'); setSkillEdits({}); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isError) return <Card><EmptyState icon={<Users />} title="Member not found" /></Card>;
  if (!m) return <Skeleton className="h-64" />;
  const self = m.userId === user?.id;
  const dirty = Object.entries(skillEdits).some(([categoryId, level]) => (savedSkills[categoryId] ?? 0) !== level);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-[13px] text-ink-3">
        <Link href="/team" className="hover:text-ink">Team</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-ink-2">{m.name}</span>
      </nav>
      <header className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={m.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold">{m.name}</h1>
          <p className="text-sm text-ink-3">{m.jobTitle ?? ROLE_LABELS[m.role]} · {m.email} · joined {formatDate(m.joinedAt)}</p>
        </div>
        <Badge tone={m.status === 'ACTIVE' ? 'green' : 'red'} dot>{m.status === 'ACTIVE' ? 'Active' : 'Suspended'}</Badge>
      </header>

      {m.role === 'TECHNICIAN' && (
        <section aria-label="Performance (30 days)" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Open jobs" icon={<Wrench />} value={m.openJobs} />
          <StatTile label="Completed (30d)" icon={<ShieldCheck />} value={m.stats.completedLast30d} />
          <StatTile label="Avg. resolution" icon={<Gauge />} value={m.stats.avgResolutionMinutes === null ? '—' : formatMinutes(m.stats.avgResolutionMinutes)} />
          <StatTile label="SLA met" icon={<ShieldCheck />} value={percent(m.stats.slaMetRate)} hint={`Rework ${percent(m.stats.reworkRate)}`} />
        </section>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid min-w-0 gap-4">
          {m.role === 'TECHNICIAN' && (
            <Card>
              <CardHeader
                title="Skills"
                description="Used to rank technicians for assignment (1 = can assist, 3 = expert)"
                action={can('team.manageSkills') && <Button size="xs" disabled={!dirty} loading={saveSkills.isPending} onClick={() => saveSkills.mutate()}>Save skills</Button>}
              />
              <ul className="grid gap-1 px-5 pb-4 sm:grid-cols-2">
                {(categories.data ?? []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-sunken">
                    <span className="text-sm text-ink">{c.name}</span>
                    <span role="radiogroup" aria-label={`${c.name} skill level`} className="inline-flex rounded-md border border-line bg-surface p-0.5">
                      {[0, 1, 2, 3].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          role="radio"
                          aria-checked={(skills[c.id] ?? 0) === lvl}
                          disabled={!can('team.manageSkills')}
                          onClick={() => setSkillEdits((s) => ({ ...s, [c.id]: lvl }))}
                          className={`h-6 w-7 rounded text-xs font-medium transition-colors ${(skills[c.id] ?? 0) === lvl ? 'bg-brand text-white' : 'text-ink-3 hover:text-ink'}`}
                        >
                          {lvl === 0 ? '–' : lvl}
                        </button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Recent work" />
            {m.recentWorkOrders.length === 0 ? (
              <EmptyState compact icon={<Wrench />} title="No work orders yet" />
            ) : (
              <ul className="divide-y divide-line-subtle px-2 pb-2">
                {m.recentWorkOrders.map((w) => (
                  <li key={w.id}>
                    <button type="button" onClick={() => router.push(`/work-orders/${w.number}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface-sunken">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink"><span className="mr-1.5 font-mono text-xs text-ink-3">{formatWorkOrderNumber(w.number)}</span>{w.title}</span>
                      <span className="hidden text-xs text-ink-3 sm:inline">{timeAgo(w.updatedAt)}</span>
                      <StatusBadge status={w.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card>
          <CardHeader title="Access" description={self ? 'You can’t change your own role or status.' : undefined} />
          <div className="grid gap-4 px-5 pb-5">
            <div>
              <label htmlFor="role" className="text-[13px] font-medium text-ink-2">Role</label>
              <NativeSelect id="role" className="mt-1.5" value={m.role} disabled={self || !can('team.manage') || update.isPending} onChange={(e) => update.mutate({ role: e.target.value as Role })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </NativeSelect>
              <p className="mt-1.5 text-xs text-ink-3">{ROLE_DESCRIPTIONS[m.role]}</p>
            </div>
            {m.role === 'TECHNICIAN' && (
              <label className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
                Available for assignments
                <Switch checked={m.isAvailable} disabled={!can('team.manageSkills') || update.isPending} onCheckedChange={(v) => update.mutate({ isAvailable: v })} />
              </label>
            )}
            {can('team.manage') && !self && (
              <Button
                variant={m.status === 'ACTIVE' ? 'danger-ghost' : 'secondary'}
                className="justify-start"
                loading={update.isPending}
                onClick={() => update.mutate({ status: m.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}
              >
                <Trash2 /> {m.status === 'ACTIVE' ? 'Suspend access' : 'Restore access'}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
