import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const STYLES = {
  info: { box: 'border-blue-200 bg-blue-50 text-blue-900', icon: <Info className="text-blue-600" /> },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: <CheckCircle2 className="text-emerald-600" /> },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: <TriangleAlert className="text-amber-600" /> },
  danger: { box: 'border-red-200 bg-red-50 text-red-900', icon: <AlertCircle className="text-red-600" /> },
};

export function Alert({ tone = 'info', title, children, className, action }: { tone?: keyof typeof STYLES; title?: string; children?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  const s = STYLES[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg border px-3.5 py-3 text-[13px]', s.box, className)}>
      <span className="mt-px shrink-0 [&_svg]:size-4">{s.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
