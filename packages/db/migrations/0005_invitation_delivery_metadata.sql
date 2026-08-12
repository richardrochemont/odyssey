ALTER TABLE "organization_invitations" ADD COLUMN "delivery_status" varchar(50) DEFAULT 'not_sent' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD COLUMN "provider_message_id" varchar(255);--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD COLUMN "last_delivery_error" text;--> statement-breakpoint
ALTER TABLE "organization_invitations" ADD CONSTRAINT "check_organization_invitations_delivery_status" CHECK ("delivery_status" IN ('not_sent', 'skipped', 'accepted', 'delivered', 'bounced', 'complained', 'failed'));