# FixFlow

**Maintenance and field-service management for multi-building organizations** such as campuses, hospitals, residences, offices and malls.
People report a problem in seconds (from the web app or by scanning a QR label). Managers then:
- assign it with explainable technician recommendations
- track it against SLA targets with automatic warnings and escalation

Technicians work the job from their phone, even offline: checklist, photos, notes and submission.
The requester or a manager verifies the evidence before the work order is resolved, and every step lands in an audit trail and in analytics.

| | |
|---|---|
| **Web** | Next.js 16 (App Router, Turbopack), React 19, Tailwind 4, Radix UI, TanStack Query, Recharts |
| **API** | NestJS 12 (ESM) REST `/api/v1` + OpenAPI, Socket.IO realtime |
| **Worker** | Same codebase, second entrypoint: transactional outbox, BullMQ queues, SLA engine, automation |
| **Data** | PostgreSQL 17 with row-level security, Prisma 7, Redis 7 (BullMQ, rate limits, realtime), MinIO (S3) |
| **Tooling** | pnpm workspaces, Turborepo, Vitest, Playwright + axe, Docker Compose, GitHub Actions |

> Light theme only, by design. See [docs/UI_DESIGN_SYSTEM.md](docs/UI_DESIGN_SYSTEM.md).

---

## Quick start: everything in Docker

Prerequisites: Docker with Compose v2 and Node ≥ 22.12 (only needed to generate secrets).

```bash
node infrastructure/scripts/init-env.mjs   # creates .env with random local secrets (never overwrites)
docker compose up -d --build               # postgres, redis, minio, mailpit, migrate, api, worker, web
docker compose ps                          # wait until api / worker / web are "healthy"
```

The one-shot `migrate` service:
1. Creates the database roles.
2. Applies the migrations.
3. Seeds the demo organizations (`SEED_DEMO=true` by default).

Every step is idempotent: existing data and volumes are never reset.

| URL | What |
|---|---|
| http://localhost:3000 | FixFlow web app |
| http://localhost:4000/api/docs | Swagger UI (OpenAPI JSON at `/api/docs/openapi.json`) |
| http://localhost:4000/api/v1/health/ready | Readiness (database, Redis, object storage, outbox) |
| http://localhost:8025 | Mailpit, which catches every email (invitations, resets, notifications) |
| http://localhost:9001 | MinIO console (credentials `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` in `.env`) |

All ports bind to `127.0.0.1` only.

## Quick start: local development (hot reload)

Prerequisites: Node ≥ 22.12, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
node infrastructure/scripts/init-env.mjs
pnpm infra:up            # Postgres, Redis, MinIO, Mailpit in Docker (healthy before returning)
pnpm db:migrate          # roles + grants, then prisma migrate deploy
pnpm build               # builds shared/db packages (and generates the Prisma client)
pnpm db:seed             # demo data (idempotent: existing demo orgs are skipped)
pnpm dev                 # API on :4000 and web on :3000
pnpm dev:worker          # in a second terminal: outbox, SLA engine, automation
```

If you started the Docker app services earlier, stop them first: `docker compose stop web api worker`.

## Demo accounts

Every demo account uses the password **`FixFlow-Demo-2026`**. It is for local development only; the seed refuses to run in production unless explicitly allowed.

| Organization | Role | Email |
|---|---|---|
| Northbridge Institute of Technology (college) | Org admin | `admin@northbridge.demo` |
| | Manager | `priya.raman@northbridge.demo` |
| | Technician | `arjun.menon@northbridge.demo` (HVAC), `vikram.singh@northbridge.demo` (electrical) |
| | Requester | `kavya.iyer@northbridge.demo`, `rohan.das@northbridge.demo` |
| St. Aurelia General Hospital | Org admin | `admin@staurelia.demo` |
| | Manager | `marcus.webb@staurelia.demo` |
| | Technician | `samuel.okafor@staurelia.demo` |
| | Requester | `amara.nwosu@staurelia.demo` |
| Cedar Grove Residences | Manager | `dana.whitfield@cedargrove.demo` |
| | Technician | `luis.ortega@cedargrove.demo` |
| | Requester | `maria.gonzalez@cedargrove.demo` |
| Two organizations (switcher demo) | Manager at Northbridge, admin at Cedar Grove | `jordan.blake@fixflow.demo` |

## Common commands

| Command | Purpose |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ESLint and TypeScript across the workspace |
| `pnpm test` | Unit tests plus database RLS tests (needs `pnpm infra:up`) |
| `pnpm test:integration` | API integration suite against the separate `fixflow_test` database |
| `pnpm test:e2e` | Playwright against a running stack (see [docs/TESTING.md](docs/TESTING.md)) |
| `pnpm qa:screens` | Desktop and mobile screenshots of every main page (`VIEWPORTS=desktop,tablet,mobile` adds tablet) |
| `pnpm infra:up` / `pnpm infra:stop` | Start or stop the infrastructure containers (data is kept) |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` | Database management |
| `CONFIRM_RESET=yes pnpm db:reset` | **Destructive.** Rebuilds the local dev database; refuses without the flag |

## Repository layout

```
apps/api        NestJS API (src/main.ts) and worker (src/worker.ts): one image, two processes
apps/web        Next.js app: marketing, auth, application, public QR report, print labels
packages/shared Isomorphic domain logic: Zod schemas, permissions, workflow state machine, SLA math, scoring
packages/db     Prisma schema, migrations (incl. RLS policies), database client, demo seed
packages/config Shared tsconfig and ESLint configuration
tests/e2e       Playwright specs and the visual-QA capture script
infrastructure  Dockerfile helpers, env and reset scripts, Caddyfile example
docs            Product, architecture, security and operations documentation
```

## Documentation

- [PRD](docs/PRD.md): users, problems, scope
- [Architecture](docs/ARCHITECTURE.md): system design, async reliability, offline model
- [Database](docs/DATABASE.md): ERD, tenancy model, constraints
- [API](docs/API.md): conventions and the endpoint inventory
- [Security](docs/SECURITY.md): threat model and controls
- [UI design system](docs/UI_DESIGN_SYSTEM.md): tokens, components, accessibility
- [Testing](docs/TESTING.md), [Deployment](docs/DEPLOYMENT.md), [Decisions](docs/DECISIONS.md), [Roadmap](docs/ROADMAP.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md): what is verified, with test evidence
- [Contributing](CONTRIBUTING.md): conventions, boundaries and version-specific gotchas
