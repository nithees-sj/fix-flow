'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, RotateCw, Search, UserX, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ROLES, ROLE_LABELS, type InvitationDto, type MemberDto, type Paginated, type Role } from '@fixflow/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge, Card, CardHeader, EmptyState, PageHeader, PersonChip } from '@/components/ui/display';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input, NativeSelect } from '@/components/ui/input';
import { DataTable, Pagination, type Column } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { formatDate, timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-client';
import { useActor } from '@/lib/session';
import { useUrlState } from '@/lib/use-url-state';

const ROLE_TONE: Record<Role, 'violet' | 'blue' | 'teal' | 'neutral'> = { ORG_ADMIN: 'violet', MANAGER: 'blue', TECHNICIAN: 'teal', REQUESTER: 'neutral' };
const DEFAULTS = { q: '', role: '', page: '1' };

function TeamInner() {
  const router = useRouter();
  const { can } = useActor();
  const [s, set] = useUrlState(DEFAULTS);
  const [search, setSearch] = useState(s.q);
  const [inviting, setInviting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => s.q !== search && set({ q: search }), 250);
    return () => clearTimeout(t);
  }, [search, s.q, set]);
  const query = { q: s.q || undefined, role: s.role || undefined, page: s.page, pageSize: '25' };
  const members = useQuery({ queryKey: qk.members(query), queryFn: () => api<Paginated<MemberDto>>('/members', { query }), placeholderData: keepPreviousData });

  const columns: Column<MemberDto>[] = [
    { key: 'name', header: 'Person', cell: (m) => <PersonChip name={m.name} sub={m.jobTitle ?? m.email} size="md" /> },
    { key: 'role', header: 'Role', cell: (m) => <Badge tone={ROLE_TONE[m.role]}>{ROLE_LABELS[m.role]}</Badge> },
    {
      key: 'skills',
      header: 'Skills',
      hideBelow: 'lg',
      cell: (m) =>
        m.skills.length ? (
          <span className="flex flex-wrap gap-1">{m.skills.slice(0, 3).map((sk) => <Badge key={sk.categoryId} tone="neutral">{sk.categoryName} · L{sk.level}</Badge>)}{m.skills.length > 3 && <Badge>+{m.skills.length - 3}</Badge>}</span>
        ) : (
          <span className="text-xs text-ink-4">—</span>
        ),
    },
    { key: 'load', header: 'Open jobs', hideBelow: 'md', cell: (m) => (m.role === 'TECHNICIAN' ? <span className="tabular">{m.openJobs}</span> : <span className="text-xs text-ink-4">—</span>) },
    {
      key: 'status',
      header: 'Status',
      hideBelow: 'sm',
      cell: (m) =>
        m.status === 'SUSPENDED' ? <Badge tone="red">Suspended</Badge> : m.role === 'TECHNICIAN' && !m.isAvailable ? <Badge tone="amber">Unavailable</Badge> : <Badge tone="green" dot>Active</Badge>,
    },
    { key: 'seen', header: 'Last active', hideBelow: 'xl', cell: (m) => <span className="text-xs text-ink-3">{m.lastLoginAt ? timeAgo(m.lastLoginAt) : 'Never'}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Team"
        description="People, roles, technician skills and current workload."
        actions={can('invitation.manage') && <Button size="sm" onClick={() => setInviting(true)}><MailPlus /> Invite people</Button>}
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-3 sm:px-5">
          <div className="w-full sm:w-64">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email or job title" aria-label="Search people" leading={<Search />} className="h-8 text-[13px]" />
          </div>
          <FilterSelect label="Role" single value={s.role ? [s.role] : []} onChange={(v) => set({ role: v[0] ?? '' })} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          <p className="ml-auto text-xs text-ink-3 tabular">{members.data ? `${members.data.meta.total} people` : ''}</p>
        </div>
        <DataTable caption="Team members" columns={columns} rows={members.data?.data} rowKey={(m) => m.id} loading={members.isLoading} onRowClick={(m) => router.push(`/team/${m.id}`)} empty={<EmptyState icon={<Users />} title="No people found" />} />
        {members.data && <Pagination page={members.data.meta.page} pageCount={members.data.meta.pageCount} total={members.data.meta.total} pageSize={members.data.meta.pageSize} onPageChange={(p) => set({ page: String(p) }, { resetPage: false })} noun="people" />}
      </Card>
      {can('invitation.manage') && <Invitations />}
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </>
  );
}

