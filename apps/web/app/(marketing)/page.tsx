import {
  ArrowRight,
  BarChart3,
  Building,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  GraduationCap,
  HardHat,
  History,
  Hospital,
  Lock,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Timer,
  UserCheck,
  WifiOff,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { Faq } from '@/components/marketing/faq';
import { ProductPreview } from '@/components/marketing/product-preview';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'FixFlow — From reported issue to verified repair',
  description: 'Maintenance and field-service management for campuses, hospitals, residences and workplaces: QR reporting, smart assignment, SLA automation, mobile technicians and real analytics.',
};

const STEPS = [
  { icon: <QrCode />, title: 'Report in seconds', body: 'Scan the QR label on a room or machine. The form opens with the location and equipment already filled in.' },
  { icon: <ClipboardCheck />, title: 'Ticket created', body: 'A numbered work order is created with deadlines from your SLA policy, and the right people are notified instantly.' },
  { icon: <UserCheck />, title: 'Right technician', body: 'Managers assign with ranked suggestions based on skills and current workload — or let FixFlow assign automatically.' },
  { icon: <HardHat />, title: 'Fixed on site', body: 'Technicians follow the checklist on their phone, record progress and attach photo evidence — even without signal.' },
  { icon: <CheckCircle2 />, title: 'Verified & recorded', body: 'The requester confirms the repair. The work order closes into the asset’s maintenance history and your reports.' },
];

const FEATURES = [
  { icon: <QrCode />, title: 'QR reporting', body: 'Printable labels for every room and asset. Rotate a code any time to retire old labels.' },
  { icon: <Sparkles />, title: 'Explainable assignment', body: 'Recommendations show why: matching skill level, open workload, availability.' },
  { icon: <Timer />, title: 'SLA automation', body: 'Response and resolution targets per priority, early warnings, and escalation when a deadline is missed.' },
  { icon: <Smartphone />, title: 'Built for the field', body: 'A mobile workspace with today’s jobs, one-tap actions, checklists and camera uploads.' },
  { icon: <WifiOff />, title: 'Works offline', body: 'Queued updates sync when you reconnect, and conflicts are surfaced instead of silently overwritten.' },
  { icon: <BarChart3 />, title: 'Real analytics', body: 'Trends, SLA compliance, technician performance and asset failure frequency — exportable to CSV.' },
];

const USE_CASES = [
  { icon: <GraduationCap />, title: 'Campuses', body: 'Lecture halls, labs and hostels — students report, estates teams resolve.' },
  { icon: <Hospital />, title: 'Hospitals', body: 'Critical-priority SLAs for theatres, wards and medical gas alarms.' },
  { icon: <Building />, title: 'Residences', body: 'Residents report from their unit; maintenance staff pick up the queue.' },
  { icon: <Factory />, title: 'Offices & plants', body: 'Preventive schedules for generators, chillers and safety equipment.' },
  { icon: <ShoppingBag />, title: 'Retail & malls', body: 'Guest QR reports from public areas, triaged by facilities managers.' },
];

