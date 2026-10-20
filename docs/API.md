# API

Base path `/api/v1`. The interactive reference is Swagger UI at `http://localhost:4000/api/docs`. The OpenAPI JSON at
`/api/docs/openapi.json` is generated from the same Zod schemas the API validates with.

## Conventions

| Topic | Convention |
|---|---|
| Auth | httpOnly cookies: `ff_at` (15-min access JWT), `ff_rt` (refresh, path `/api/v1/auth`, rotated on every refresh). Browsers call the API through the web origin |
| CSRF | `GET /auth/csrf` sets `ff_csrf`. Every POST, PUT, PATCH and DELETE must send the same value in `x-csrf-token` |
| Tenant | The active organization comes from the session (`POST /auth/switch-organization`). The client never sends an org id |
| Validation | Zod; `400 VALIDATION_FAILED` with `errors: [{ path, message }]` |
| Errors | `application/problem+json`: `{ type, title, status, code, detail, requestId, errors?, currentVersion?, reasons? }` |
| Not found vs forbidden | Records outside your organization or visibility return **404**, never 403, so ids can't be probed |
| Concurrency | Transitions send `expectedVersion`; a stale value returns `409 VERSION_CONFLICT` with `currentVersion` |
| Idempotency | `Idempotency-Key` header on work-order create, transitions, comments, checklist updates and uploads. Repeats replay the original 2xx response; the same key with a different payload returns 422 |
| Pagination | Lists return `{ data, meta: { page, pageSize, total } }`. Notifications and audit use cursor pagination (`nextCursor`) |
| Rate limits | Global per-IP limit. Sign-in 10/min per IP plus 10 failures per 15 min per account; sign-up and password-reset 5/min; public QR report 5 per 10 min. Responds `429 RATE_LIMITED` |
| Status codes | 200, 201, 202, 204, 400, 401, 403, 404, 409, 413, 415, 422, 429 |

## Work-order lifecycle

`POST /work-orders/{id}/transitions`

```json
{ "action": "assign", "expectedVersion": 3, "assigneeId": "…" }
{ "action": "start", "expectedVersion": 4 }
{ "action": "hold", "expectedVersion": 5, "reason": "Waiting for a replacement part" }
{ "action": "submit_resolution", "expectedVersion": 6, "notes": "…", "laborMinutes": 45, "partsUsed": "…", "attachmentIds": ["…"] }
{ "action": "approve", "expectedVersion": 7 }
{ "action": "reject", "expectedVersion": 7, "reason": "Still leaking under the sink" }
```

| Action | From → to | Who |
|---|---|---|
| `assign` | OPEN → ASSIGNED | Manager or admin; technician self-assign if the policy allows |
| `reassign` | ASSIGNED, IN_PROGRESS or ON_HOLD → ASSIGNED | Manager or admin |
| `unassign` | ASSIGNED → OPEN | Manager or admin; the assigned technician (decline, with a reason) |
| `start` | ASSIGNED → IN_PROGRESS | Assigned technician (the first start records the response time) |
| `hold` / `resume` | IN_PROGRESS ⇄ ON_HOLD | Assigned technician, manager |
| `submit_resolution` | IN_PROGRESS → PENDING_VERIFICATION | Assigned technician. Needs notes, all required checklist items, and an evidence photo when the policy requires one. Otherwise `422 SUBMISSION_INCOMPLETE` with `reasons[]` |
| `approve` / `reject` | PENDING_VERIFICATION → RESOLVED or IN_PROGRESS | Requester of their own work order (policy), manager or admin |
| `close` | RESOLVED → CLOSED | Manager or admin; the worker auto-closes |
| `reopen` | RESOLVED or CLOSED → ASSIGNED or OPEN | Own requester within the reopen window, manager or admin; starts a new SLA cycle |
| `cancel` | Any active state → CANCELLED | Manager or admin; the requester while their work order is OPEN |

Each work-order response includes `availableActions` for the caller, computed by the same function the server enforces.

## Endpoint inventory

Generated from the live OpenAPI document.

