# Deployment

FixFlow ships as three images built from the root `Dockerfile`. Nothing is deployed automatically; production rollout is a
deliberate operator action.

| Image (target) | Process | Port | Health |
|---|---|---|---|
| `api` | `node dist/main.js`: REST, Swagger, Socket.IO | 4000 | `GET /api/v1/health/live` (liveness), `/health/ready` (database, Redis, S3, dead outbox count) |
| `api` | `node dist/worker.js`: outbox, SLA, automation | — | Heartbeat file (`WORKER_HEARTBEAT_FILE`) touched after every outbox pass |
| `web` | `node apps/web/server.js` (Next standalone) | 3000 | `GET /sign-in` |
| `migrate` | One-shot: roles → `prisma migrate deploy` → optional seed | — | Exit code 0 |

All images use `node:24-bookworm-slim` and run as the non-root `node` user.

## Build-time and runtime configuration

**Web, at build time.** These are baked into the Next build:

| Variable | Example | Purpose |
|---|---|---|
| `API_INTERNAL_URL` | `http://api:4000` | Server-side rewrite target for `/api/v1/*` |
| `NEXT_PUBLIC_REALTIME_URL` | `https://fixflow.example.com` | Browser WebSocket origin; also used in the CSP `connect-src` |

**API and worker, at runtime.** Validated at boot by Zod; invalid configuration fails fast.

| Variable | Notes |
|---|---|
| `NODE_ENV=production` | |
| `DATABASE_URL` | `fixflow_app` role (RLS enforced) |
| `DATABASE_SYSTEM_URL` | `fixflow_system` role (audited paths only) |
| `REDIS_URL` | Password required; use `maxmemory-policy noeviction` for BullMQ |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` | Any S3-compatible store. The bucket must be private; the API creates it on boot if missing |
| `MAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | |
| `JWT_ACCESS_SECRET` | ≥ 32 random characters |
| `COOKIE_SECURE=true` | Required in production. The API refuses to start otherwise unless `ALLOW_INSECURE_COOKIES=true`; never set that in production |
| `APP_WEB_URL`, `CORS_ORIGINS` | The public origin |
| `LOG_LEVEL` | `info` |

**Migrate.** Needs `DATABASE_SUPERUSER_URL` (only to create roles and databases), `DATABASE_OWNER_URL` and the
`FIXFLOW_*_PASSWORD` values. Set `SEED_DEMO=false` in production.

## Topology

Put the stack behind a TLS-terminating reverse proxy on **one origin**: [`infrastructure/Caddyfile.example`](../infrastructure/Caddyfile.example).
- `/realtime/*` goes to the API (WebSocket).
- Everything else goes to the web server, which proxies `/api/v1/*` to the API.

Cookies stay first-party, and REST needs no CORS.

Scaling:
- **API:** stateless; run N replicas. Socket.IO uses the Redis adapter, and rate limits, tickets and the denylist live in Redis.
- **Worker:** run one or more replicas. Outbox claims use `SKIP LOCKED`, and BullMQ distributes jobs.
- **Web:** stateless.

## Release procedure

1. Build and tag the images (CI builds them on every push).
2. Back up the database (below).
3. Run `migrate` to completion. Migrations are forward-only, and Prisma applies each one in a transaction.
4. Roll the API and worker, then the web.
5. Watch `/health/ready`, the logs (pino JSON) and the dead-outbox count.

### Rollback

- **App-only release** (no migration): redeploy the previous image tags.
- **Release with a migration:** migrations are written to be backward-compatible with the previous app version (expand, then
  contract). Roll back the app images first. Revert a schema change only with a new corrective migration, or restore from backup
  as a last resort.

## Backup and restore

```bash
# Backup (custom format, compressed)
docker compose exec -T postgres pg_dump -U postgres -d fixflow -Fc > fixflow-$(date +%F).dump

# Restore into an EMPTY database (never over live data without a decision to do so)
docker compose exec -T postgres pg_restore -U postgres -d fixflow_restore --no-owner < fixflow-YYYY-MM-DD.dump
pnpm db:roles   # re-apply grants for the runtime roles
```

- Back up object storage (the `org/{orgId}/…` keys) alongside the database, for example with `mc mirror` or the provider's
  snapshot or versioning features.
- Redis holds queues, rate-limit counters and caches. Losing it is recoverable: the outbox and the SLA sweep rebuild scheduled work
  from Postgres. AOF persistence is still enabled.

## Local Docker stack

```bash
node infrastructure/scripts/init-env.mjs
docker compose up -d --build
docker compose ps
docker compose logs -f api worker
docker compose stop             # stop, keeping data
```

Data lives in the named volumes `fixflow_pgdata`, `fixflow_redisdata` and `fixflow_miniodata`. `docker compose down` keeps them;
**`docker compose down -v` deletes all local data** and is never part of any script.
