import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';

/** Applies migrations to the TEST database once per run (idempotent). */
export default function setup(): void {
  const rootEnv = resolve(import.meta.dirname, '../../../.env');
  if (existsSync(rootEnv)) expand(dotenv.config({ path: rootEnv, quiet: true }));
  const ownerUrl = process.env.TEST_DATABASE_OWNER_URL;
  if (!ownerUrl || !new URL(ownerUrl).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_OWNER_URL must point at a *_test database');
  }
  const dbPkg = resolve(import.meta.dirname, '../../../packages/db');
  execFileSync(resolve(dbPkg, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: dbPkg,
    env: { ...process.env, DATABASE_OWNER_URL: ownerUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });
}
