ALTER TABLE "properties" ADD COLUMN "estimated_value" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "valuation_date" timestamp;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "valuation_source" varchar(255);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "valuation_notes" text;