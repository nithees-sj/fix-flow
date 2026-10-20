# Implementation status

The verified state of FixFlow. A feature is marked **Verified** only when an automated test or a recorded check demonstrates it.
Last updated: 2026-10-20.

## Test results (latest runs)

| Suite | Command | Result |
|---|---|---|
| Domain unit tests (state machine, permissions, SLA math, scoring, recurrence, schemas) | `pnpm --filter @fixflow/shared test` | **145 passed** |
| API unit tests (analytics buckets, crypto, validation, problem details, sequential helper) | `pnpm --filter @fixflow/api test` | **20 passed** |
| Web unit tests (redirect safety) | `pnpm --filter @fixflow/web test` | **2 passed** |
| Database isolation (RLS, WITH CHECK, composite FKs, fail-closed, CHECK constraints) | `pnpm --filter @fixflow/db test` | **18 passed** |
| API integration (auth, lifecycle, cross-tenant sweep, worker reliability, analytics fixture) | `pnpm test:integration` | **71 passed** |
| Browser E2E + axe accessibility (Playwright/Chromium) against the **Docker production build** | `pnpm test:e2e` | **13 passed** |
| Lint and typecheck, whole workspace | `pnpm lint`, `pnpm typecheck` | **Clean** (0 errors, 0 warnings) |
| GitHub Actions: verify job and Docker + E2E job | `.github/workflows/ci.yml` | **Both green** on github.com ([run 39452462993](https://github.com/nithees-sj/fix-flow/actions/runs/39452462993)) |

## Phase gates

| Phase | Status |
|---|---|
| 2: Monorepo, Docker infra, schema, RLS | Done |
| 3: Core product (auth → org → report → assign → work → verify → dashboard) | Done; E2E gate passed |
| 4: Worker, outbox, SLA engine, notifications, realtime, QR | Done |
| 5: Analytics, settings, landing, polish | Done |
| 6: Offline, preventive maintenance, automation | Done |
| 7: Security review, visual QA, Docker, CI, docs | Done (see the known issues below) |

## Feature matrix

| Area | Feature | Status | Evidence |
|---|---|---|---|
| Auth | Register, login, logout, refresh rotation, reuse detection, CSRF | Verified | `auth.test.ts`, E2E |
| Auth | Password reset (single-use, revokes sessions), email verification | Verified | `auth.test.ts` |
| Auth | Per-account brute-force lockout (no account enumeration) | Verified | `auth.test.ts` |
| Tenancy | RLS on all tenant tables, composite tenant FKs, system-role separation | Verified | `rls.test.ts` |
| Tenancy | Cross-tenant sweep over every parameterized route; body and filter injection; side channels | Verified | `tenant-isolation.test.ts` |
| Tenancy | Socket room isolation, single-use realtime tickets | Verified | `tenant-isolation.test.ts` |
| Organizations | Create organization with a starter catalog; onboarding wizard | Verified | E2E |
| Team | Invitations by email (outbox → worker → SMTP/Mailpit), acceptance, roles, skills, availability | Verified | E2E, `worker.test.ts` |
| Work orders | Create, list/filter/sort/paginate, detail, timeline, comments, internal notes | Verified | lifecycle tests, E2E |
| Work orders | Full state machine including reject/rework, close, reopen (new SLA cycle), cancel | Verified | lifecycle tests, shared unit tests |
| Work orders | Optimistic concurrency (409), idempotency keys | Verified | lifecycle tests, offline E2E |
| Evidence | Magic-byte validation, `sharp` re-encode, private storage, authorized streaming | Verified | lifecycle tests, E2E |
| Assignment | Explainable technician ranking; auto-assign (AUTO mode) | Verified | lifecycle and worker tests, E2E |
| SLA | Deadlines, warnings, breaches, escalation, duplicate-safe jobs, Redis-loss sweep | Verified | `worker.test.ts` |
| Async | Transactional outbox, SKIP LOCKED dispatch, concurrent dispatchers, email ledger | Verified | `worker.test.ts` |
| Realtime | Live updates across users and roles | Verified | E2E |
| Dashboard and analytics | Role-aware KPIs; trends, SLA, distributions, technicians, asset failures, CSV export | Verified | `analytics.test.ts` (hand-computed), E2E |
| Preventive maintenance | Schedules UI, idempotent generation, run-now, auto-close | Verified | `worker.test.ts`, visual QA |
| Offline | Service worker, IndexedDB snapshots and outbox, exactly-once sync, conflict UI | Verified | `field-and-qr.spec.ts` (Docker production build) |
| QR | Label generation and rotation, print sheet, public report page, guest mode | Verified | `tenant-isolation.test.ts`, E2E |
| Assets, locations, team, notifications, settings, audit log, command palette | Pages wired to the API | Verified | axe E2E pages, visual QA |
| Landing page | Product preview, features, use cases, FAQ | Verified (visual) | Visual QA |
| Accessibility | axe: no serious or critical violations on public and application pages | Verified | `accessibility.spec.ts` |
| Docker | Infra plus migrate, api, worker and web images; healthy; existing volumes reused | Verified | `docker compose ps`, E2E against the stack |
| CI | Lint, typecheck, unit, DB, integration, build, Docker + Playwright | Verified | GitHub Actions run |

## Visual QA

The final pass ran `pnpm qa:screens` against the Docker production build: 21 pages at 1440 px and 390 px, 42 screenshots.
These were reviewed after the final fixes:
- landing
- analytics (desktop and mobile)
- schedules
- work-order detail (mobile)
- SLA settings
- organization settings (mobile)
- notifications

The earlier passes covered sign-in and sign-up, the dashboard, the work-order list, detail and create pages, my-work, onboarding, locations,
team, permissions and assets. The 834 px tablet viewport was **not** reviewed in the final pass.

## Security review (2026-10-20)

The review was done manually against the code. Fixed:
- An open redirect via `/\host` in the post-sign-in `next` parameter
- Missing per-account sign-in throttling
- Duplicated text in SLA notifications

Checked and found sound:
- Invitation email binding
- Reset-token single use
- Download headers
- CSV formula neutralization
- Log redaction
- CSP and helmet headers
- Swagger over HTTP

Details are in [SECURITY.md](SECURITY.md).

## Known issues and limitations

- **Prisma 7.10 issues concurrent queries on one transaction connection** for some nested reads. Node prints a `pg` deprecation
  warning once per process. It works on `pg` 8 (pinned `^8`), but `pg` 9 would break it, so re-check this when upgrading Prisma or `pg`.
  All of FixFlow's own concurrent reads inside transactions were made sequential (`inSequence`).
- The web CSP allows `'unsafe-inline'` scripts (Next.js bootstrap). Nonce-based CSP is on the roadmap.
- The ON_HOLD status does not pause the SLA clock (ADR-017).
- Registration reveals that an email is already taken.
- Swagger UI is public on the API port; restrict it at the proxy if needed.
- Email is at-least-once at the SMTP provider boundary.
- E2E needs raised per-IP auth limits for the run (docs/TESTING.md).
- Two analytics tables (SLA by priority, technician performance) scroll horizontally inside their cards on phones.
- Official MinIO images are no longer published; the stack uses Chainguard's MinIO pinned by digest (ADR-010).
