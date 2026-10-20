#!/bin/sh
# One-shot database preparation for `docker compose up`. Every step is idempotent and
# non-destructive, so it is safe on every start and on existing volumes:
#   1. create/update the owner/app/system roles, databases and grants (never drops anything)
#   2. apply pending Prisma migrations (no-op when up to date)
#   3. SEED_DEMO=true: create the demo organizations that do not exist yet (skips existing ones)
set -eu

echo "fixflow-migrate: applying roles and grants"
node scripts/apply-roles.mjs

echo "fixflow-migrate: applying migrations"
./node_modules/.bin/prisma migrate deploy

if [ "${SEED_DEMO:-false}" = "true" ]; then
  echo "fixflow-migrate: seeding demo organizations (existing ones are left untouched)"
  node dist/seed/index.js
fi

echo "fixflow-migrate: done"
