import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';

/** Loads the monorepo root `.env` (with ${VAR} expansion) without overriding real env vars. */
export function loadEnv() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const file = resolve(root, '.env');
  if (existsSync(file)) expand(dotenv.config({ path: file, quiet: true }));
}
