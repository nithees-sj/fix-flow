'use client';

import { Download, Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/display';
import { WorkOrderList, type SavedView } from '@/components/work-orders/work-order-list';
import { useActor } from '@/lib/session';

const MANAGER_VIEWS: SavedView[] = [
  { key: 'active', label: 'Active', query: { status: 'OPEN,ASSIGNED,IN_PROGRESS,ON_HOLD,PENDING_VERIFICATION' } },
  { key: 'unassigned', label: 'Unassigned', query: { status: 'OPEN', assigneeId: 'unassigned' } },
  { key: 'overdue', label: 'Overdue', query: { overdue: 'true' } },
  { key: 'verify', label: 'Awaiting verification', query: { status: 'PENDING_VERIFICATION' } },
  { key: 'done', label: 'Resolved & closed', query: { status: 'RESOLVED,CLOSED' } },
  { key: 'all', label: 'All', query: {} },
];

const TECH_VIEWS: SavedView[] = [
  { key: 'mine', label: 'Assigned to me', query: { assigneeId: 'me', status: 'ASSIGNED,IN_PROGRESS,ON_HOLD,PENDING_VERIFICATION' } },
  { key: 'pool', label: 'Open pool', query: { status: 'OPEN' } },
  { key: 'history', label: 'History', query: { status: 'RESOLVED,CLOSED,CANCELLED' } },
];

export default function WorkOrdersPage() {
  const { isManager, can } = useActor();
  return (
    <>
      <PageHeader
        title="Work orders"
        description={isManager ? 'Triage, assign and track every maintenance request.' : 'Jobs you’re responsible for and the open request pool.'}
        actions={
          <>
            {can('report.export') && (
              <Button asChild variant="secondary" size="sm">
                <Link href="/analytics#export">
                  <Download /> Export
                </Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href="/work-orders/new">
                <Plus /> New work order
              </Link>
            </Button>
          </>
        }
      />
      <Suspense>
        <WorkOrderList views={isManager ? MANAGER_VIEWS : TECH_VIEWS} />
      </Suspense>
    </>
  );
}
