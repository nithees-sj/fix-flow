'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/display';
import { WorkOrderList, type SavedView } from '@/components/work-orders/work-order-list';

const VIEWS: SavedView[] = [
  { key: 'active', label: 'In progress', query: { status: 'OPEN,ASSIGNED,IN_PROGRESS,ON_HOLD,PENDING_VERIFICATION' } },
  { key: 'verify', label: 'Needs my verification', query: { status: 'PENDING_VERIFICATION' } },
  { key: 'done', label: 'Completed', query: { status: 'RESOLVED,CLOSED,CANCELLED' } },
];

export default function MyRequestsPage() {
  return (
    <>
      <PageHeader
        title="My requests"
        description="Track the issues you’ve reported and confirm repairs when they’re done."
        actions={
          <Button asChild size="sm">
            <Link href="/work-orders/new">
              <Plus /> Report an issue
            </Link>
          </Button>
        }
      />
      <Suspense>
        <WorkOrderList
          views={VIEWS}
          base={{ requesterId: 'me' }}
          emptyAction={
            <Button asChild size="sm">
              <Link href="/work-orders/new">Report an issue</Link>
            </Button>
          }
        />
      </Suspense>
    </>
  );
}
