import type { Tone } from '@fixflow/shared';

/** Design-system tints for status/priority/category pills. 50 background · 700 text · subtle ring. */
export const TONE_PILL: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-500/15',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/15',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/15',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  red: 'bg-red-50 text-red-700 ring-red-600/15',
  teal: 'bg-teal-50 text-teal-700 ring-teal-600/15',
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  slate: 'bg-slate-400',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  teal: 'bg-teal-500',
};

/** Category palette keys (validated server-side) → icon chip classes. */
export const CATEGORY_CHIP: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-700',
  teal: 'bg-teal-50 text-teal-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  violet: 'bg-violet-50 text-violet-700',
  green: 'bg-emerald-50 text-emerald-700',
  slate: 'bg-slate-100 text-slate-700',
  orange: 'bg-orange-50 text-orange-700',
  pink: 'bg-pink-50 text-pink-700',
  cyan: 'bg-cyan-50 text-cyan-700',
};
