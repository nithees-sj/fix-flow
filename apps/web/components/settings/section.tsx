import { Card } from '@/components/ui/display';
import { cn } from '@/lib/utils';

/** Settings card: title/description column + content, with an optional footer bar for actions. */
export function SettingsSection({ title, description, children, footer, className }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('mb-4 overflow-hidden', className)}>
      <div className="border-b border-line-subtle px-5 py-4">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line-subtle bg-surface-sunken px-5 py-3">{footer}</div>}
    </Card>
  );
}
