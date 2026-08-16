-- Manual-only Task Center expansion. Legacy task columns are intentionally retained.
-- Run `pnpm --filter @odyssey/db build && pnpm --filter @odyssey/db db:preflight:tasks`
-- before applying this migration.

DO $$
DECLARE invalid_count integer;
BEGIN
  WITH issues AS (
    SELECT id FROM tasks WHERE status NOT IN ('todo', 'in_progress', 'completed', 'cancelled')
    UNION ALL SELECT id FROM tasks WHERE priority NOT IN ('low', 'medium', 'high', 'urgent')
    UNION ALL SELECT id FROM tasks WHERE title IS NULL OR length(btrim(title)) = 0
    UNION ALL SELECT t.id FROM tasks t LEFT JOIN users u ON u.id = t.owner_id WHERE u.id IS NULL
    UNION ALL SELECT t.id FROM tasks t LEFT JOIN organization_memberships m ON m.org_id = t.org_id AND m.user_id = t.owner_id WHERE m.id IS NULL
    UNION ALL SELECT t.id FROM tasks t JOIN properties p ON p.id = t.property_id WHERE p.org_id <> t.org_id
    UNION ALL SELECT t.id FROM tasks t JOIN units u ON u.id = t.unit_id WHERE u.org_id <> t.org_id
    UNION ALL SELECT t.id FROM tasks t JOIN tenants te ON te.id = t.tenant_id WHERE te.org_id <> t.org_id
    UNION ALL SELECT t.id FROM tasks t JOIN leases l ON l.id = t.lease_id WHERE l.org_id <> t.org_id
    UNION ALL SELECT t.id FROM tasks t JOIN maintenance_requests mr ON mr.id = t.maintenance_request_id WHERE mr.org_id <> t.org_id
    UNION ALL SELECT t.id FROM tasks t JOIN work_orders wo ON wo.id = t.work_order_id WHERE wo.org_id <> t.org_id
  )
  SELECT count(*) INTO invalid_count FROM issues;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Task migration preflight failed: % invalid legacy task relation/value(s)', invalid_count;
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "tasks" ADD COLUMN "assignee_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "created_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "payment_id" uuid;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "financial_record_id" uuid;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "reconciliation_month" varchar(7);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp;
--> statement-breakpoint

UPDATE "tasks" SET "status" = 'inbox' WHERE "status" = 'todo';
--> statement-breakpoint
UPDATE "tasks" SET "priority" = 'normal' WHERE "priority" = 'medium';
--> statement-breakpoint
UPDATE "tasks" SET "assignee_user_id" = "owner_id", "created_by_user_id" = "owner_id";
--> statement-breakpoint

COMMENT ON COLUMN "tasks"."created_by_user_id" IS 'Authenticated creator for new tasks. Legacy rows reconstruct provenance from owner_id.';
--> statement-breakpoint
COMMENT ON COLUMN "tasks"."due_date" IS 'Calendar date stored as timestamp without time zone at 00:00:00 for new Task Center rows; legacy timestamps are preserved.';
--> statement-breakpoint

ALTER TABLE "tasks" ALTER COLUMN "due_date" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'inbox';
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "priority" SET DEFAULT 'normal';
--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_by_user_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_financial_record_id_financial_records_id_fk" FOREIGN KEY ("financial_record_id") REFERENCES "public"."financial_records"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check" CHECK ("status" IN ('inbox', 'planned', 'in_progress', 'waiting', 'completed', 'cancelled'));
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_check" CHECK ("priority" IN ('urgent', 'high', 'normal', 'low'));
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_title_nonblank_check" CHECK (length(btrim("title")) > 0);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reconciliation_month_format_check" CHECK ("reconciliation_month" IS NULL OR "reconciliation_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reconciliation_month_property_check" CHECK ("reconciliation_month" IS NULL OR "property_id" IS NOT NULL);
--> statement-breakpoint
-- One-way by design: historic completed tasks retain NULL completed_at.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_completed_at_status_check" CHECK ("completed_at" IS NULL OR "status" = 'completed');
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "tasks_active_org_status_idx" ON "tasks" ("org_id", "status") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_active_org_assignee_status_idx" ON "tasks" ("org_id", "assignee_user_id", "status") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_active_org_priority_idx" ON "tasks" ("org_id", "priority") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_active_org_due_date_idx" ON "tasks" ("org_id", "due_date") WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_active_org_updated_at_idx" ON "tasks" ("org_id", "updated_at" DESC) WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_active_org_created_at_idx" ON "tasks" ("org_id", "created_at" DESC) WHERE "archived_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_active_org_property_idx" ON "tasks" ("org_id", "property_id") WHERE "archived_at" IS NULL AND "property_id" IS NOT NULL;
--> statement-breakpoint

-- Preflight confirmed audit_logs previously had only audit_logs_pkey.
CREATE INDEX IF NOT EXISTS "audit_logs_org_entity_created_at_idx" ON "audit_logs" ("org_id", "entity_type", "entity_id", "created_at" DESC);
