#!/usr/bin/env node
// Creates `.env` from `.env.example`, replacing every "change-me…" value with a random secret.
// Idempotent: an existing `.env` is never overwritten.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = resolve(root, '.env');

if (existsSync(target)) {
  console.log('.env already exists — leaving it untouched.');
  process.exit(0);
}

const template = readFileSync(resolve(root, '.env.example'), 'utf8');
const out = template.replace(/=change-me[\w-]*/g, () => `=${randomBytes(24).toString('base64url')}`);
writeFileSync(target, out, { mode: 0o600 });
console.log('Created .env with freshly generated local secrets.');
