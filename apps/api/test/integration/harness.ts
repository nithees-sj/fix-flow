import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import type { Database } from '@fixflow/db';
import { createApp } from '../../src/bootstrap.js';
import { loadEnv } from '../../src/config/env.js';
import { DATABASE, REDIS } from '../../src/infra/tokens.js';

export interface Harness {
  app: INestApplication;
  server: Server;
  db: Database;
  redis: Redis;
  url: string;
  close: () => Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const app = await createApp(loadEnv(), { logger: false });
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer() as Server;
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    app,
    server,
    db: app.get<Database>(DATABASE),
    redis: app.get<Redis>(REDIS),
    url: `http://127.0.0.1:${port}`,
    close: () => app.close(),
  };
}

/** Empties every table in the TEST database and flushes test Redis (db 1 only). */
export async function resetState(h?: Harness): Promise<void> {
  const owner = process.env.TEST_DATABASE_OWNER_URL!;
  if (!new URL(owner).pathname.endsWith('_test')) throw new Error('not a test database');
  const client = new pg.Client({ connectionString: owner });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`,
    );
    await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(',')} CASCADE`);
  } finally {
    await client.end();
  }
  if (h) {
    const db = (h.redis.options.db ?? 0) as number;
    if (db === 0) throw new Error('Refusing to flush Redis db 0');
    await h.redis.flushdb();
  }
}

/** Cookie-jar client that behaves like the browser app (CSRF header on every mutation). */
export class Client {
  private csrf = '';
  private constructor(readonly agent: ReturnType<typeof request.agent>) {}

  static async create(h: Harness): Promise<Client> {
    const c = new Client(request.agent(h.server));
    const res = await c.agent.get('/api/v1/auth/csrf').expect(200);
    c.csrf = res.body.csrfToken as string;
    return c;
  }

  get(path: string) {
    return this.agent.get(`/api/v1${path}`);
  }
  post(path: string, body?: object) {
    return this.agent.post(`/api/v1${path}`).set('x-csrf-token', this.csrf).send(body ?? {});
  }
  put(path: string, body?: object) {
    return this.agent.put(`/api/v1${path}`).set('x-csrf-token', this.csrf).send(body ?? {});
  }
  patch(path: string, body?: object) {
    return this.agent.patch(`/api/v1${path}`).set('x-csrf-token', this.csrf).send(body ?? {});
  }
  delete(path: string) {
    return this.agent.delete(`/api/v1${path}`).set('x-csrf-token', this.csrf);
  }
  upload(path: string, field: string, buffer: Buffer, filename: string, contentType: string) {
    return this.agent
      .post(`/api/v1${path}`)
      .set('x-csrf-token', this.csrf)
      .attach(field, buffer, { filename, contentType });
  }
}

let seq = 0;
export const uniqueEmail = (prefix = 'user') => `${prefix}-${Date.now()}-${++seq}@example.test`;
export const PASSWORD = 'correct-horse-battery-9';

export async function registerUser(h: Harness, name = 'Test User', email = uniqueEmail()): Promise<{ client: Client; email: string; userId: string }> {
  const client = await Client.create(h);
  const res = await client.post('/auth/register', { name, email, password: PASSWORD });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { client, email, userId: res.body.user.id as string };
}
