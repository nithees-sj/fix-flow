import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';
import { defineConfig } from 'prisma/config';

// Migrations run as the schema owner. The root .env is optional (CI / containers set env directly).
const rootEnv = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) expand(dotenv.config({ path: rootEnv, quiet: true }));

const ownerUrl = process.env.DATABASE_OWNER_URL;
const shadowUrl = ownerUrl ? ownerUrl.replace(/\/[^/?]+(\?|$)/, '/fixflow_shadow$1') : undefined;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: ownerUrl, shadowDatabaseUrl: shadowUrl },
});
