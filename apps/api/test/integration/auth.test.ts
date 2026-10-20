import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, PASSWORD, registerUser, resetState, startHarness, type Harness, uniqueEmail } from './harness.js';

let h: Harness;

beforeAll(async () => {
  h = await startHarness();
  await resetState(h);
});
afterAll(async () => h.close());

const cookieValue = (res: { headers: Record<string, unknown> }, name: string): string | undefined => {
  const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  const c = cookies.find((x) => x.startsWith(`${name}=`));
  return c?.split(';')[0]?.slice(name.length + 1);
};

describe('registration and sign-in', () => {
  it('registers, sets httpOnly session cookies and returns the profile', async () => {
    const c = await Client.create(h);
    const email = uniqueEmail('ada');
    const res = await c.post('/auth/register', { name: 'Ada Lovelace', email: email.toUpperCase(), password: PASSWORD }).expect(201);
    expect(res.body.user).toMatchObject({ name: 'Ada Lovelace', email, emailVerified: false });
    expect(res.body.activeOrganization).toBeNull();
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(setCookie).toMatch(/ff_at=.*HttpOnly/);
    expect(setCookie).toMatch(/ff_rt=.*Path=\/api\/v1\/auth.*HttpOnly/);
    await c.get('/auth/me').expect(200);
    // A verification email is queued in the transactional outbox.
    const events = await h.db.system.outboxEvent.findMany({ where: { type: 'email.send' } });
    expect(events.some((e) => (e.payload as { to: string }).to === email)).toBe(true);
  });

  it('rejects duplicate emails with EMAIL_TAKEN', async () => {
    const { email } = await registerUser(h);
    const c = await Client.create(h);
    const res = await c.post('/auth/register', { name: 'Dup', email, password: PASSWORD }).expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
  });

  it('validates input with field-level errors', async () => {
    const c = await Client.create(h);
    const res = await c.post('/auth/register', { name: 'A', email: 'nope', password: 'short' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['email', 'name', 'password']);
  });

  it('uses one generic error for wrong password and unknown email', async () => {
    const { email } = await registerUser(h);
    const c = await Client.create(h);
    const wrong = await c.post('/auth/login', { email, password: 'not-the-password' }).expect(401);
    const unknown = await c.post('/auth/login', { email: uniqueEmail('ghost'), password: PASSWORD }).expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.detail).toBe(wrong.body.detail);
    await c.post('/auth/login', { email, password: PASSWORD }).expect(200);
  });
});

describe('CSRF protection', () => {
  it('rejects cookie-authenticated mutations without the CSRF header', async () => {
    const { client } = await registerUser(h);
    const res = await client.agent.post('/api/v1/auth/resend-verification').send({}).expect(403);
    expect(res.body.code).toBe('CSRF_FAILED');
  });

  it('rejects a mismatched CSRF token', async () => {
    const { client } = await registerUser(h);
    await client.agent.post('/api/v1/auth/resend-verification').set('x-csrf-token', 'forged-token-value-123').expect(403);
  });
});

describe('refresh-token rotation', () => {
  it('rotates the refresh token on every refresh', async () => {
    const { client } = await registerUser(h);
    const r1 = await client.post('/auth/refresh').expect(200);
    const r2 = await client.post('/auth/refresh').expect(200);
    expect(cookieValue(r1, 'ff_rt')).toBeTruthy();
    expect(cookieValue(r1, 'ff_rt')).not.toBe(cookieValue(r2, 'ff_rt'));
    await client.get('/auth/me').expect(200);
  });

  it('detects reuse of a rotated token and revokes the whole session family', async () => {
    const { client, email } = await registerUser(h);
    const login = await (await Client.create(h)).post('/auth/login', { email, password: PASSWORD }).expect(200);
    const stolen = cookieValue(login, 'ff_rt')!;
    const access = cookieValue(login, 'ff_at')!;

    // Legitimate client rotates the token…
    const refreshWith = (rt: string) =>
      request(h.server).post('/api/v1/auth/refresh').set('Cookie', `ff_rt=${rt}; ff_csrf=x`).set('x-csrf-token', 'x');
    const first = await refreshWith(stolen).expect(200);
    expect(cookieValue(first, 'ff_rt')).toBeTruthy();

    // …and age the rotation beyond the concurrency grace window.
    await h.db.system.session.updateMany({ where: { rotatedAt: { not: null } }, data: { rotatedAt: new Date(Date.now() - 60_000) } });

    // Replaying the old token now revokes the family.
    const replay = await refreshWith(stolen).expect(401);
    expect(replay.body.code).toBe('SESSION_EXPIRED');

    // The access token minted for that family is denylisted immediately.
    await request(h.server).get('/api/v1/auth/me').set('Authorization', `Bearer ${access}`).expect(401);
    // The token issued by the legitimate rotation is part of the family too.
    await refreshWith(cookieValue(first, 'ff_rt')!).expect(401);
    // Other sessions of the same user (the original registration) are unaffected.
    await client.get('/auth/me').expect(200);
  });

  it('logout revokes the session and its access token', async () => {
    const { client } = await registerUser(h);
    await client.post('/auth/logout').expect(204);
    await client.get('/auth/me').expect(401);
    await client.post('/auth/refresh').expect(401);
  });
});

describe('password reset', () => {
  async function resetLinkFor(email: string): Promise<string> {
    const ev = await h.db.system.outboxEvent.findFirst({
      where: { type: 'email.send', payload: { path: ['template'], equals: 'password-reset' } },
      orderBy: { createdAt: 'desc' },
    });
    const payload = ev!.payload as { to: string; data: { url: string } };
    expect(payload.to).toBe(email);
    return new URL(payload.data.url).searchParams.get('token')!;
  }

  it('does not reveal whether an account exists', async () => {
    const c = await Client.create(h);
    await c.post('/auth/forgot-password', { email: uniqueEmail('nobody') }).expect(202);
  });

  it('resets with a single-use token and signs out every session', async () => {
    const { client, email } = await registerUser(h);
    const anon = await Client.create(h);
    await anon.post('/auth/forgot-password', { email }).expect(202);
    const token = await resetLinkFor(email);

    await anon.post('/auth/reset-password', { token, password: 'a-brand-new-password-1' }).expect(204);
    await client.get('/auth/me').expect(401); // old session revoked
    await anon.post('/auth/reset-password', { token, password: 'another-password-22' }).expect(400); // single use
    await anon.post('/auth/login', { email, password: PASSWORD }).expect(401);
    await anon.post('/auth/login', { email, password: 'a-brand-new-password-1' }).expect(200);
  });
});
