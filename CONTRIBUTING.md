# Contributing to FixFlow

Guidance for contributors. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and
[docs/SECURITY.md](docs/SECURITY.md) before changing data access, auth or async code.

## Non-negotiables

- **Never destroy Docker data.** No `docker compose down -v`, no `docker volume rm`, no `db:reset`
  without explicit permission. Tests use only the `fixflow_test` database and Redis db 1.
- **Light theme only.** Use the semantic tokens in `apps/web/app/globals.css` (`bg-surface`,
  `text-ink-3`, `border-line`, …). Never add raw hex colors or a dark variant.
- **Tenant isolation is enforced by Postgres RLS.** Tenant reads and writes go through
  `db.tx(actor.ctx, …)` (role `fixflow_app`, NOBYPASSRLS). `db.system` (BYPASSRLS) is only for the
  audited paths listed in SECURITY.md. Adding a new one needs a reason in the code and an entry there.
- **No status writes outside the state machine.** Lifecycle changes go through
  `POST /work-orders/:id/transitions` → `TransitionsService`, which uses `evaluateTransition` from
  `@fixflow/shared`.
- **Side effects go through the outbox.** Write `OutboxEvent` rows in the same transaction as the business
  change (`OutboxService.add`). Never enqueue BullMQ jobs or send email directly from a request.
- Be honest in `docs/IMPLEMENTATION_STATUS.md`. Only mark something verified when a test or a recorded check proves it.

## Layout and boundaries

| Package | Rules |
|---|---|
| `packages/shared` | Pure, isomorphic TypeScript (no Node or DOM APIs). Zod schemas are the single source of DTO validation for both the API and the web forms. |
| `packages/db` | Prisma schema, SQL migrations (RLS, CHECK constraints, composite FKs), `Database` class, seed. |
| `apps/api` | Thin controllers; business rules in services. `src/worker.ts` is the second entrypoint (same modules). |
| `apps/web` | Client components fetch through `lib/api.ts` (CSRF, refresh, problem+json errors). Query keys live in `lib/query-client.ts`. |

## Version-specific gotchas (verified against the installed packages)

- **Next 16**: middleware is `proxy.ts`; `params` and `searchParams` are Promises; no `next lint`.
  `next.config.ts` is evaluated at **build time**: `API_INTERNAL_URL` and `NEXT_PUBLIC_REALTIME_URL`
  are baked in (declared in `turbo.json` `build.env`).
- **Prisma 7.10** (not the 8.0 RC): `prisma.config.ts`, the `prisma-client` generator (ESM, `.js` extensions) and
  `@prisma/adapter-pg`. The generated client lives in `packages/db/generated` (gitignored; `pnpm build` regenerates it).
- **NestJS 12** is ESM (`nodenext`): relative imports need `.js`. The API's ESLint config disables
  `consistent-type-imports`, because `import type` on constructor-injected classes breaks DI metadata.
- **Zod 4** with a custom `ZodValidationPipe` (`@ZBody`, `@ZQuery`): nestjs-zod does not support Nest 12.
- **TanStack Query** defaults are changed: queries use `networkMode: 'offlineFirst'` and mutations `'always'`, because the offline
  outbox decides what happens without a network.
- React Compiler lint rules apply: don't `setState` synchronously in effects. Use derived state
  ("edits layered over server data") or a keyed child component that seeds `useState` from props.

## Everyday commands

```bash
pnpm infra:up && pnpm db:migrate && pnpm build && pnpm db:seed
pnpm dev            # api + web
pnpm dev:worker     # worker (separate terminal)
pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration
pnpm test:e2e       # needs a running stack; raise auth rate limits (docs/TESTING.md)
pnpm qa:screens     # screenshots into tests/e2e/visual/screens; review them after UI work
```

Schema change: edit `schema.prisma`, run `pnpm db:migrate:dev --name <change>`, then review the SQL. Tenant
tables need `organization_id`, an RLS policy (see the `rls_and_constraints` migration) and
composite FKs to their parents. Add a fixture for any new `:id` route to the cross-tenant route sweep
in `apps/api/test/integration/tenant-isolation.test.ts`. The sweep fails until you do.

## Commit conventions

Small, focused commits with an imperative subject. Lint, typecheck and the relevant tests must pass
before committing.
