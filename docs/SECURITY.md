# Security

## Threat model (summary)

| Asset | Main threats | Primary controls |
|---|---|---|
| Tenant data | One organization reading or modifying another's data (IDOR, missing filters, nested writes, raw SQL) | Postgres RLS under a NOBYPASSRLS runtime role; composite tenant FKs; server-derived tenant context; 404 for foreign ids; route-sweep tests |
| Accounts | Credential stuffing, session theft, CSRF | argon2id; per-IP and per-account sign-in limits; httpOnly cookies; refresh rotation with reuse detection; double-submit CSRF |
| Files | Malicious uploads, metadata leaks, direct bucket access | Magic-byte allowlist, `sharp` re-encode (EXIF/GPS stripped), private bucket, authorized streaming with a sandbox CSP |
| Public QR endpoint | Abuse, scraping, spam | Unguessable rotatable tokens, minimal response, honeypot, strict rate limits, org-level mode (authenticated by default) |
| Background jobs | Cross-tenant side effects, replay | Org id in the payload re-checked against DB state; tenant transactions for per-org work; unique-key idempotency |

## Multi-tenant isolation (defense in depth)

1. **Context.** The organization comes only from the server-side session. `TenantGuard` re-verifies the membership on every request
   (60 s Redis cache, invalidated on membership changes), so a suspended or removed member loses access immediately.
   The client never supplies a trusted org id.
2. **Row-level security.** Every tenant table has `USING` and `WITH CHECK` policies on `app_current_org()`. Tenant code runs in
   `db.tx(ctx, fn)` as `fixflow_app` (NOBYPASSRLS) with transaction-local `set_config`. With no context, queries return zero rows.
3. **Relation ownership in the database.** Composite FKs `(organization_id, x_id) → (organization_id, id)` reject cross-tenant
   references in nested `connect` and create operations and in raw SQL.
4. **Application checks.** Services resolve foreign ids inside the tenant transaction (a clean 404). The custom ESLint rule
   (`tenantSafety`) forbids `connect: { id }` on tenant models and any use of `$queryRawUnsafe` / `$executeRawUnsafe`.
5. **Raw SQL.** Only `Prisma.sql` tagged templates. Analytics also filters `organization_id` explicitly.
6. **Side channels.**
   - Attachment downloads, CSV export, search, notifications and the realtime room join all run under the same checks.
   - Realtime payloads are invalidation hints only.
   - QR responses expose only the organization display name, the target name and the category list.

**Evidence:**
- `packages/db/test/rls.test.ts` (18 tests, run as the real runtime role)
- `apps/api/test/integration/tenant-isolation.test.ts`, which sweeps **every registered parameterized route** as another org's user
  and fails when a new route has no fixture. It also covers body and filter injection, sockets and public QR minimization.

### Audited system-role paths (`fixflow_system`, BYPASSRLS)

These are the only places that bypass RLS. Each one is narrow and needed because no tenant context exists yet, or because the work
spans tenants by design.

| Path | Why |
|---|---|
| `auth.service.ts`: register, login lookup, password reset and email verification tokens | No session or tenant exists yet |
| `session.service.ts`: session create, refresh, rotation, family revocation, membership check on switch | Sessions are user-level and span organizations |
| `invitations.service.ts`: invitation lookup and accept by token | The invitee is not a member yet |
| `public-report.controller.ts`: QR token → target resolution, member check | Anonymous or not-yet-scoped caller; returns minimal fields |
| `outbox.dispatcher.ts` | Drains the outbox across tenants (claims rows only; no business data is read) |
| `sla.engine.ts` (sweep), `automation.service.ts` (due auto-close, schedules) | Find due items across tenants, then process each **inside that org's tenant transaction** |
| `email.processor.ts` | Recipient addresses and the delivery ledger for emails, including account emails with no org |
| `health.controller.ts` | `SELECT 1` and the dead-outbox count |

Adding a path requires a comment in the code explaining why, plus an entry in this table.

## Authentication and sessions

- **Passwords.** argon2id (`@node-rs/argon2`, OWASP parameters: 19 MiB, t=2, p=1), minimum 10 characters. Login does a dummy
  verify for unknown emails (timing-safe) and returns one generic error.
