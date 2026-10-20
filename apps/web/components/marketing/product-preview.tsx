import { AlarmClock, CheckCircle2, Clock3, Inbox, MapPin, Play, ShieldCheck, Timer } from 'lucide-react';
import { LogoMark } from '@/components/brand';

/**
 * Static product preview built from the real design system (sample data, clearly labelled).
 * No screenshots, no invented customer metrics.
 */
const rows = [
  { n: 'WO-0142', t: 'AC not cooling in Lecture Hall 204', s: 'Open', tone: 'bg-blue-50 text-blue-700 ring-blue-600/15', who: 'Unassigned', due: 'in 3h 10m', late: false },
  { n: 'WO-0139', t: 'Leaking pipe under sink, Ward B', s: 'In progress', tone: 'bg-amber-50 text-amber-800 ring-amber-600/20', who: 'Asha Menon', due: 'in 1h 05m', late: false },
  { n: 'WO-0137', t: 'Lift door sensor fault', s: 'Assigned', tone: 'bg-indigo-50 text-indigo-700 ring-indigo-600/15', who: 'Ravi Kumar', due: '25m overdue', late: true },
  { n: 'WO-0131', t: 'Corridor lights flickering', s: 'Pending verification', tone: 'bg-violet-50 text-violet-700 ring-violet-600/15', who: 'Lena Fischer', due: 'Met', late: false },
];

export function ProductPreview() {
  return (
    <div className="relative" aria-label="Product preview with sample data" role="img">
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
        <div className="flex items-center gap-2 border-b border-line bg-surface-sunken px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="size-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 rounded-md bg-surface px-3 py-0.5 text-[11px] text-ink-4 ring-1 ring-line">app.fixflow.example/dashboard</span>
        </div>
        <div className="grid grid-cols-[150px_minmax(0,1fr)] max-md:grid-cols-1">
          <aside className="border-r border-line bg-surface-sunken p-3 max-md:hidden">
            <div className="mb-4 flex items-center gap-1.5 text-[12px] font-semibold"><LogoMark className="size-5" /> FixFlow</div>
            {['Dashboard', 'Work orders', 'My work', 'Assets', 'Locations', 'Analytics'].map((x, i) => (
              <div key={x} className={`mb-0.5 rounded-md px-2 py-1.5 text-[11px] font-medium ${i === 0 ? 'bg-surface text-ink shadow-xs ring-1 ring-line' : 'text-ink-3'}`}>{x}</div>
            ))}
          </aside>
          <div className="p-4">
            <p className="text-[13px] font-semibold">Good morning, Priya</p>
            <div className="mt-3 grid grid-cols-4 gap-2 max-sm:grid-cols-2">
              {[
                { l: 'Open backlog', v: '24', i: <Inbox /> },
                { l: 'Overdue', v: '3', i: <AlarmClock /> },
                { l: 'Avg. response', v: '1h 12m', i: <Timer /> },
                { l: 'SLA compliance', v: '92%', i: <ShieldCheck /> },
              ].map((k) => (
                <div key={k.l} className="rounded-lg border border-line px-2.5 py-2">
                  <div className="flex items-center justify-between text-[10px] text-ink-3">{k.l}<span className="[&_svg]:size-3">{k.i}</span></div>
                  <p className="mt-0.5 text-base font-semibold">{k.v}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-line">
              {rows.map((r) => (
                <div key={r.n} className="flex items-center gap-3 border-b border-line-subtle px-3 py-2 text-[11px] last:border-0">
                  <span className="whitespace-nowrap font-mono text-ink-4">{r.n}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.t}</span>
                  <span className={`hidden whitespace-nowrap rounded px-1.5 py-0.5 ring-1 ring-inset xl:inline ${r.tone}`}>{r.s}</span>
                  <span className="hidden w-20 truncate text-ink-3 2xl:inline">{r.who}</span>
                  <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap ${r.late ? 'font-medium text-red-700' : 'text-ink-3'}`}><Clock3 className="size-3" />{r.due}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex h-20 items-end gap-1.5 rounded-lg border border-line px-3 pb-2 pt-3" aria-hidden>
              {[30, 45, 38, 60, 52, 70, 48, 66, 58, 75, 62, 80, 55, 68].map((h, i) => (
                <span key={i} className="flex-1 rounded-t bg-[#2a78d6]/80" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Technician phone card */}
      <div className="absolute -bottom-8 -right-4 hidden w-56 rounded-[22px] border border-line bg-surface p-3 shadow-lg md:block lg:-right-10">
        <div className="mb-2 flex items-center justify-between text-[10px] text-ink-3"><span>My work</span><span className="rounded-full bg-success-soft px-1.5 font-medium text-success-ink">Available</span></div>
        <div className="rounded-xl border border-line p-2.5">
          <p className="font-mono text-[9px] text-ink-4">WO-0139</p>
          <p className="text-[12px] font-semibold leading-snug">Leaking pipe under sink, Ward B</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-ink-3"><MapPin className="size-3" /> Main Hospital › Level 2</p>
          <div className="mt-2 space-y-1">
            {['Shut off water supply', 'Replace washer & seal', 'Check for leaks (5 min)'].map((c, i) => (
              <p key={c} className="flex items-center gap-1.5 text-[10px] text-ink-2"><CheckCircle2 className={`size-3 ${i < 2 ? 'text-success' : 'text-ink-4'}`} />{c}</p>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-center gap-1 rounded-lg bg-brand py-1.5 text-[10px] font-semibold text-white"><Play className="size-3" /> Submit for verification</div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-ink-4 md:text-left">Product preview · sample data</p>
    </div>
  );
}