function Invitations() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.invitations, queryFn: () => api<InvitationDto[]>('/invitations') });
  const pending = (q.data ?? []).filter((i) => i.status === 'PENDING' || i.status === 'EXPIRED');
  const revoke = useMutation({ mutationFn: (id: string) => api(`/invitations/${id}/revoke`, { method: 'POST' }), onSuccess: () => { toast.success('Invitation revoked'); void qc.invalidateQueries({ queryKey: qk.invitations }); }, onError: (e) => toast.error(errorMessage(e)) });
  const resend = useMutation({ mutationFn: (id: string) => api(`/invitations/${id}/resend`, { method: 'POST' }), onSuccess: () => { toast.success('Invitation sent again'); void qc.invalidateQueries({ queryKey: qk.invitations }); }, onError: (e) => toast.error(errorMessage(e)) });
  if (!pending.length) return null;
  return (
    <Card className="mt-4">
      <CardHeader title="Pending invitations" description="Invitations expire after 7 days" />
      <ul className="divide-y divide-line-subtle px-5 pb-3">
        {pending.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{i.email}</span>
              <span className="text-xs text-ink-3">{ROLE_LABELS[i.role]} · invited by {i.invitedBy?.name ?? 'an admin'} · {i.status === 'EXPIRED' ? 'expired' : `expires ${formatDate(i.expiresAt)}`}</span>
            </span>
            {i.status === 'EXPIRED' && <Badge tone="amber">Expired</Badge>}
            <Button variant="ghost" size="xs" onClick={() => resend.mutate(i.id)}><RotateCw /> Resend</Button>
            <Button variant="danger-ghost" size="xs" onClick={() => revoke.mutate(i.id)}><X /> Revoke</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { isAdmin } = useActor();
  const [rows, setRows] = useState<{ email: string; role: Role }[]>([{ email: '', role: 'TECHNICIAN' }]);
  const valid = rows.filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()));
  const send = useMutation({
    mutationFn: () => api<{ invited: InvitationDto[]; skipped: { email: string; reason: string }[] }>('/invitations', { method: 'POST', body: { invitations: valid.map((r) => ({ email: r.email.trim(), role: r.role })) } }),
    onSuccess: (r) => {
      if (r.invited.length) toast.success(`${r.invited.length} invitation${r.invited.length === 1 ? '' : 's'} sent`);
      for (const sk of r.skipped) toast.warning(`${sk.email}: ${sk.reason}`);
      void qc.invalidateQueries({ queryKey: qk.invitations });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Invite people"
        description="They’ll get an email with a secure link to join. Invitations expire in 7 days."
        footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid.length} loading={send.isPending} onClick={() => send.mutate()}><MailPlus /> Send {valid.length || ''} invite{valid.length === 1 ? '' : 's'}</Button></>}
      >
        <div className="grid gap-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_150px_auto] gap-2">
              <Input type="email" placeholder="name@example.com" aria-label={`Email ${i + 1}`} value={r.email} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
              <NativeSelect aria-label={`Role ${i + 1}`} value={r.role} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, role: e.target.value as Role } : x)))}>
                {ROLES.filter((role) => isAdmin || role !== 'ORG_ADMIN').map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </NativeSelect>
              <Button variant="ghost" size="icon" aria-label="Remove" disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><UserX /></Button>
            </div>
          ))}
          <div><Button variant="ghost" size="sm" onClick={() => setRows((rs) => [...rs, { email: '', role: 'TECHNICIAN' }])} disabled={rows.length >= 20}>+ Add another</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamPage() {
  return (
    <Suspense>
      <TeamInner />
    </Suspense>
  );
}
