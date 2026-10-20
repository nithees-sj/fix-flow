import Link from 'next/link';
import { cn } from '@/lib/utils';

/** FixFlow mark: a work item flowing through three stages to done. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2563EB" />
      <path d="M9 11.5h9.5" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M9 16.5h6" stroke="#fff" strokeOpacity=".75" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M9 21.5h3" stroke="#fff" strokeOpacity=".5" strokeWidth="2.6" strokeLinecap="round" />
      <path d="m18.5 19.5 2.4 2.4 4.6-5.4" stroke="#5EEAD4" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({ href = '/', className, size = 'md' }: { href?: string; className?: string; size?: 'sm' | 'md' }) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2 rounded-md font-semibold tracking-tight text-ink', className)} aria-label="FixFlow home">
      <LogoMark className={size === 'sm' ? 'size-6' : 'size-7'} />
      <span className={size === 'sm' ? 'text-[15px]' : 'text-[17px]'}>FixFlow</span>
    </Link>
  );
}