export default function Home() {
  return (
    <div className="bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Logo />
          <nav aria-label="Product" className="hidden items-center gap-6 text-sm text-ink-2 md:flex">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#use-cases" className="hover:text-ink">Use cases</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link href="/sign-in">Sign in</Link></Button>
            <Button asChild size="sm"><Link href="/sign-up">Get started</Link></Button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-60" style={{ backgroundImage: 'linear-gradient(var(--color-line-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--color-line-subtle) 1px, transparent 1px)', backgroundSize: '40px 40px', maskImage: 'radial-gradient(ellipse at 50% 0%, black 20%, transparent 70%)' }} />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pb-24 pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:pt-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2 shadow-xs">
                <span className="size-1.5 rounded-full bg-teal" /> Maintenance & field service management
              </p>
              <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">From reported issue to <span className="text-brand">verified repair</span> — in one flow.</h1>
              <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-2">
                FixFlow replaces phone calls, spreadsheets and paper registers with one system for maintenance requests, technician work orders, deadlines and asset history.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg"><Link href="/sign-up">Create your workspace <ArrowRight /></Link></Button>
                <Button asChild size="lg" variant="secondary"><a href="#how">See how it works</a></Button>
              </div>
              <ul className="mt-8 grid gap-2 text-sm text-ink-2 sm:grid-cols-2">
                {['Set up in minutes', 'Requesters, technicians & managers', 'SLA deadlines & escalations', 'Private, isolated workspaces'].map((x) => (
                  <li key={x} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-teal" />{x}</li>
                ))}
              </ul>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section id="how" className="border-y border-line bg-surface py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHead eyebrow="How it works" title="One clear path for every maintenance request" body="Every step is tracked, timed and visible to the people involved — no more chasing updates." />
            <ol className="mt-12 grid gap-4 md:grid-cols-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative rounded-xl border border-line bg-canvas p-5">
                  <span className="text-xs font-semibold text-ink-4 tabular">0{i + 1}</span>
                  <span className="mt-3 grid size-10 place-items-center rounded-lg bg-brand-soft text-brand [&_svg]:size-5">{s.icon}</span>
                  <h3 className="mt-4 text-[15px] font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="features" className="py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHead eyebrow="Features" title="Everything the work needs — nothing it doesn’t" body="Designed with facilities teams: fast for requesters, practical for technicians, clear for managers." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl border border-line bg-surface p-6 shadow-xs transition-shadow hover:shadow-md">
                  <span className="grid size-10 place-items-center rounded-lg border border-line bg-surface-sunken text-ink-2 [&_svg]:size-5">{f.icon}</span>
                  <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-3">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface py-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 md:grid-cols-3">
            {[
              { who: 'For managers', points: ['Live backlog, overdue work and workload in one view', 'Assign with skill-based recommendations', 'SLA compliance and technician performance reports'] },
              { who: 'For technicians', points: ['Today’s jobs ordered by priority and deadline', 'Checklists, photos and notes from the phone', 'Keeps working when the signal drops'] },
              { who: 'For requesters', points: ['Report from a QR label in seconds', 'Follow progress without phone calls', 'Confirm the repair — or reopen it'] },
            ].map((b) => (
              <div key={b.who}>
                <h3 className="text-lg font-semibold">{b.who}</h3>
                <ul className="mt-4 grid gap-3">
                  {b.points.map((p) => <li key={p} className="flex gap-2.5 text-sm text-ink-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal" />{p}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="use-cases" className="py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionHead eyebrow="Use cases" title="Fits the way your buildings work" body="Sites, buildings, floors, rooms and areas — model any estate, then assign the right people to it." />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {USE_CASES.map((u) => (
                <div key={u.title} className="rounded-xl border border-line bg-surface p-5">
                  <span className="text-teal [&_svg]:size-6">{u.icon}</span>
                  <h3 className="mt-3 text-[15px] font-semibold">{u.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{u.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-brand-ink">Security & trust</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Your data stays yours</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-2">Every organization is isolated at the database level. Roles control exactly what each person can see and do, and every change leaves an audit trail.</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                { i: <Lock />, t: 'Tenant isolation', b: 'Row-level security on every table' },
                { i: <ShieldCheck />, t: 'Role-based access', b: 'Checked on the server for every request' },
                { i: <History />, t: 'Audit history', b: 'Who changed what, and when' },
                { i: <QrCode />, t: 'Private files', b: 'Photos served only to authorized users' },
              ].map((x) => (
                <li key={x.t} className="rounded-xl border border-line bg-canvas p-4">
                  <span className="text-brand [&_svg]:size-5">{x.i}</span>
                  <p className="mt-2 text-sm font-semibold">{x.t}</p>
                  <p className="text-[13px] text-ink-3">{x.b}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="faq" className="py-20">
          <div className="mx-auto max-w-3xl px-5">
            <SectionHead eyebrow="FAQ" title="Questions, answered" />
            <div className="mt-10"><Faq /></div>
          </div>
        </section>

        <section className="pb-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="relative overflow-hidden rounded-2xl bg-ink px-8 py-14 text-center sm:px-16">
              <div aria-hidden className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 0%, #2563EB 0, transparent 45%), radial-gradient(circle at 80% 100%, #0D9488 0, transparent 40%)' }} />
              <h2 className="relative text-3xl font-semibold tracking-tight text-white">Bring every repair into one flow</h2>
              <p className="relative mx-auto mt-3 max-w-xl text-[15px] text-slate-300">Create your organization, add a building and invite your team — your first QR label can be on the wall today.</p>
              <div className="relative mt-8 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg"><Link href="/sign-up">Get started <ArrowRight /></Link></Button>
                <Button asChild size="lg" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/20"><Link href="/sign-in">Sign in</Link></Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Logo />
            <p className="mt-2 text-[13px] text-ink-3">Maintenance & field service management.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-2">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
            <Link href="/sign-in" className="hover:text-ink">Sign in</Link>
          </nav>
          <p className="text-xs text-ink-4">© {new Date().getFullYear()} FixFlow</p>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-medium text-brand-ink">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2>
      {body && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{body}</p>}
    </div>
  );
}
