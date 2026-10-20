#!/usr/bin/env node
/**
 * DESTRUCTIVE: wipes the database named in DATABASE_OWNER_URL and rebuilds it
 * (migrations → roles/grants → demo seed). Local development only.
 *
 *   CONFIRM_RESET=yes pnpm db:reset
 *
 * Refuses to run without CONFIRM_RESET=yes, when NODE_ENV=production, or when the target
 * host is not local. It never touches Docker volumes or other databases.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dbPkg = resolve(root, 'packages/db');

// Reuse the db package's .env loader (dotenv + ${VAR} expansion; real env vars win).
const { loadEnv } = await import(resolve(dbPkg, 'scripts/load-env.mjs'));
loadEnv();

const fail = (msg) => {
  console.error(`db:reset: ${msg}`);
  process.exit(1);
};

if (process.env.CONFIRM_RESET !== 'yes') {
  fail('refusing to wipe the database. Re-run with CONFIRM_RESET=yes if you really mean it.');
}
if (process.env.NODE_ENV === 'production') fail('refusing to run with NODE_ENV=production.');
if (!process.env.DATABASE_OWNER_URL) fail('DATABASE_OWNER_URL is not set (run node infrastructure/scripts/init-env.mjs).');

const target = new URL(process.env.DATABASE_OWNER_URL);
const dbName = target.pathname.replace(/^\//, '');
if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(target.hostname)) {
  fail(`refusing to reset non-local host "${target.hostname}".`);
}
if (!existsSync(resolve(dbPkg, 'dist/seed/index.js'))) fail('build the db package first: pnpm --filter @fixflow/db build');

const run = (cmd, args, extraEnv = {}) => {
  const r = spawnSync(cmd, args, { cwd: dbPkg, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited with ${r.status}`);
};

console.log(`db:reset: wiping database "${dbName}" on ${target.host}`);
run('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force']);
run('node', ['scripts/apply-roles.mjs']);
run('node', ['dist/seed/index.js'], { ALLOW_DEMO_SEED: 'true' });
console.log('db:reset: done');
