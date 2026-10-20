#!/usr/bin/env node
/**
 * Idempotent database bootstrap (safe to run on every deploy and on existing volumes).
 *
 *   fixflow_owner   owns the databases/schema; runs migrations (DDL). Never used at runtime.
 *   fixflow_app     runtime role for tenant requests. NOBYPASSRLS → row-level security applies.
 *   fixflow_system  runtime role for a short, audited list of cross-tenant paths. BYPASSRLS.
 *
 * Creates the dev, test and shadow databases if missing. Never drops or truncates anything.
 * Requires DATABASE_SUPERUSER_URL (the Postgres container's bootstrap superuser).
 */
import pg from 'pg';
import { loadEnv } from './load-env.mjs';

loadEnv();

const required = ['DATABASE_SUPERUSER_URL', 'FIXFLOW_OWNER_PASSWORD', 'FIXFLOW_APP_PASSWORD', 'FIXFLOW_SYSTEM_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`apply-roles: missing ${key}`);
    process.exit(1);
  }
}

const DATABASES = (process.env.FIXFLOW_DATABASES ?? 'fixflow,fixflow_test,fixflow_shadow').split(',');

const roles = [
  { name: 'fixflow_owner', password: process.env.FIXFLOW_OWNER_PASSWORD, attrs: 'LOGIN NOSUPERUSER NOCREATEROLE NOBYPASSRLS' },
  { name: 'fixflow_app', password: process.env.FIXFLOW_APP_PASSWORD, attrs: 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS' },
  { name: 'fixflow_system', password: process.env.FIXFLOW_SYSTEM_PASSWORD, attrs: 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS' },
];

async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

const superUrl = new URL(process.env.DATABASE_SUPERUSER_URL);

await withClient(superUrl.toString(), async (c) => {
  for (const r of roles) {
    const exists = await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [r.name]);
    const pw = c.escapeLiteral(r.password);
    if (exists.rowCount === 0) {
      await c.query(`CREATE ROLE ${r.name} ${r.attrs} PASSWORD ${pw}`);
      console.log(`  created role ${r.name}`);
    } else {
      await c.query(`ALTER ROLE ${r.name} ${r.attrs} PASSWORD ${pw}`);
    }
  }
  for (const db of DATABASES) {
    if (!/^[a-z_][a-z0-9_]*$/.test(db)) throw new Error(`invalid database name ${db}`);
    const exists = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
    if (exists.rowCount === 0) {
      await c.query(`CREATE DATABASE ${db} OWNER fixflow_owner`);
      console.log(`  created database ${db}`);
    }
    await c.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
    await c.query(`GRANT CONNECT, TEMPORARY ON DATABASE ${db} TO fixflow_owner, fixflow_app, fixflow_system`);
  }
});

// Per-database grants: runtime roles get DML only (no DDL), including on future tables.
for (const db of DATABASES) {
  const url = new URL(superUrl);
  url.pathname = `/${db}`;
  await withClient(url.toString(), async (c) => {
    await c.query(`ALTER SCHEMA public OWNER TO fixflow_owner`);
    await c.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    await c.query(`GRANT USAGE ON SCHEMA public TO fixflow_app, fixflow_system`);
    await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fixflow_app, fixflow_system`);
    await c.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fixflow_app, fixflow_system`);
    await c.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE fixflow_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fixflow_app, fixflow_system`,
    );
    await c.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE fixflow_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO fixflow_app, fixflow_system`,
    );
    // Prisma's migration bookkeeping table is owner-only.
    await c.query(`
      DO $$ BEGIN
        IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
          REVOKE ALL ON public._prisma_migrations FROM fixflow_app, fixflow_system;
        END IF;
      END $$;`);
  });
}

console.log(`apply-roles: roles and grants are up to date for ${DATABASES.join(', ')}`);
