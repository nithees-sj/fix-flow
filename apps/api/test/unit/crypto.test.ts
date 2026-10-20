import { describe, expect, it } from 'vitest';
import { hashPassword, newSecret, sha256, verifyPassword } from '../../src/modules/auth/crypto.js';

describe('auth crypto', () => {
  it('hashes passwords with argon2id and verifies them', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(h, 'wrong password')).toBe(false);
  });

  it('returns false (after a dummy verify) when the account has no password', async () => {
    expect(await verifyPassword(null, 'anything')).toBe(false);
  });

  it('never throws on a malformed stored hash', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });

  it('issues URL-safe secrets and persists only their SHA-256', () => {
    const a = newSecret();
    const b = newSecret();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(sha256(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
