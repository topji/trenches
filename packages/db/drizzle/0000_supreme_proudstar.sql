CREATE TABLE IF NOT EXISTS "entries" (
	"trench_id" text NOT NULL,
	"trader" text NOT NULL,
	"nullifier_hash" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"arkiv_entity_key" text,
	CONSTRAINT "entries_trench_id_trader_pk" PRIMARY KEY("trench_id","trader")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "escrow_keys" (
	"trench_id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"public_key_der" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fee_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"trench_id" text NOT NULL,
	"fill_id" text NOT NULL,
	"admin" text NOT NULL,
	"platform_usd" numeric(18, 6) NOT NULL,
	"admin_usd" numeric(18, 6) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fills" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"trench_id" text NOT NULL,
	"trader" text NOT NULL,
	"asset" text NOT NULL,
	"side" text NOT NULL,
	"qty" numeric(36, 18) NOT NULL,
	"price_usd" numeric(18, 6) NOT NULL,
	"fee_usd" numeric(18, 6) NOT NULL,
	"tx_hash" text NOT NULL,
	"filled_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hcs_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"trench_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"event" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"tx_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"name" text PRIMARY KEY NOT NULL,
	"last_run_at" timestamp with time zone,
	"cursor" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leaderboard" (
	"trench_id" text NOT NULL,
	"trader" text NOT NULL,
	"rank" integer NOT NULL,
	"pnl_usd" numeric(18, 6) NOT NULL,
	"roi_pct" numeric(18, 6) NOT NULL,
	"volume_usd" numeric(18, 6) NOT NULL,
	"win_rate" numeric(18, 6) NOT NULL,
	"fills" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "leaderboard_trench_id_trader_pk" PRIMARY KEY("trench_id","trader")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"flash_order_id" text,
	"trench_id" text NOT NULL,
	"trader" text NOT NULL,
	"type" text NOT NULL,
	"asset" text NOT NULL,
	"side" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payouts" (
	"trench_id" text NOT NULL,
	"trader" text NOT NULL,
	"rank" integer NOT NULL,
	"amount_usdc" numeric(18, 6) NOT NULL,
	"hedera_tx_id" text NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payouts_trench_id_trader_pk" PRIMARY KEY("trench_id","trader")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trenches" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"admin_address" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"allowed_assets" jsonb NOT NULL,
	"prize_pool_usdc" numeric(18, 6) NOT NULL,
	"prize_split" jsonb NOT NULL,
	"entry_rule" text DEFAULT 'open' NOT NULL,
	"invite_code" text,
	"admin_fee_share_bps" integer DEFAULT 5000 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"escrow_account_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"funding_tx_id" text,
	"payout_tx_id" text,
	"schedule_id" text,
	"sponsor" jsonb,
	"arkiv_entity_key" text,
	"arkiv_tx_hash" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "world_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"trench_id" text NOT NULL,
	"nullifier_hash" text NOT NULL,
	"trader" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entries" ADD CONSTRAINT "entries_trench_id_trenches_id_fk" FOREIGN KEY ("trench_id") REFERENCES "public"."trenches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "escrow_keys" ADD CONSTRAINT "escrow_keys_trench_id_trenches_id_fk" FOREIGN KEY ("trench_id") REFERENCES "public"."trenches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_ledger" ADD CONSTRAINT "fee_ledger_trench_id_trenches_id_fk" FOREIGN KEY ("trench_id") REFERENCES "public"."trenches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fee_ledger" ADD CONSTRAINT "fee_ledger_fill_id_fills_id_fk" FOREIGN KEY ("fill_id") REFERENCES "public"."fills"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fills" ADD CONSTRAINT "fills_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fills" ADD CONSTRAINT "fills_trench_id_trenches_id_fk" FOREIGN KEY ("trench_id") REFERENCES "public"."trenches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hcs_messages" ADD CONSTRAINT "hcs_messages_trench_id_trenches_id_fk" FOREIGN KEY ("trench_id") REFERENCES "public"."trenches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboard" ADD CONSTRAINT "leaderboard_trench_id_trenches_id_fk" FOREIGN KEY ("trench_id") REFERENCES "public"."trenches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_trench_id_trenches_id_fk" FOREIGN KEY ("trench_id") REFERENCES "public"."trenches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payouts" ADD CONSTRAINT "payouts_trench_id_trenches_id_fk" FOREIGN KEY ("trench_id") REFERENCES "public"."trenches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "world_verifications" ADD CONSTRAINT "world_verifications_trench_id_trenches_id_fk" FOREIGN KEY ("trench_id") REFERENCES "public"."trenches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fills_trench_idx" ON "fills" USING btree ("trench_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fills_tx_idx" ON "fills" USING btree ("tx_hash","order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hcs_messages_trench_idx" ON "hcs_messages" USING btree ("trench_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_trench_idx" ON "orders" USING btree ("trench_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "orders_flash_id_idx" ON "orders" USING btree ("flash_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trenches_slug_idx" ON "trenches" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trenches_status_idx" ON "trenches" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trenches_admin_idx" ON "trenches" USING btree ("admin_address");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "world_verifications_trench_nullifier_idx" ON "world_verifications" USING btree ("trench_id","nullifier_hash");