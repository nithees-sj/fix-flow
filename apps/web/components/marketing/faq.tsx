'use client';

import { ChevronDown } from 'lucide-react';
import { Accordion } from 'radix-ui';

const ITEMS = [
  {
    q: 'Who is FixFlow for?',
    a: 'Any organization that maintains buildings and equipment: colleges and schools, hospitals and clinics, apartment communities, offices, factories, malls and hotels. Requesters report issues, technicians resolve them, and managers keep everything on schedule.',
  },
  {
    q: 'Do people need an account to report an issue?',
    a: 'Your choice. By default only members of your organization can report. You can also allow guest reports from QR labels — visitors leave their name and contact details, and managers triage the request.',
  },
  {
    q: 'How do SLA targets work?',
    a: 'You set response and resolution targets per priority. Every work order gets fixed deadlines when it is created. FixFlow warns before a deadline is missed, escalates breaches to managers, and reports compliance over time.',
  },
  {
    q: 'Can technicians work without signal?',
    a: 'Yes. Assigned jobs stay viewable on the device, and checklist updates, comments, photos and status changes are queued while offline. They sync automatically when the connection returns — and if someone else changed the job meanwhile, FixFlow asks before applying anything.',
  },
  {
    q: 'How is our data kept separate from other organizations?',
    a: 'Isolation is enforced by the database itself (row-level security and tenant-scoped foreign keys), not just by the application. Files are private and only served after an authorization check, and every change is recorded in an audit log.',
  },
  {
    q: 'Can we export our data?',
    a: 'Managers can download work-order and technician reports as CSV for any date range. Exports are recorded in the audit log.',
  },
];

export function Faq() {
  return (
    <Accordion.Root type="single" collapsible className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {ITEMS.map((it, i) => (
        <Accordion.Item key={it.q} value={`q${i}`}>
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium text-ink hover:bg-surface-sunken">
              {it.q}
              <ChevronDown className="size-4 shrink-0 text-ink-4 transition-transform group-data-[state=open]:rotate-180" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="overflow-hidden px-5 text-sm leading-relaxed text-ink-2 data-[state=open]:pb-4">{it.a}</Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
