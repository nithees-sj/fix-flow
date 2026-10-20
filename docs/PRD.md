# FixFlow product requirements

## Problem

Facilities teams in colleges, hospitals, residential buildings, offices and malls still run maintenance on phone calls,
WhatsApp messages, spreadsheets and paper registers. That causes three problems:
- Requests get lost and duplicated.
- Nobody knows who is working on what or whether a deadline is at risk.
- Managers can't answer basic questions: which assets fail most, are we meeting response times, who is overloaded.

## Users and their jobs

| Role | Who | Core jobs |
|---|---|---|
| **Requester** | Students, staff, nurses, residents | Report a problem in seconds (web or QR label), follow progress, confirm the repair or reopen it |
| **Technician** | Maintenance staff, often on a phone with patchy signal | See today's jobs in priority order, follow checklists, attach photo evidence, submit the repair, keep working offline |
| **Manager** | Facilities and operations managers | Triage and assign work with recommendations, watch SLAs and overdue work, verify repairs, run preventive maintenance, read reports |
| **Org admin** | Head of estates or IT owner | Configure the organization, locations, assets, categories, SLA targets, team and permissions; review the audit log |

A person can belong to several organizations, with a different role in each, and switch between them.

## Scope (v1, implemented)

1. **Multi-tenant workspaces.** Strict isolation between organizations, an onboarding wizard, invitations by email,
   and four fixed roles plus policy toggles. Examples: requesters may verify their own repairs, technicians may self-assign,
   evidence photos are required, the reopen window, auto-close after N days, the auto-assign mode and the QR mode.
2. **Places and things.** A location hierarchy (site → building → floor → room/area), an asset register with
   status, warranty and maintenance history, and categories with colors, icons and default checklists.
3. **Work orders.** Numbered requests with a strict lifecycle:
   - Open → Assigned → In progress ⇄ On hold → Pending verification → Resolved → Closed
   - Reject (rework), reopen (new SLA cycle) and cancel paths
   - Comments, staff-only internal notes, checklists, photo and PDF attachments, and a full timeline
4. **Verification.** A technician submits a resolution (notes, labor, parts, evidence photos). The requester or a
   manager approves it, or rejects it with a reason, and the work goes back to the technician.
5. **SLA engine.** Response and resolution targets per priority, deadlines fixed at creation, warnings at a configurable
   percentage, breach notifications, and escalation to managers.
6. **Assignment intelligence.** Explainable technician ranking by skill match, skill level, current workload and availability.
   It can suggest only, or auto-assign on creation.
7. **QR reporting.** Printable labels per room or asset that open a prefilled report form. Signed-in members only by default;
   optionally guests, with rate limiting. Labels can be rotated to invalidate old ones.
8. **Preventive maintenance.** Recurring schedules (day, week or month intervals with lead time) that generate work orders automatically
   and idempotently, plus a "Run now" action.
9. **Notifications.** An in-app notification center with live updates, plus per-type email preferences. Email goes through a reliable outbox.
10. **Realtime.** Lists, detail pages and dashboards update live across users.
11. **Offline field work.** The technician's jobs stay readable offline. Comments, checklist ticks, status actions and photos queue
    on the device and sync exactly once. Conflicts are shown to the technician, never overwritten silently.
12. **Analytics.** A role-aware dashboard, plus trends, SLA compliance, status, category and priority mix, technician performance,
    asset failure ranking and CSV export, all bucketed in the organization's time zone.
13. **Audit log.** Who changed what and when, filterable.

## Out of scope for v1 (see [ROADMAP](ROADMAP.md))

Custom roles, inventory and parts stock, purchase orders, vendor portals, native mobile apps, SSO/SAML, multi-language UI,
dark theme (intentionally light-only), and billing.

## Success measures

- Time from report to first response, and from report to resolution, against SLA targets.
- Share of work orders resolved without rework.
- Share of reports created through QR labels: less friction for requesters.
- Overdue backlog trend per organization.

## Non-functional requirements

- **Security.** Isolation between tenants is enforced in the database (RLS), not only in application code. Every mutation is
  authorized server-side, and every change to configuration or work is audited. See [SECURITY.md](SECURITY.md).
- **Reliability.** No lost or duplicated notifications, emails, SLA escalations or scheduled jobs across crashes and retries.
- **Accessibility.** Keyboard operable, labeled controls, WCAG AA contrast, and screen-reader friendly charts (every chart has a table view).
- **Responsiveness.** Desktop for managers; phone-first for technicians and requesters.
