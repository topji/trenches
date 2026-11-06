CREATE TABLE IF NOT EXISTS "issued_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"trench_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
