# Architecture decision records

Short ADRs. The status is "Accepted" unless noted.

## ADR-001: Modular monolith with the worker as a second entrypoint

**Context.** Background processing needs the same notification, SLA, audit and work-order logic as the API.
**Decision.** `apps/api` has `src/main.ts` (HTTP and WebSocket) and `src/worker.ts`. They ship as one image with two commands, run as
separate Compose services, and scale independently.
**Consequences.** There is no duplicated business logic and no package exists only for sharing. The API and worker are deployed together,
which is acceptable and safer.

## ADR-002: One `@fixflow/shared` package for types, schemas and domain rules

**Decision.** Merge "types" and "validation" into `packages/shared`. DTO types are inferred from Zod; the state machine, SLA math,
scoring and permissions are pure functions used by both the API and the web app.
**Consequences.** The UI's available actions can't drift from server enforcement.

## ADR-003: Tenant isolation in the database (RLS), not only in the ORM

**Decision.**
- Postgres RLS on every tenant table, under a NOBYPASSRLS runtime role.
- Transaction-local `set_config` context.
- Composite tenant foreign keys.
- A separate BYPASSRLS role confined to an audited list of paths.

**Rejected.** Isolation enforced only by Prisma query extensions. It doesn't cover raw SQL, and nested-write coverage is easy to miss.
**Consequences.** Every tenant query runs in a short transaction, which adds a little overhead. A forgotten filter returns zero rows
instead of leaking data.

## ADR-004: Single `Location` table with a type hierarchy

**Decision.** One self-referencing `Location` table (SITE, BUILDING, FLOOR, ROOM, AREA) with allowed parent types validated in the
service, instead of separate building, floor and room tables.
**Consequences.** It models colleges, hospitals and malls uniformly. Subtree filters use the in-memory location index or recursive queries.

## ADR-005: Single `Category` taxonomy

**Decision.** One category list drives work orders, asset default issue types, technician skills and default checklists.
**Consequences.** Skill matching is trivial and administration is simpler. A separate asset-class taxonomy can be added later if needed.

## ADR-006: Fixed roles plus policy toggles (no custom roles in v1)

**Decision.** Four roles with a static permission matrix, plus organization policy toggles (requester verification, self-assign,
requester visibility, evidence requirement, reopen window, auto-close, auto-assign mode, QR mode).
**Consequences.** Authorization is predictable and fully tested. Custom roles are on the roadmap.

## ADR-007: Transactional outbox in front of BullMQ

**Decision.** Business transactions write `OutboxEvent` rows. A dispatcher moves them into BullMQ (`SKIP LOCKED`, lease,
`jobId = outbox id`), and processors are idempotent via unique keys.
**Rejected.** Enqueueing directly from request handlers. That loses jobs on a crash between commit and enqueue, and duplicates them on retries.
**Consequences.** Delivery survives crashes and Redis loss (recovered by sweeps), at the cost of up to 2 s latency, which the Redis nudge
usually reduces to milliseconds.

## ADR-008: Custom Zod validation pipe instead of nestjs-zod

**Context.** nestjs-zod's peer ranges don't include NestJS 12.
**Decision.** A small `ZodValidationPipe` plus `@ZBody` and `@ZQuery` decorators that also emit OpenAPI schemas via `z.toJSONSchema`.

## ADR-009: Custom Redis throttler storage

**Context.** `@nest-lab/throttler-storage-redis` is incompatible with the installed `@nestjs/throttler` and Nest 12.
**Decision.** An atomic Lua-based `ThrottlerStorage` implementation on the shared ioredis client.

## ADR-010: MinIO image from Chainguard, pinned by digest

**Context.** Official MinIO images are no longer published on Docker Hub or Quay.
**Decision.** Use `cgr.dev/chainguard/minio`, built from source and publicly available, pinned by digest. The API creates the bucket on boot,
so no `mc` init container is needed.

## ADR-011: Stable double-submit CSRF token

**Decision.** `ff_csrf` is issued once (when absent) and stays stable for the browser session, instead of rotating per request.
**Consequences.** Parallel requests and multiple tabs never race on token rotation. Security relies on the attacker being unable to read
the cookie (same-origin policy), plus SameSite=Lax.

## ADR-012: Browser → web origin → API (Next rewrites); Socket.IO direct with tickets

**Decision.** REST goes through Next.js rewrites, so cookies are first-party and no CORS is needed. WebSockets connect to the API using a
single-use, 60-second ticket fetched over REST, so the httpOnly token is never exposed. In production, a single-origin reverse proxy
routes `/realtime` to the API.

## ADR-013: Prisma 7.10 and TypeScript 6.0 pinned

**Context.** npm's `latest` tag for Prisma pointed at an 8.0 release candidate; `@nestjs/cli` 12 requires TypeScript ~6.0.
**Decision.** Pin Prisma 7.10.1 (`prisma-client` generator, ESM output, `@prisma/adapter-pg`) and TypeScript ~6.0.3 workspace-wide.

## ADR-014: Hand-written service worker and IndexedDB outbox for offline

**Decision.** A minimal `public/sw.js` (production only) for the app shell, `idb` snapshots, and a custom outbox with
idempotency keys and version-checked conflicts.
**Rejected.** Serwist and next-pwa, because of Turbopack-compatibility risk and less control over conflict handling.

## ADR-015: Light theme only

**Decision.** A single, carefully tuned light theme with semantic tokens and no dark variant, as required by the product brief.
The tokens are semantic, so adding a theme later would be mechanical.

## ADR-016: Disable `consistent-type-imports` in the API

**Context.** Without type-aware linting, the rule rewrites constructor-injected classes to `import type`. That erases the runtime
reference Nest's decorator metadata needs, which silently breaks dependency injection.
**Decision.** Keep the rule for the other packages and disable it in `apps/api`.

## ADR-017: SLA clock semantics

**Decision.**
- Response ends at the first `start`.
- Resolution ends at the `submittedAt` of the approved submission, so requester review time doesn't count against technicians.
- Deadlines are snapshotted at creation and recomputed on priority change or reopen (a new cycle).
- ON_HOLD does **not** pause the clock in v1.

Pause-aware clocks are on the roadmap.
