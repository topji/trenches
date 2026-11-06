CREATE TABLE IF NOT EXISTS "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"trench_id" text NOT NULL,
	"trader" text NOT NULL,
	"type" text NOT NULL,
	"asset" text NOT NULL,
	"symbol" text NOT NULL,
	"side" text NOT NULL,
	"params" jsonb NOT NULL,
	"request" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"order_typed_data" text,
	"permit_typed_data" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "quotes" ADD CONSTRAINT "quotes_trench_id_trenches_id_fk" FOREIGN KEY ("trench_id") REFERENCES "public"."trenches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "quotes_trader_idx" ON "quotes" USING btree ("trench_id","trader");