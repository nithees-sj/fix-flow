# syntax=docker/dockerfile:1.7
#
# FixFlow images. One Dockerfile, one pruned workspace per app (turbo prune), four targets:
#
#   api      NestJS HTTP API + Socket.IO        CMD node dist/main.js
#            (the worker runs the same image)   CMD node dist/worker.js
#   web      Next.js standalone server          CMD node apps/web/server.js
#   migrate  one-shot: DB roles → prisma migrate deploy → optional demo seed
#
# Build args:  APP (workspace package to prune for), API_INTERNAL_URL and
# NEXT_PUBLIC_REALTIME_URL (web only — Next inlines them at build time).
# All runtime stages run as the unprivileged `node` user.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
# openssl: required by Prisma's schema engine (migrate service).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable && corepack prepare pnpm@10.34.7 --activate
WORKDIR /repo

# ── Prune the monorepo to the target package and its workspace dependencies ──
FROM base AS pruner
ARG APP
COPY . .
RUN pnpm dlx turbo@2.11.9 prune "${APP}" --docker

# ── Install (cached on the lockfile) and build ───────────────────────────────
FROM base AS builder
ARG APP
COPY --from=pruner /repo/out/json/ ./
COPY .npmrc ./
RUN --mount=type=cache,id=fixflow-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ ./
ARG API_INTERNAL_URL=http://api:4000
ARG NEXT_PUBLIC_REALTIME_URL=http://localhost:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL} \
    NEXT_PUBLIC_REALTIME_URL=${NEXT_PUBLIC_REALTIME_URL}
RUN pnpm turbo run build --filter="${APP}"

# ── API / worker: production dependencies only ───────────────────────────────
FROM builder AS api-deploy
RUN --mount=type=cache,id=fixflow-pnpm-store,target=/pnpm/store \
    pnpm --filter @fixflow/api deploy --prod --legacy /out \
 && cp -r apps/api/dist /out/dist

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-deploy --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]

# ── Web: Next.js standalone output (traced files only) ───────────────────────
FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/sign-in').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]

# ── Migrate: idempotent roles + migrations (+ demo seed when SEED_DEMO=true) ──
FROM builder AS migrate
ENV NODE_ENV=production
COPY --chmod=0755 infrastructure/docker/migrate.sh /usr/local/bin/fixflow-migrate
RUN chown -R node:node /repo/packages/db
USER node
WORKDIR /repo/packages/db
CMD ["fixflow-migrate"]
