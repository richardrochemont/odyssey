-- Migration 0006: Real Owner-Only CSV Onboarding Pilot & Financial Coverage Engine

-- 1. PROPERTIES Table Enhancements
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "external_key" varchar(255);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "property_name" varchar(255);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "address_line1" varchar(255);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "address_line2" varchar(255);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "city" varchar(255);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "state" varchar(255);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "postal_code" varchar(50);

CREATE UNIQUE INDEX IF NOT EXISTS "unique_properties_org_ext_key" 
ON "properties" ("org_id", "external_key") 
WHERE "archived_at" IS NULL AND "external_key" IS NOT NULL;

-- 2. UNITS Table Enhancements & CHECK Constraints
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "external_key" varchar(255);
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "bedrooms" integer;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "bathrooms" varchar(50);
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "market_rent_cents" integer NOT NULL DEFAULT 0;

ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "chk_units_bedrooms";
ALTER TABLE "units" ADD CONSTRAINT "chk_units_bedrooms" CHECK ("bedrooms" IS NULL OR "bedrooms" >= 0);

ALTER TABLE "units" DROP CONSTRAINT IF EXISTS "chk_units_market_rent";
ALTER TABLE "units" ADD CONSTRAINT "chk_units_market_rent" CHECK ("market_rent_cents" >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS "unique_units_org_ext_key" 
ON "units" ("org_id", "external_key") 
WHERE "archived_at" IS NULL AND "external_key" IS NOT NULL;

-- 3. TENANTS Table Enhancements
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "external_key" varchar(255);
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "first_name" varchar(255);
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "last_name" varchar(255);
ALTER TABLE "tenants" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "tenants" ALTER COLUMN "phone" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "unique_tenants_org_ext_key" 
ON "tenants" ("org_id", "external_key") 
WHERE "archived_at" IS NULL AND "external_key" IS NOT NULL;

-- 4. IMPORT_ROWS Table Duplicate Classification & CHECK Constraint
ALTER TABLE "import_rows" ADD COLUMN IF NOT EXISTS "row_fingerprint" varchar(64);
ALTER TABLE "import_rows" ADD COLUMN IF NOT EXISTS "duplicate_classification" varchar(50);

ALTER TABLE "import_rows" DROP CONSTRAINT IF EXISTS "chk_import_rows_duplicate_classification";
ALTER TABLE "import_rows" ADD CONSTRAINT "chk_import_rows_duplicate_classification" 
CHECK ("duplicate_classification" IS NULL OR "duplicate_classification" IN ('exact_duplicate', 'conflicting_reference', 'possible_cross_source_duplicate'));

-- 5. PAYMENTS Table External References, Coverage Month & CHECK Constraints
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "coverage_month" varchar(7);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "external_reference" varchar(255);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "allocation_method" varchar(50);

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "chk_payment_coverage_month";
ALTER TABLE "payments" ADD CONSTRAINT "chk_payment_coverage_month" 
CHECK ("coverage_month" IS NULL OR "coverage_month" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "chk_payments_allocation_method";
ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_allocation_method" 
CHECK ("allocation_method" IS NULL OR "allocation_method" IN ('coverage_month', 'single_charge_match', 'unallocated', 'needs_review'));

CREATE INDEX IF NOT EXISTS "idx_payments_org_ext_ref" 
ON "payments" ("org_id", "external_reference") 
WHERE "archived_at" IS NULL AND "external_reference" IS NOT NULL;

-- 6. FINANCIAL_RECORDS Table External References & Date Columns (date type for calendar integrity)
ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "external_reference" varchar(255);
ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "paid_date" date;
ALTER TABLE "financial_records" ADD COLUMN IF NOT EXISTS "transaction_date" date;

CREATE INDEX IF NOT EXISTS "idx_financial_records_org_ext_ref" 
ON "financial_records" ("org_id", "external_reference") 
WHERE "archived_at" IS NULL AND "external_reference" IS NOT NULL;

-- 7. MONTHLY_FINANCIAL_SUMMARIES Table Creation (Imported Summary Data Only)
CREATE TABLE IF NOT EXISTS "monthly_financial_summaries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "properties"("id"),
  "month" varchar(7) NOT NULL,
  "scheduled_rent_cents" integer NOT NULL DEFAULT 0,
  "collected_rent_cents" integer NOT NULL DEFAULT 0,
  "expense_cents" integer NOT NULL DEFAULT 0,
  "source_note" text,
  "import_run_id" uuid REFERENCES "import_runs"("id"),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "archived_at" timestamp,
  
  CONSTRAINT "chk_summary_month_format" CHECK ("month" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "chk_summary_non_negative_scheduled" CHECK ("scheduled_rent_cents" >= 0),
  CONSTRAINT "chk_summary_non_negative_collected" CHECK ("collected_rent_cents" >= 0),
  CONSTRAINT "chk_summary_non_negative_expenses" CHECK ("expense_cents" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "unique_org_property_month_summary" 
ON "monthly_financial_summaries" ("org_id", "property_id", "month") 
WHERE "archived_at" IS NULL;

-- 8. PROPERTY_MONTH_FINANCIAL_COVERAGES Table Creation (Coverage State & Attestation Model)
CREATE TABLE IF NOT EXISTS "property_month_financial_coverages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "properties"("id"),
  "month" varchar(7) NOT NULL,
  "state" varchar(50) NOT NULL DEFAULT 'summary_only',
  "attested_by_user_id" uuid REFERENCES "users"("id"),
  "attested_at" timestamp,
  "attestation_reason" text,
  "invalidated_at" timestamp,
  "invalidated_by_entity_type" varchar(100),
  "invalidated_by_entity_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "archived_at" timestamp,

  CONSTRAINT "chk_coverage_month_format" CHECK ("month" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "chk_coverage_state" CHECK ("state" IN ('summary_only', 'partial_detail', 'detail_complete', 'needs_review'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "unique_org_property_month_coverage" 
ON "property_month_financial_coverages" ("org_id", "property_id", "month") 
WHERE "archived_at" IS NULL;