| Area | Endpoints |
|---|---|
| **auth** | `GET /auth/csrf` · `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `POST /auth/refresh` · `GET /auth/me` · `POST /auth/switch-organization` · `POST /auth/forgot-password` (always 202) · `POST /auth/reset-password` · `POST /auth/verify-email` · `POST /auth/resend-verification` |
| **organizations** | `POST /organizations` · `GET, PATCH /organizations/current` · `PATCH /organizations/current/policy` · `POST /organizations/current/onboarding/complete` |
| **team** | `GET /members` · `GET, PATCH /members/{id}` · `PUT /members/{id}/skills` · `PUT /members/me/availability` · `GET, POST /invitations` · `POST /invitations/{id}/resend` · `POST /invitations/{id}/revoke` · `GET /invitations/lookup` (public) · `POST /invitations/accept` |
| **profile** | `PATCH /profile` · `POST /profile/password` · `GET /profile/sessions` · `DELETE /profile/sessions/{id}` |
| **locations** | `GET, POST /locations` · `GET, PATCH /locations/{id}` · `POST /locations/{id}/archive` · `GET /locations/{id}/qr` (SVG, `?format=png`) · `POST /locations/{id}/qr/rotate` |
| **assets** | `GET, POST /assets` · `GET, PATCH /assets/{id}` · `POST /assets/{id}/archive` · `GET /assets/{id}/work-orders` · `GET /assets/{id}/qr` · `POST /assets/{id}/qr/rotate` |
| **catalog** | `GET, POST /categories` · `PATCH /categories/{id}` · `POST /categories/{id}/archive` · `POST /categories/{id}/restore` · `GET, POST /checklist-templates` · `PATCH /checklist-templates/{id}` · `POST /checklist-templates/{id}/archive` |
| **sla** | `GET, PUT /sla-policies` |
| **work orders** | `GET, POST /work-orders` · `GET /work-orders/number/{number}` · `GET, PATCH /work-orders/{id}` · `POST /work-orders/{id}/transitions` · `GET /work-orders/{id}/assignment-suggestions` · `GET /work-orders/{id}/timeline` · `POST /work-orders/{id}/comments` · `POST /work-orders/{id}/checklist` · `PUT /work-orders/{id}/checklist/{itemId}` · `POST /work-orders/{id}/attachments` · `GET /attachments/{id}/content` |
| **maintenance** | `GET, POST /schedules` · `PATCH /schedules/{id}` · `POST /schedules/{id}/run-now` |
| **notifications** | `GET /notifications` · `GET /notifications/unread-count` · `POST /notifications/{id}/read` · `POST /notifications/read-all` · `GET, PUT /notifications/preferences` |
| **analytics** | `GET /dashboard` · `GET /analytics/report` · `GET /analytics/export.csv` (audited; formula-injection safe) |
| **audit** | `GET /audit-logs` |
| **search** | `GET /search?q=` (work orders, assets, locations, people; role-scoped) |
| **realtime** | `POST /realtime/ticket` (60 s, single use) |
| **public** | `GET /public/report/{token}` · `POST /public/report/{token}` |
| **health** | `GET /health/live` · `GET /health/ready` |

### Work-order list filters

`GET /work-orders` supports:
- `status` (repeatable), `priority` (repeatable), `categoryId`, `assigneeId` (or `unassigned`)
- `locationId` (includes the subtree), `assetId`, `requesterId`
- `assigneeId` and `requesterId` also accept `me`
- `overdue`, `q`, `createdFrom`, `createdTo`
- `sort` (`number`, `createdAt`, `updatedAt`, `priority`, `status`, `resolutionDueAt`), `order` (`asc` or `desc`), `page`, `pageSize`

Visibility is applied first:
- Requesters see their own requests (or all of the organization's, if the policy allows).
- Technicians see work assigned to them, plus open work when self-assign is on.

## Realtime events (Socket.IO, path `/realtime`)

Server → client: `workOrder.created`, `workOrder.updated`, `workOrder.commented`, `notification.created`, `dashboard.invalidate`,
`session.expired`.
Client → server: `workOrder.watch` / `workOrder.unwatch` `{ id }` (the visibility check runs on join).
Payloads are invalidation hints; clients refetch through REST.
