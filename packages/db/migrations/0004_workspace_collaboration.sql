-- 0004_workspace_collaboration.sql
-- Multi-Workspace Collaboration & RBAC Migration

-- 1. Create organization_memberships Table with RESTRICT Foreign Keys & CHECK Constraints
CREATE TABLE IF NOT EXISTS "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
	"role" varchar(50) NOT NULL CONSTRAINT "chk_membership_role" CHECK ("role" IN ('owner', 'manager', 'accountant', 'maintenance', 'read_only')),
	"status" varchar(50) DEFAULT 'active' NOT NULL CONSTRAINT "chk_membership_status" CHECK ("status" IN ('active', 'suspended')),
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"archived_at" timestamp
);

-- Unique Constraint on (org_id, user_id)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_org_user_membership" ON "organization_memberships" ("org_id", "user_id");

-- 2. Create organization_invitations Table with Token Uniqueness, Lowercase Email Check, & RESTRICT Foreign Keys
CREATE TABLE IF NOT EXISTS "organization_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
	"email" varchar(255) NOT NULL CONSTRAINT "chk_invitation_email_lowercase" CHECK ("email" = lower("email")),
	"role" varchar(50) NOT NULL CONSTRAINT "chk_invitation_role" CHECK ("role" IN ('owner', 'manager', 'accountant', 'maintenance', 'read_only')),
	"invited_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
	"token_hash" varchar(255) NOT NULL,
	"note" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL CONSTRAINT "chk_invitation_status" CHECK ("status" IN ('draft', 'pending', 'sent', 'accepted', 'expired', 'revoked')),
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Unique Index on token_hash
CREATE UNIQUE INDEX IF NOT EXISTS "unique_invitation_token_hash" ON "organization_invitations" ("token_hash");

-- Partial Unique Index for Active Invitations (draft, pending, sent)
CREATE UNIQUE INDEX IF NOT EXISTS "unique_active_invitation_per_org_email" ON "organization_invitations" ("org_id", "email") WHERE status IN ('draft', 'pending', 'sent');

-- 3. Add last_active_org_id to users and backfill
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_active_org_id" uuid REFERENCES "organizations"("id") ON DELETE RESTRICT;
UPDATE "users" SET "last_active_org_id" = "org_id" WHERE "org_id" IS NOT NULL AND "last_active_org_id" IS NULL;

-- 4. Two-Phase Safe Migration for organizations.slug (with max 200-char truncation for long slugs)
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "slug" varchar(255);

-- Backfill slugs deterministically with collision resolution and reserved-word handling
DO $$
DECLARE
  r RECORD;
  base_slug TEXT;
  final_slug TEXT;
  counter INT;
BEGIN
  FOR r IN SELECT id, name FROM organizations WHERE slug IS NULL LOOP
    -- Slugify name: lowercase, replace non-alphanumeric with hyphen, trim hyphens
    base_slug := lower(regexp_replace(r.name, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := trim(both '-' from base_slug);
    
    -- Handle empty or reserved slugs
    IF base_slug = '' OR base_slug IN ('settings', 'invite', 'login', 'register', 'admin', 'api', 'workspaces') THEN
      base_slug := COALESCE(NULLIF(base_slug, ''), 'workspace') || '-org';
    END IF;

    -- Truncate base_slug to 200 characters to leave ample room for collision suffixes
    base_slug := substring(base_slug from 1 for 200);
    base_slug := trim(both '-' from base_slug);
    
    final_slug := base_slug;
    counter := 1;
    WHILE EXISTS (SELECT 1 FROM organizations WHERE slug = final_slug) LOOP
      final_slug := base_slug || '-' || counter;
      counter := counter + 1;
    END LOOP;
    
    UPDATE organizations SET slug = final_slug WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "organizations" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_unique" ON "organizations" ("slug");

-- 5. Preflight Migration Guard: Reject NULL or unrecognized legacy roles (Fail Closed)
DO $$
DECLARE
  invalid_role_count INT;
BEGIN
  SELECT COUNT(*) INTO invalid_role_count
  FROM "users"
  WHERE "org_id" IS NOT NULL
    AND (
      "role" IS NULL
      OR "role" NOT IN ('owner', 'manager', 'accountant', 'maintenance', 'read_only')
    );
    
  IF invalid_role_count > 0 THEN
    RAISE EXCEPTION 'Migration 0004 preflight failed: Found % user record(s) with invalid or NULL legacy roles.', invalid_role_count;
  END IF;
END $$;

-- 6. Backfill active OrganizationMembership records for existing users (strict explicit CASE mapping)
INSERT INTO "organization_memberships" ("id", "org_id", "user_id", "role", "status", "joined_at", "created_at", "updated_at")
SELECT 
  gen_random_uuid(),
  u."org_id",
  u."id",
  CASE u."role"
    WHEN 'owner' THEN 'owner'
    WHEN 'manager' THEN 'manager'
    WHEN 'accountant' THEN 'accountant'
    WHEN 'maintenance' THEN 'maintenance'
    WHEN 'read_only' THEN 'read_only'
  END,
  'active',
  u."created_at",
  NOW(),
  NOW()
FROM "users" u
WHERE u."org_id" IS NOT NULL
ON CONFLICT ("org_id", "user_id") DO NOTHING;
