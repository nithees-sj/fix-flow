import { CheckCircle2, Clock3, QrCode, Wrench } from 'lucide-react';
import { Logo } from '@/components/brand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Logo />
        <main id="main" className="flex flex-1 items-start justify-center pb-10 pt-12 sm:items-center sm:py-10">
          <div className="w-full max-w-[380px] animate-slide-up">{children}</div>
        </main>
        <p className="text-xs text-ink-4">© {new Date().getFullYear()} FixFlow. Built for maintenance teams.</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-surface-sunken lg:block" aria-hidden>
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage: 'linear-gradient(var(--color-line-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--color-line-subtle) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse at 60% 40%, black 30%, transparent 75%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-center px-14">
          <p className="text-sm font-medium text-brand-ink">From report to verified repair</p>
          <h2 className="mt-2 max-w-md text-[28px] font-semibold leading-tight">Every maintenance request, tracked end to end.</h2>
          <div className="mt-10 max-w-md space-y-3">
            <PreviewRow icon={<QrCode />} title="WO-0142 · AC not cooling" meta="Reported via QR · Lecture Hall 204" tone="blue" status="Open" />
            <PreviewRow icon={<Wrench />} title="WO-0139 · Leaking pipe, Ward B" meta="Asha Menon · started 12m ago" tone="amber" status="In progress" />
            <PreviewRow icon={<Clock3 />} title="WO-0131 · Lift door sensor" meta="Response due in 18m" tone="violet" status="Pending verification" />
            <PreviewRow icon={<CheckCircle2 />} title="WO-0127 · Corridor lights" meta="Verified by requester" tone="green" status="Resolved" />
          </div>
        </div>
      </aside>
    </div>
  );
}

const tones = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
};

function PreviewRow({ icon, title, meta, status, tone }: { icon: React.ReactNode; title: string; meta: string; status: string; tone: keyof typeof tones }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-muted text-ink-3 [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        <p className="truncate text-xs text-ink-3">{meta}</p>
      </div>
      <span className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{status}</span>
    </div>
  );
}
