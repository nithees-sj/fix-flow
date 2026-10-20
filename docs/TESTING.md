# Testing

| Layer | Tool | Location | Needs |
|---|---|---|---|
| Domain unit | Vitest | `packages/shared/test` | Nothing |
| API unit | Vitest | `apps/api/test/unit` | Nothing |
| Web unit | Vitest | `apps/web/lib/*.test.ts` | Nothing |
| Database isolation | Vitest + `pg` | `packages/db/test` | `pnpm infra:up`, `pnpm db:roles` |
| API integration | Vitest + supertest | `apps/api/test/integration` | `pnpm infra:up`, `pnpm db:roles` |
| End-to-end + accessibility | Playwright (Chromium) + axe | `tests/e2e/specs` | A running stack |
| Visual QA | Playwright screenshots | `tests/e2e/visual/capture.mjs` | A running stack with demo data |

## Isolation from development data

- Database and integration tests use **only** the `fixflow_test` database: `TEST_DATABASE_*_URL` in `.env`. The
  helpers refuse any URL whose database name doesn't end in `_test`.
- Their global setup runs `prisma migrate deploy` against the test database, and each suite truncates the test tables.
- Integration tests use Redis **db 1**. The harness refuses to flush db 0.
- E2E tests create a uniquely named organization and accounts per run, so they never modify the demo organizations.

## Commands

```bash
pnpm test               # shared, API and web unit tests, plus database RLS tests
pnpm test:integration   # API integration suite
pnpm test:e2e           # Playwright against BASE_URL (default http://localhost:3000)
pnpm qa:screens         # screenshots into tests/e2e/visual/screens
```

### Running E2E

E2E needs the API, the worker, the web app and Mailpit (invitation emails are read from the Mailpit API).

The suite signs in many times from one IP, so raise the per-IP auth limits **for the test run only**:

```bash
# Docker stack
AUTH_RATE_LIMIT_PER_MINUTE=500 SIGNUP_RATE_LIMIT_PER_MINUTE=500 docker compose up -d --build --wait web worker
pnpm exec playwright install chromium   # first time only
pnpm test:e2e
docker compose up -d api                 # restore the default limits afterwards

# or the host dev servers
AUTH_RATE_LIMIT_PER_MINUTE=500 SIGNUP_RATE_LIMIT_PER_MINUTE=500 pnpm dev
pnpm dev:worker
pnpm test:e2e
```

The offline specs exercise the service worker, which is registered only in production builds. They pass against both
`next dev` and the Docker (production) build.

## What the suites prove

| Suite | Highlights |
|---|---|
| `packages/shared` (145) | Every transition × role × policy (allowed and denied), permission matrix, SLA math and cycles, assignment scoring, recurrence (month-end, time zones), Zod schemas |
| `apps/api/test/unit` (18) | Analytics bucket keys (time zone, DST, Monday weeks), argon2id and secrets, validation pipes, problem-details mapping (FK and RLS violations → 404, no SQL leakage) |
| `packages/db` (18) | RLS as `fixflow_app`: no cross-tenant reads via raw SQL or `include`; WITH CHECK rejects foreign `organization_id`; composite FKs reject cross-tenant connects; no context → zero rows; CHECK constraints |
| `auth.test.ts` (12) | Cookies, CSRF, refresh rotation and reuse detection, logout, password reset, enumeration safety, per-account lockout |
| `work-order-lifecycle.test.ts` (19) | Full lifecycle with SLA timestamps, suggestions, evidence rules, reject and rework, reopen, cancel, version conflicts, idempotent replay, disguised-file rejection |
| `tenant-isolation.test.ts` (15) | Route sweep across every parameterized route; body and filter injection; attachments, CSV, search, notifications; socket rooms; QR data minimization |
| `worker.test.ts` (13) | Outbox dispatch, duplicate delivery → one effect, crash between commit and enqueue, concurrent dispatchers, Redis flush → sweep recovery, exactly-once email, schedules, auto-close, auto-assign |
| `analytics.test.ts` (12) | Hand-computed fixture: time zone buckets, distributions, trends, SLA verdicts, technician scores, asset failures, role scoping, tenant exclusion, CSV |
| E2E `core-workflow` (8) | Sign-up → onboarding → invitations via real email → requester reports → manager sees it live and assigns → technician on a phone works and submits evidence → requester approves → dashboard; negative access checks |
| E2E `field-and-qr` (3) | Offline queue syncs exactly once; offline conflict surfaced; guest QR report |
| E2E `accessibility` (2) | axe scans of public and application pages (no serious or critical violations) |

## CI

`.github/workflows/ci.yml` has two jobs:
- **verify:** lint, typecheck, Docker infra, unit and DB tests, integration tests, build
- **e2e:** builds the full Docker stack, runs Playwright, and uploads the report on failure

The workflow has been written and validated locally step by step. It has not run on GitHub from this environment.
