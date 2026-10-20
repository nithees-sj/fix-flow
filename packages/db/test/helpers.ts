import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';
import pg from 'pg';

const rootEnv = resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) expand(dotenv.config({ path: rootEnv, quiet: true }));

export function testUrls() {
  const app = process.env.TEST_DATABASE_URL;
  const system = process.env.TEST_DATABASE_SYSTEM_URL;
  const owner = process.env.TEST_DATABASE_OWNER_URL;
  if (!app || !system || !owner) throw new Error('TEST_DATABASE_* env vars are required');
  for (const u of [app, system, owner]) {
    if (!new URL(u).pathname.endsWith('_test')) throw new Error(`Refusing to run tests against non-test database: ${u}`);
  }
  return { app, system, owner };
}

/** Empties every application table in the TEST database (never runs against dev data). */
export async function truncateAll(): Promise<void> {
  const client = new pg.Client({ connectionString: testUrls().owner });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length) {
      await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
}
