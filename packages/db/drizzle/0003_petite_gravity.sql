CREATE TABLE IF NOT EXISTS "winner_accounts" (
	"trader" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"encrypted_key" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trenches" ADD COLUMN "settlement_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trenches" ADD COLUMN "paid_at" timestamp with time zone;