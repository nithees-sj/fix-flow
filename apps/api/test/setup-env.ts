/**
 * Points the API at the isolated TEST database and Redis db 1 before any module loads.
 * Tests never touch the development database.
 */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';

const rootEnv = resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) expand(dotenv.config({ path: rootEnv, quiet: true }));

const required = ['TEST_DATABASE_URL', 'TEST_DATABASE_SYSTEM_URL', 'TEST_REDIS_URL'] as const;
for (const k of required) if (!process.env[k]) throw new Error(`${k} is required for integration tests`);

Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_SYSTEM_URL: process.env.TEST_DATABASE_SYSTEM_URL,
  REDIS_URL: process.env.TEST_REDIS_URL,
  S3_BUCKET: 'fixflow-test',
  MAIL_PROVIDER: 'memory',
  DISABLE_SCHEDULERS: 'true',
  APP_WEB_URL: 'http://localhost:3000',
});

if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')) {
  throw new Error('Refusing to run integration tests against a non-test database');
}
