CREATE TABLE IF NOT EXISTS "clan_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"clan_id" text NOT NULL,
	"trader" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clan_memberships" ADD CONSTRAINT "clan_memberships_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clan_memberships_trader_idx" ON "clan_memberships" USING btree ("trader");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clan_memberships_clan_idx" ON "clan_memberships" USING btree ("clan_id");