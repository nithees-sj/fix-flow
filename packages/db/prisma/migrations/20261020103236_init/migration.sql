-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ORG_ADMIN', 'MANAGER', 'TECHNICIAN', 'REQUESTER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Industry" AS ENUM ('EDUCATION', 'HEALTHCARE', 'RESIDENTIAL', 'OFFICE', 'MANUFACTURING', 'RETAIL', 'HOSPITALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'PENDING_VERIFICATION', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "WorkOrderSource" AS ENUM ('WEB', 'QR', 'GUEST_QR', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('OPERATIONAL', 'NEEDS_ATTENTION', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('SITE', 'BUILDING', 'FLOOR', 'ROOM', 'AREA');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('REPORT', 'PROGRESS', 'EVIDENCE');

-- CreateEnum
CREATE TYPE "AssignmentMethod" AS ENUM ('MANUAL', 'AUTO', 'SELF');

-- CreateEnum
CREATE TYPE "SubmissionOutcome" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SlaEventType" AS ENUM ('RESPONSE_WARNING', 'RESPONSE_BREACH', 'RESOLUTION_WARNING', 'RESOLUTION_BREACH');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('WORK_ORDER_CREATED', 'WORK_ORDER_ASSIGNED', 'WORK_ORDER_STATUS_CHANGED', 'WORK_ORDER_COMMENT', 'RESOLUTION_SUBMITTED', 'RESOLUTION_APPROVED', 'RESOLUTION_REJECTED', 'SLA_WARNING', 'SLA_BREACH', 'INVITATION', 'SCHEDULED_MAINTENANCE');

-- CreateEnum
CREATE TYPE "AutoAssignMode" AS ENUM ('OFF', 'SUGGEST', 'AUTO');

