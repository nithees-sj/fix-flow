import Link from 'next/link';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-5xl flex-col items-start justify-center gap-6 px-6">
      <Logo />
      <h1 className="text-4xl font-semibold">Maintenance operations, from report to verified repair.</h1>
      <div className="flex gap-3">
        <Button asChild size="lg"><Link href="/sign-up">Get started</Link></Button>
        <Button asChild size="lg" variant="secondary"><Link href="/sign-in">Sign in</Link></Button>
      </div>
    </main>
  );
}
