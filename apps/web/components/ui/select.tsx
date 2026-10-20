'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as S } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

interface SelectProps {
  id?: string;
  value: string | undefined;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  size?: 'sm' | 'md';
}

export function Select({ id, value, onValueChange, options, placeholder = 'Select…', disabled, invalid, className, size = 'md', ...aria }: SelectProps) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 text-left text-sm text-ink shadow-xs',
          'transition-[border-color,box-shadow] hover:border-line-strong focus:border-brand focus:shadow-[var(--shadow-focus)] focus:outline-none',
          'data-[placeholder]:text-ink-4 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger',
          size === 'sm' ? 'h-8 text-[13px]' : 'h-9',
          className,
        )}
      >
        <span className="truncate">
          <S.Value placeholder={placeholder} />
        </span>
        <S.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-ink-4" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className={cn(
            'z-50 max-h-[min(var(--radix-select-content-available-height),22rem)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-line bg-surface shadow-lg',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex cursor-default select-none items-start gap-2 rounded-md py-2 pl-8 pr-3 text-sm text-ink outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted"
              >
                <S.ItemIndicator className="absolute left-2.5 top-2.5">
                  <Check className="size-4 text-brand" />
                </S.ItemIndicator>
                <div className="min-w-0">
                  <S.ItemText>{o.label}</S.ItemText>
                  {o.description && <div className="mt-0.5 text-xs text-ink-3">{o.description}</div>}
                </div>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
