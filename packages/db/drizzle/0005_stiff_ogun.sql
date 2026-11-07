CREATE TABLE IF NOT EXISTS "clan_members" (
	"trader" text PRIMARY KEY NOT NULL,
	"clan_id" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"arkiv_entity_key" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clan_scores" (
	"clan_id" text NOT NULL,
	"season" text NOT NULL,
	"score" numeric(18, 6) NOT NULL,
	"rank" integer NOT NULL,
	"podiums" integer DEFAULT 0 NOT NULL,
	"members" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"arkiv_entity_key" text,
	CONSTRAINT "clan_scores_clan_id_season_pk" PRIMARY KEY("clan_id","season")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"leader" text NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"invite_code" text,
	"member_count" integer DEFAULT 1 NOT NULL,
	"arkiv_entity_key" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"trader" text PRIMARY KEY NOT NULL,
	"handle" text,
	"nullifier_hash" text,
	"clan_id" text,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"title" text DEFAULT 'Recruit' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trenches" ADD COLUMN "clan_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "clan_scores" ADD CONSTRAINT "clan_scores_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "clans_tag_idx" ON "clans" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_handle_idx" ON "profiles" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "profiles_nullifier_idx" ON "profiles" USING btree ("nullifier_hash");