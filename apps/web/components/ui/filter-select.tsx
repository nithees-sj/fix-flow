'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './menu';

export interface FilterOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

/** Pill-shaped multi-select used in filter bars. Empty selection = no filter. */
export function FilterSelect({
  label,
  options,
  value,
  onChange,
  single,
}: {
  label: string;
  options: FilterOption[];
  value: string[];
  onChange: (v: string[]) => void;
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = value.length > 0;
  const summary = active ? (value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? value[0]) : `${value.length} selected`) : null;
  const toggle = (v: string) => {
    if (single) {
      onChange(value[0] === v ? [] : [v]);
      setOpen(false);
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn('inline-flex h-8 items-center rounded-md border text-[13px] shadow-xs transition-colors', active ? 'border-brand/30 bg-brand-soft text-brand-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong')}>
        <PopoverTrigger className="inline-flex h-full items-center gap-1.5 rounded-md px-2.5 font-medium focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus)]">
          {label}
          {summary && (
            <>
              <span className="h-3.5 w-px bg-brand/25" aria-hidden />
              <span className="max-w-32 truncate font-normal">{summary}</span>
            </>
          )}
          {!active && <ChevronDown className="size-3.5 text-ink-4" />}
        </PopoverTrigger>
        {active && (
          <button type="button" onClick={() => onChange([])} className="mr-1 grid size-5 place-items-center rounded hover:bg-brand/10" aria-label={`Clear ${label} filter`}>
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-60 p-1">
        <ul role="listbox" aria-label={label} aria-multiselectable={!single} className="max-h-72 overflow-y-auto scrollbar-thin">
          {options.map((o) => {
            const selected = value.includes(o.value);
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-surface-muted"
                >
                  <span className={cn('grid size-4 shrink-0 place-items-center rounded border', selected ? 'border-brand bg-brand text-white' : 'border-line-strong')}>
                    {selected && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  {o.icon}
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
