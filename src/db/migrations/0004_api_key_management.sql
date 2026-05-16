-- Story 10.4 — API Key Management
-- Adds api_key_id column (nullable) and makes api_key_hash nullable so a key
-- can be "revoked" (both columns NULL). Backfills api_key_id for existing
-- projects that still have a hash.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "api_key_id" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "api_key_hash" DROP NOT NULL;
--> statement-breakpoint
UPDATE "projects"
SET "api_key_id" = gen_random_uuid()
WHERE "api_key_id" IS NULL AND "api_key_hash" IS NOT NULL;
