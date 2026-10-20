# Implementation status

Honest, verified state of FixFlow. A feature is marked **Verified** only when an automated test or a
recorded manual check demonstrates it. Last updated: 2026-10-20 (core-workflow gate).

## Test results (latest run)

| Suite | Command | Result |
|---|---|---|
| Domain unit tests (state machine, permissions, SLA math, scoring, recurrence, schemas) | `pnpm --filter @fixflow/shared test` | **145 passed** |
| Database isolation (RLS, WITH CHECK, composite FKs, fail-closed, CHECK constraints) | `pnpm --filter @fixflow/db test` | **18 passed** |
| API integration (auth, lifecycle, cross-tenant route sweep, worker reliability) | `pnpm test:integration` | **53 passed** |
| Browser E2E — core workflow (Playwright/Chromium) | `pnpm test:e2e` | **8 passed** |

## Phase gates

| Phase | Status |
|---|---|
| 2 — Monorepo, Docker infra, schema, RLS | Done |
| 3 — Core product (auth → org → report → assign → work → verify → dashboard) | **Gate passed** (E2E 8/8) |
| 4 — Worker, outbox, SLA engine, notifications, realtime | Backend done and tested; QR public reporting UI pending |
| 5 — Analytics, settings, landing, polish | In progress |
| 6 — Offline, scheduled maintenance, automation | Offline queue + snapshots built (E2E pending); schedule generation tested |
| 7 — Final validation | Not started |

## Feature matrix

| Area | Feature | Status | Evidence |
|---|---|---|---|
| Auth | Register, login, logout, refresh rotation, reuse detection, CSRF | Verified | `auth.test.ts` |
| Auth | Password reset (single-use, revokes sessions), email verification | Verified (API) | `auth.test.ts` |
| Tenancy | RLS on all tenant tables, composite tenant FKs, system-role separation | Verified | `rls.test.ts` |
| Tenancy | Cross-tenant route sweep over every parameterized route | Verified | `tenant-isolation.test.ts` |
| Tenancy | Socket room isolation, single-use realtime tickets | Verified | `tenant-isolation.test.ts` |
| Orgs | Create organization + starter catalog, onboarding wizard | Verified | E2E step 1 |
| Team | Invitations via email (outbox → worker → SMTP/Mailpit), acceptance | Verified | E2E step 2, `worker.test.ts` |
| Work orders | Create, list/filter/sort/paginate, detail, timeline, comments, internal notes | Verified | `work-order-lifecycle.test.ts`, E2E |
| Work orders | Full state machine incl. reject/rework, close, reopen (new SLA cycle), cancel | Verified | lifecycle tests |
| Work orders | Optimistic concurrency (409 VERSION_CONFLICT), idempotency keys | Verified | lifecycle tests |
| Evidence | Upload with magic-byte validation, sharp re-encode, private storage, authorized streaming | Verified | lifecycle + E2E step 5 |
| Assignment | Explainable technician ranking, auto-assign (AUTO mode) | Verified | lifecycle + worker tests |
| SLA | Deadlines, warnings, breaches, escalation, duplicate-safe jobs, Redis-loss sweep | Verified | `worker.test.ts` |
| Async | Transactional outbox, SKIP LOCKED dispatch, exactly-once email ledger | Verified | `worker.test.ts` |
| Realtime | Live list updates across users | Verified | E2E step 3 |
| Dashboard | Role-aware KPIs, volume trend, priority, workload, overdue, activity | Verified (E2E) | E2E step 7 |
| Preventive maintenance | Schedule generation (idempotent), auto-close | Verified (backend) | `worker.test.ts` |
| Offline | IndexedDB outbox, snapshots, conflict UI | Built — **E2E not yet written** | — |
| Analytics | Report endpoint + CSV export | Built — UI pending | — |
| Assets / locations / team / settings / analytics / notifications pages | — | **In progress** | — |
| QR | QR generation endpoints | Built — public report page pending | — |
| Landing page | — | Interim page only | — |
| Docker | Infra containers (Postgres, Redis, MinIO, Mailpit) | Verified (healthy) | `docker compose ps` |
| Docker | App images (api, worker, web) | Not started | — |
| CI | GitHub Actions workflow | Not started | — |

## Known issues / limitations

- E2E runs against the running development stack and creates a uniquely named organization per run.
- MinIO official images are no longer published on Docker Hub; the stack uses Chainguard's
  source-built MinIO image pinned by digest (see `docs/DECISIONS.md`).
- SMTP delivery is at-least-once at the provider boundary (documented in ARCHITECTURE).
