import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { testUrls } from './helpers.js';

/** Applies migrations to the TEST database once per run (idempotent; never the dev database). */
export default function setup(): void {
  const { owner } = testUrls();
  const dbPkg = resolve(import.meta.dirname, '..');
  execFileSync(resolve(dbPkg, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: dbPkg,
    env: { ...process.env, DATABASE_OWNER_URL: owner, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });
}
