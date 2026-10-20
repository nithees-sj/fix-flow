import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Every setting the API and worker read. Validated once at boot — invalid config fails fast. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_PORT: z.coerce.number().int().default(4000),

  DATABASE_URL: z.url(),
  DATABASE_SYSTEM_URL: z.url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z.url(),

  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool.default(true),

  MAIL_PROVIDER: z.enum(['smtp', 'console', 'memory']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('FixFlow <no-reply@fixflow.local>'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: bool.default(false),

  APP_WEB_URL: z.url().default('http://localhost:3000'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),

  /** Seconds between outbox polls in the worker. */
  OUTBOX_POLL_MS: z.coerce.number().int().min(100).default(2000),
  /** Worker touches this file after every successful outbox pass (Docker HEALTHCHECK). */
  WORKER_HEARTBEAT_FILE: z.string().optional(),
  /** Disable background loops in tests that drive them manually. */
  DISABLE_SCHEDULERS: bool.default(false),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  if (cached && Object.keys(overrides).length === 0) return cached;
  const rootEnv = resolve(import.meta.dirname, '../../../../.env');
  if (existsSync(rootEnv)) expand(dotenv.config({ path: rootEnv, quiet: true }));
  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.COOKIE_SECURE && process.env.ALLOW_INSECURE_COOKIES !== 'true') {
    throw new Error('COOKIE_SECURE must be true in production (set ALLOW_INSECURE_COOKIES=true only for local demos).');
  }
  cached = parsed.data;
  return cached;
}

export const ENV = Symbol('ENV');
