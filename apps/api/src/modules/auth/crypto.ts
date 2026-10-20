import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** OWASP-recommended argon2id parameters (19 MiB, t=2, p=1). */
// algorithm 2 = Argon2id (the package exposes it as an ambient const enum).
const ARGON = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, ARGON);

// Pre-computed hash of a random secret; verifying against it equalizes timing for unknown emails.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hash(randomBytes(16).toString('hex'), ARGON));

export async function verifyPassword(hashOrNull: string | null, password: string): Promise<boolean> {
  if (!hashOrNull) {
    await verify(await getDummyHash(), password).catch(() => false);
    return false;
  }
  return verify(hashOrNull, password).catch(() => false);
}

/** Random URL-safe secret and its SHA-256 (only the hash is ever persisted). */
export function newSecret(bytes = 32): { token: string; hash: string } {
  const token = randomBytes(bytes).toString('base64url');
  return { token, hash: sha256(token) };
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
