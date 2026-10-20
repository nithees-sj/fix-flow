# Roadmap

Ordered by expected value. Nothing here is implemented yet; see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for what is.

## Next

- **Pause-aware SLA clocks.** ON_HOLD with a reason category (parts, access) pauses the resolution clock; business-hours calendars.
- **Nonce-based CSP** for the web app (remove `'unsafe-inline'` scripts).
- **MFA (TOTP) and SSO (OIDC/SAML)** for organizations that require it.
- **Custom roles** built on the existing permission catalog.
- **Parts and inventory.** Stock per location, parts used on submissions, low-stock alerts.

## Later

- Vendor and contractor portal with scoped access to assigned work.
- Pause and resume schedules by season; meter-based preventive maintenance (run hours).
- Asset lifecycle costs (labor and parts per asset) and replace-vs-repair insights.
- Native mobile wrapper with background sync and push notifications.
- Webhooks and a public API with personal access tokens.
- Multi-language UI and locale-aware formatting beyond time zones.
- Data retention policies and per-organization export or deletion tooling.

## Operational

- OpenTelemetry tracing across API → outbox → worker.
- Bull Board (or similar) behind admin auth for queue inspection.
- Automated restore drills for backups.
