-- ════════════════════════════════════════════════════════════════════════════
-- Row-level security (defense in depth for multi-tenancy) + business CHECK constraints.
--
-- The runtime role `fixflow_app` (NOBYPASSRLS) only sees rows whose organization_id equals
-- the transaction-local setting `app.org_id`, which the API sets from the authenticated
-- session via set_config(..., true) at the start of every transaction. If the setting is
-- missing, app_current_org() is NULL and every tenant query returns zero rows (fail closed).
-- `fixflow_system` (BYPASSRLS) is reserved for a short, audited list of cross-tenant paths.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.org_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

-- ── Standard tenant isolation: one policy per tenant-owned table ───────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'memberships', 'invitations', 'technician_skills', 'locations', 'categories', 'assets',
    'checklist_templates', 'checklist_template_items', 'work_orders', 'work_order_assignments',
    'work_order_status_history', 'work_order_comments', 'work_order_checklist_items',
    'attachments', 'resolution_submissions', 'sla_policies', 'sla_events',
    'maintenance_schedules', 'notifications', 'notification_preferences', 'audit_logs',
    'idempotency_records', 'outbox_events', 'email_deliveries'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org())',
      t
    );
  END LOOP;
END $$;

-- A user may always read their own memberships (organization switcher, login landing).
CREATE POLICY own_memberships ON memberships FOR SELECT USING (user_id = app_current_user());

-- Per-user data inside a tenant: restrictive policies AND-ed with tenant_isolation.
CREATE POLICY own_rows ON notification_preferences AS RESTRICTIVE
  USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());
CREATE POLICY own_rows ON idempotency_records AS RESTRICTIVE
  USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());
-- Notifications may be created for colleagues (fan-out uses INSERT without RETURNING),
-- but only the recipient can read, update or delete them.
CREATE POLICY own_rows_select ON notifications AS RESTRICTIVE FOR SELECT USING (user_id = app_current_user());
CREATE POLICY own_rows_update ON notifications AS RESTRICTIVE FOR UPDATE USING (user_id = app_current_user());
CREATE POLICY own_rows_delete ON notifications AS RESTRICTIVE FOR DELETE USING (user_id = app_current_user());

-- ── Organizations: current tenant, plus organizations the user belongs to (names only in app) ──
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY current_org ON organizations
  USING (id = app_current_org()) WITH CHECK (id = app_current_org());
CREATE POLICY member_orgs ON organizations FOR SELECT
  USING (id IN (SELECT m.organization_id FROM memberships m WHERE m.user_id = app_current_user()));

-- ── Users (global): visible if it is you or a member of the current organization ──
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_users ON users FOR SELECT USING (
  id = app_current_user()
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = users.id AND m.organization_id = app_current_org())
);
CREATE POLICY update_self ON users FOR UPDATE
  USING (id = app_current_user()) WITH CHECK (id = app_current_user());
-- No INSERT/DELETE policy: account creation happens through the audited system role.

-- ── Sessions and user tokens: strictly per user ───────────────────────────────
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_sessions ON sessions
  USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_tokens ON user_tokens
  USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user());

-- The migration bookkeeping table is owner-only.
-- (Absent in Prisma's temporary shadow database, hence the guard.)
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fixflow_app') THEN
      REVOKE ALL ON TABLE _prisma_migrations FROM fixflow_app;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fixflow_system') THEN
      REVOKE ALL ON TABLE _prisma_migrations FROM fixflow_system;
    END IF;
  END IF;
END $$;

-- ════════════════════════════ Business invariants ════════════════════════════
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));
ALTER TABLE organizations
  ADD CONSTRAINT organizations_policy_bounds CHECK (
    reopen_window_days BETWEEN 0 AND 90 AND auto_close_days BETWEEN 1 AND 90 AND work_order_seq >= 0
  );
ALTER TABLE technician_skills ADD CONSTRAINT technician_skills_level CHECK (level BETWEEN 1 AND 3);
ALTER TABLE locations ADD CONSTRAINT locations_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);
ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_has_place CHECK (location_id IS NOT NULL OR asset_id IS NOT NULL),
  ADD CONSTRAINT work_orders_positive CHECK (number > 0 AND version >= 1 AND sla_cycle >= 0),
  ADD CONSTRAINT work_orders_due_order CHECK (resolution_due_at >= response_due_at),
  ADD CONSTRAINT work_orders_assignee_when_assigned CHECK (
    status NOT IN ('ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'PENDING_VERIFICATION') OR assignee_id IS NOT NULL
  ),
  ADD CONSTRAINT work_orders_requester_or_guest CHECK (
    requester_id IS NOT NULL OR source IN ('GUEST_QR', 'SCHEDULED')
  );
ALTER TABLE sla_policies
  ADD CONSTRAINT sla_policies_targets CHECK (
    response_minutes > 0 AND resolution_minutes >= response_minutes AND warning_percent BETWEEN 1 AND 99
  );
ALTER TABLE maintenance_schedules
  ADD CONSTRAINT maintenance_schedules_bounds CHECK (frequency_interval >= 1 AND lead_time_days >= 0);
ALTER TABLE attachments ADD CONSTRAINT attachments_size CHECK (size_bytes > 0);
ALTER TABLE resolution_submissions
  ADD CONSTRAINT resolution_submissions_review CHECK (
    (outcome = 'PENDING' AND reviewed_at IS NULL) OR (outcome <> 'PENDING' AND reviewed_at IS NOT NULL)
  );
