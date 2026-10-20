'use client';

import { Command } from 'cmdk';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from './menu';

export interface ComboOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
}

/** Searchable single-select (locations, assets, people). Keyboard and screen-reader friendly via cmdk. */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  empty = 'No results',
  invalid,
  clearable,
  disabled,
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  empty?: string;
  invalid?: boolean;
  clearable?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger
          id={id}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-line bg-surface pl-3 pr-9 text-left text-sm shadow-xs transition-[border-color,box-shadow]',
            'hover:border-line-strong focus:border-brand focus:shadow-[var(--shadow-focus)] focus:outline-none aria-[invalid=true]:border-danger disabled:opacity-60',
            !selected && 'text-ink-4',
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? (
              <>
                <span className="text-ink">{selected.label}</span>
                {selected.description && <span className="ml-2 text-xs text-ink-3">{selected.description}</span>}
              </>
            ) : (
              placeholder
            )}
          </span>
        </PopoverTrigger>
        {clearable && selected ? (
          <button type="button" onClick={() => onChange(null)} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-ink-4 hover:text-ink" aria-label="Clear selection">
            <X className="size-4" />
          </button>
        ) : (
          <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
        )}
      </div>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0">
        <Command
          filter={(itemValue, search, keywords) => {
            const hay = `${itemValue} ${(keywords ?? []).join(' ')}`.toLowerCase();
            return search.toLowerCase().split(/\s+/).every((t) => hay.includes(t)) ? 1 : 0;
          }}
        >
          <div className="flex items-center gap-2 border-b border-line-subtle px-3">
            <Search className="size-4 text-ink-4" />
            <Command.Input placeholder={searchPlaceholder} className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-4" />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1 scrollbar-thin">
            <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-3">{empty}</Command.Empty>
            {options.map((o) => (
              <Command.Item
                key={o.value}
                value={`${o.label} ${o.description ?? ''} ${o.value}`}
                keywords={o.keywords}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className="flex cursor-default items-start gap-2 rounded-md px-2.5 py-2 text-sm data-[selected=true]:bg-surface-muted"
              >
                <Check className={cn('mt-0.5 size-4 shrink-0 text-brand', o.value === value ? 'opacity-100' : 'opacity-0')} />
                <span className="min-w-0">
                  <span className="block truncate text-ink">{o.label}</span>
                  {o.description && <span className="block truncate text-xs text-ink-3">{o.description}</span>}
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