- **Brute force.**
  - Per-IP limits on credential endpoints (Redis-backed throttler).
  - A per-account budget of 10 failed sign-ins per 15 minutes, keyed by the email hash for every submitted email, whether or not
    the account exists. It is cleared on a successful sign-in and on password reset.
- **Tokens.**
  - Access JWT (HS256, 15 min) in the `ff_at` httpOnly, SameSite=Lax cookie (Secure in production).
  - Opaque 32-byte refresh token in `ff_rt` (path `/api/v1/auth`), stored only as SHA-256. It rotates on every refresh;
    **reuse of a rotated token revokes the whole session family**, with a 20 s grace period for concurrent tabs.
  - Revoked sessions go on a Redis denylist, so their access tokens stop working immediately.
- **CSRF.** Double-submit: a stable `ff_csrf` cookie, which must match `x-csrf-token` on every mutation. Combined with SameSite=Lax.
- **Recovery.** Single-use, hashed reset and verification tokens with expiry (reset: 30 min). Forgot-password always returns 202.
  A reset revokes every session and sends a "password changed" email.
- **Production guard.** The API refuses to boot with `NODE_ENV=production` and `COOKIE_SECURE=false` unless
  `ALLOW_INSECURE_COOKIES=true`. That override is set only in the local docker-compose demo.

## Authorization

A static role → permission matrix (`packages/shared/src/permissions.ts`), enforced by `PermissionsGuard`, plus resource-level
rules in services:
- Requesters see their own work orders.
- Technicians see assigned work (and open work when self-assign is on).

The state machine checks the actor and the organization's policy for every transition. Cross-tenant and invisible records return
404, not 403.

## Input, output and files

| Area | Controls |
|---|---|
| Validation | Zod on every body and query (`ZodValidationPipe`); UUID params are validated, and malformed ones return 404. The JSON body limit is 1 MB |
| Errors | Problem+json only; stack traces and SQL never reach clients. FK and RLS violations map to a generic 404 |
| Uploads | 10 MB limit and a magic-byte allowlist (JPEG, PNG and WebP, all re-encoded; PDF). File names are reduced to ASCII. Files are stored under `org/{orgId}/` in a private bucket |
| Downloads | Streamed only after authorization, with `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, and `attachment` disposition for PDFs |
| CSV export | Formula-injection neutralization (`=`, `+`, `-`, `@`, tab, CR prefixed with `'`); every export is audited |
| Redirects | `safeNext` allows only same-origin relative paths; backslashes and control characters are rejected |
| Logging | pino with redaction of cookies, the authorization header, CSRF headers and `set-cookie` |

## HTTP hardening

- **API.** `helmet` (CSP, HSTS, frame-ancestors none, …), a CORS allowlist with credentials for the realtime origin, and `trust proxy` = 1.
- **Web.** A strict CSP (`default-src 'self'`; `connect-src` limited to self and the realtime URL; `frame-ancestors 'none'`;
  `object-src 'none'`), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `poweredByHeader` off.

## Infrastructure

- Every Compose port binds to `127.0.0.1`. Redis requires a password. Each service has its own generated secret
  (`init-env.mjs`), and `.env` is gitignored and excluded from the Docker build context.
- Images run as the non-root `node` user.
- The runtime database roles have DML only (no DDL); migrations use the owner role.

## Known limitations and accepted risks

| Item | Notes |
|---|---|
| CSP `script-src 'unsafe-inline'` on the web app | Next.js inline bootstrap scripts. Nonce-based CSP is on the roadmap |
| Registration reveals that an email is taken (`EMAIL_TAKEN`) | Accepted for usability. Sign-in and password reset don't enumerate |
| Swagger UI is served by the API in every environment | It exposes the schema, not data. Restrict `/api/docs` at the reverse proxy if required |
| SMTP is at-least-once at the provider boundary | See ARCHITECTURE |
| No MFA or SSO yet | Roadmap |
| Guest QR reports (when enabled) can be spammed within rate limits | Default mode is authenticated; reports are flagged as unverified |

## Reporting

Report vulnerabilities privately to the maintainers. Don't open public issues for security problems.