-- CreateEnum
CREATE TYPE "QrReportingMode" AS ENUM ('AUTHENTICATED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "FrequencyUnit" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'DISPATCHED', 'DEAD');

-- CreateEnum
CREATE TYPE "UserTokenType" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "phone" VARCHAR(32),
    "email_verified_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "active_organization_id" UUID,
    "user_agent" VARCHAR(300),
    "ip" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "rotated_at" TIMESTAMPTZ(3),
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" "UserTokenType" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "industry" "Industry" NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "work_order_seq" INTEGER NOT NULL DEFAULT 0,
    "onboarding_completed_at" TIMESTAMPTZ(3),
    "requester_can_verify" BOOLEAN NOT NULL DEFAULT true,
    "technician_self_assign" BOOLEAN NOT NULL DEFAULT false,
    "requester_sees_all_org_requests" BOOLEAN NOT NULL DEFAULT false,
    "require_evidence_photo" BOOLEAN NOT NULL DEFAULT true,
    "reopen_window_days" INTEGER NOT NULL DEFAULT 7,
    "auto_close_days" INTEGER NOT NULL DEFAULT 7,
    "auto_assign_mode" "AutoAssignMode" NOT NULL DEFAULT 'SUGGEST',
    "qr_reporting_mode" "QrReportingMode" NOT NULL DEFAULT 'AUTHENTICATED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "job_title" VARCHAR(80),
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "role" "Role" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "invited_by_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "level" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "parent_id" UUID,
    "type" "LocationType" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "code" VARCHAR(24),
    "description" VARCHAR(200),
    "public_report_token" VARCHAR(64) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(200),
    "color" VARCHAR(16) NOT NULL DEFAULT 'blue',
    "icon" VARCHAR(32) NOT NULL DEFAULT 'wrench',
    "default_checklist_template_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "asset_tag" VARCHAR(40) NOT NULL,
    "status" "AssetStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "manufacturer" VARCHAR(200),
    "model" VARCHAR(200),
    "serial_number" VARCHAR(200),
    "install_date" TIMESTAMPTZ(3),
    "warranty_expires_at" TIMESTAMPTZ(3),
    "notes" TEXT,
    "public_report_token" VARCHAR(64) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(200),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_template_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "checklist_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "source" "WorkOrderSource" NOT NULL DEFAULT 'WEB',
    "category_id" UUID NOT NULL,
    "location_id" UUID,
    "asset_id" UUID,
    "requester_id" UUID,
    "guest_name" VARCHAR(80),
    "guest_contact" VARCHAR(120),
    "assignee_id" UUID,
    "schedule_id" UUID,
    "scheduled_for" TIMESTAMPTZ(3),
    "sla_cycle" INTEGER NOT NULL DEFAULT 0,
    "cycle_started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_due_at" TIMESTAMPTZ(3) NOT NULL,
    "resolution_due_at" TIMESTAMPTZ(3) NOT NULL,
    "sla_warning_percent" SMALLINT NOT NULL DEFAULT 75,
    "responded_at" TIMESTAMPTZ(3),
    "resolution_submitted_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "verified_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "escalation_level" SMALLINT NOT NULL DEFAULT 0,
    "reopen_count" SMALLINT NOT NULL DEFAULT 0,
    "rework_count" SMALLINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "method" "AssignmentMethod" NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(3),
    "reason" VARCHAR(500),

    CONSTRAINT "work_order_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "from_status" "WorkOrderStatus",
    "to_status" "WorkOrderStatus" NOT NULL,
    "actor_id" UUID,
    "reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(3),

    CONSTRAINT "work_order_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "completed_by_id" UUID,

    CONSTRAINT "work_order_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "submission_id" UUID,
    "uploaded_by_id" UUID,
    "kind" "AttachmentKind" NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "thumbnail_key" VARCHAR(300),
    "file_name" VARCHAR(200) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resolution_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "notes" TEXT NOT NULL,
    "labor_minutes" INTEGER,
    "parts_used" TEXT,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" "SubmissionOutcome" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" VARCHAR(500),

    CONSTRAINT "resolution_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "priority" "Priority" NOT NULL,
    "response_minutes" INTEGER NOT NULL,
    "resolution_minutes" INTEGER NOT NULL,
    "warning_percent" SMALLINT NOT NULL DEFAULT 75,
    "escalation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(240) NOT NULL DEFAULT '',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "work_order_id" UUID NOT NULL,
    "type" "SlaEventType" NOT NULL,
    "cycle" INTEGER NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "description" TEXT,
    "category_id" UUID NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "asset_id" UUID,
    "location_id" UUID,
    "checklist_template_id" UUID,
    "default_assignee_id" UUID,
    "frequency_unit" "FrequencyUnit" NOT NULL,
    "frequency_interval" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "next_due_at" TIMESTAMPTZ(3) NOT NULL,
    "lead_time_days" INTEGER NOT NULL DEFAULT 0,
    "last_generated_at" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "maintenance_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "work_order_id" UUID,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(40) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "status_code" SMALLINT NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "aggregate_id" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" VARCHAR(1000),
    "dispatched_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "outbox_event_id" UUID NOT NULL,
    "recipient" VARCHAR(254) NOT NULL,
    "template" VARCHAR(60) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "provider_message_id" VARCHAR(200),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_tokens_token_hash_key" ON "user_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "user_tokens_user_id_type_idx" ON "user_tokens"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_organization_id_role_status_idx" ON "memberships"("organization_id", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_id_key" ON "memberships"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_organization_id_email_idx" ON "invitations"("organization_id", "email");

-- CreateIndex
CREATE INDEX "technician_skills_organization_id_category_id_idx" ON "technician_skills"("organization_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "technician_skills_membership_id_category_id_key" ON "technician_skills"("membership_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_public_report_token_key" ON "locations"("public_report_token");

-- CreateIndex
CREATE INDEX "locations_organization_id_parent_id_idx" ON "locations"("organization_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_organization_id_id_key" ON "locations"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organization_id_id_key" ON "categories"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_organization_id_name_key" ON "categories"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "assets_public_report_token_key" ON "assets"("public_report_token");

-- CreateIndex
CREATE INDEX "assets_organization_id_location_id_idx" ON "assets"("organization_id", "location_id");

-- CreateIndex
CREATE INDEX "assets_organization_id_status_idx" ON "assets"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organization_id_id_key" ON "assets"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_organization_id_asset_tag_key" ON "assets"("organization_id", "asset_tag");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_organization_id_id_key" ON "checklist_templates"("organization_id", "id");

-- CreateIndex
CREATE INDEX "checklist_template_items_organization_id_template_id_idx" ON "checklist_template_items"("organization_id", "template_id");

-- CreateIndex
CREATE INDEX "work_orders_organization_id_status_priority_idx" ON "work_orders"("organization_id", "status", "priority");

-- CreateIndex
CREATE INDEX "work_orders_organization_id_assignee_id_status_idx" ON "work_orders"("organization_id", "assignee_id", "status");

-- CreateIndex
CREATE INDEX "work_orders_organization_id_requester_id_idx" ON "work_orders"("organization_id", "requester_id");

-- CreateIndex
CREATE INDEX "work_orders_organization_id_created_at_idx" ON "work_orders"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "work_orders_organization_id_asset_id_idx" ON "work_orders"("organization_id", "asset_id");

-- CreateIndex
CREATE INDEX "work_orders_organization_id_location_id_idx" ON "work_orders"("organization_id", "location_id");

-- CreateIndex
CREATE INDEX "work_orders_status_response_due_at_idx" ON "work_orders"("status", "response_due_at");

-- CreateIndex
CREATE INDEX "work_orders_status_resolution_due_at_idx" ON "work_orders"("status", "resolution_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_organization_id_id_key" ON "work_orders"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_organization_id_number_key" ON "work_orders"("organization_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_schedule_id_scheduled_for_key" ON "work_orders"("schedule_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "work_order_assignments_organization_id_work_order_id_idx" ON "work_order_assignments"("organization_id", "work_order_id");

-- CreateIndex
CREATE INDEX "work_order_assignments_organization_id_assignee_id_idx" ON "work_order_assignments"("organization_id", "assignee_id");

-- CreateIndex
CREATE INDEX "work_order_status_history_organization_id_work_order_id_cre_idx" ON "work_order_status_history"("organization_id", "work_order_id", "created_at");

-- CreateIndex
CREATE INDEX "work_order_status_history_organization_id_to_status_created_idx" ON "work_order_status_history"("organization_id", "to_status", "created_at");

-- CreateIndex
CREATE INDEX "work_order_comments_organization_id_work_order_id_created_a_idx" ON "work_order_comments"("organization_id", "work_order_id", "created_at");

-- CreateIndex
CREATE INDEX "work_order_checklist_items_organization_id_work_order_id_idx" ON "work_order_checklist_items"("organization_id", "work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_storage_key_key" ON "attachments"("storage_key");

-- CreateIndex
CREATE INDEX "attachments_organization_id_work_order_id_idx" ON "attachments"("organization_id", "work_order_id");

-- CreateIndex
CREATE INDEX "resolution_submissions_organization_id_work_order_id_idx" ON "resolution_submissions"("organization_id", "work_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "resolution_submissions_organization_id_id_key" ON "resolution_submissions"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sla_policies_organization_id_priority_key" ON "sla_policies"("organization_id", "priority");

-- CreateIndex
CREATE INDEX "sla_events_organization_id_occurred_at_idx" ON "sla_events"("organization_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "sla_events_work_order_id_type_cycle_key" ON "sla_events"("work_order_id", "type", "cycle");

-- CreateIndex
CREATE INDEX "maintenance_schedules_active_next_due_at_idx" ON "maintenance_schedules"("active", "next_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_schedules_organization_id_id_key" ON "maintenance_schedules"("organization_id", "id");

-- CreateIndex
CREATE INDEX "notifications_organization_id_user_id_read_at_created_at_idx" ON "notifications"("organization_id", "user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_organization_id_user_id_type_key" ON "notification_preferences"("organization_id", "user_id", "type");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_user_id_key_key" ON "idempotency_records"("user_id", "key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_organization_id_id_key" ON "outbox_events"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "email_deliveries_outbox_event_id_recipient_key" ON "email_deliveries"("outbox_event_id", "recipient");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_organization_id_fkey" FOREIGN KEY ("active_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_tokens" ADD CONSTRAINT "user_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_organization_id_membership_id_fkey" FOREIGN KEY ("organization_id", "membership_id") REFERENCES "memberships"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_organization_id_category_id_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "categories"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_parent_id_fkey" FOREIGN KEY ("organization_id", "parent_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organization_id_default_checklist_template_id_fkey" FOREIGN KEY ("organization_id", "default_checklist_template_id") REFERENCES "checklist_templates"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_location_id_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_category_id_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_template_items" ADD CONSTRAINT "checklist_template_items_organization_id_template_id_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "checklist_templates"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_category_id_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_location_id_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_asset_id_fkey" FOREIGN KEY ("organization_id", "asset_id") REFERENCES "assets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_requester_id_fkey" FOREIGN KEY ("organization_id", "requester_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_assignee_id_fkey" FOREIGN KEY ("organization_id", "assignee_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_organization_id_schedule_id_fkey" FOREIGN KEY ("organization_id", "schedule_id") REFERENCES "maintenance_schedules"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_organization_id_work_order_id_fkey" FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_organization_id_assignee_id_fkey" FOREIGN KEY ("organization_id", "assignee_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_assignments" ADD CONSTRAINT "work_order_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_organization_id_work_order_id_fkey" FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_comments" ADD CONSTRAINT "work_order_comments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_comments" ADD CONSTRAINT "work_order_comments_organization_id_work_order_id_fkey" FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_comments" ADD CONSTRAINT "work_order_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_checklist_items" ADD CONSTRAINT "work_order_checklist_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_checklist_items" ADD CONSTRAINT "work_order_checklist_items_organization_id_work_order_id_fkey" FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_checklist_items" ADD CONSTRAINT "work_order_checklist_items_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_work_order_id_fkey" FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_submission_id_fkey" FOREIGN KEY ("organization_id", "submission_id") REFERENCES "resolution_submissions"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution_submissions" ADD CONSTRAINT "resolution_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution_submissions" ADD CONSTRAINT "resolution_submissions_organization_id_work_order_id_fkey" FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution_submissions" ADD CONSTRAINT "resolution_submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resolution_submissions" ADD CONSTRAINT "resolution_submissions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_events" ADD CONSTRAINT "sla_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_events" ADD CONSTRAINT "sla_events_organization_id_work_order_id_fkey" FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_organization_id_category_id_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_organization_id_asset_id_fkey" FOREIGN KEY ("organization_id", "asset_id") REFERENCES "assets"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_organization_id_location_id_fkey" FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_organization_id_checklist_template_i_fkey" FOREIGN KEY ("organization_id", "checklist_template_id") REFERENCES "checklist_templates"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_organization_id_default_assignee_id_fkey" FOREIGN KEY ("organization_id", "default_assignee_id") REFERENCES "memberships"("organization_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_work_order_id_fkey" FOREIGN KEY ("organization_id", "work_order_id") REFERENCES "work_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_deliveries" ADD CONSTRAINT "email_deliveries_organization_id_outbox_event_id_fkey" FOREIGN KEY ("organization_id", "outbox_event_id") REFERENCES "outbox_events"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
