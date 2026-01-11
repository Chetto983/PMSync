-- Fix: Add tenantId to calendar_sync_states table
-- The previous migration (20250109_citus_tenantid_columns) incorrectly referenced
-- "calendar_sync_state" (singular) but the actual table is "calendar_sync_states" (plural)
-- This migration adds the missing tenantId column to the correct table

-- STEP 1: Add tenantId column (nullable initially for safe backfill)
ALTER TABLE "calendar_sync_states" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- STEP 2: Backfill tenantId from ProviderConfig
UPDATE "calendar_sync_states" css
SET "tenantId" = pc."tenantId"
FROM "provider_configs" pc
WHERE css."providerId" = pc."id" AND css."tenantId" IS NULL;

-- STEP 3: Set NOT NULL constraint
ALTER TABLE "calendar_sync_states" ALTER COLUMN "tenantId" SET NOT NULL;

-- STEP 4: Add index for query performance
CREATE INDEX IF NOT EXISTS "calendar_sync_states_tenantId_idx" ON "calendar_sync_states"("tenantId");

-- STEP 5: Update unique constraint to include tenantId (drop old one first)
ALTER TABLE "calendar_sync_states" DROP CONSTRAINT IF EXISTS "calendar_sync_states_providerId_calendarId_key";
ALTER TABLE "calendar_sync_states" ADD CONSTRAINT "calendar_sync_states_tenantId_providerId_calendarId_key"
  UNIQUE ("tenantId", "providerId", "calendarId");

-- STEP 6: Add FK constraint to tenants table
ALTER TABLE "calendar_sync_states" ADD CONSTRAINT "calendar_sync_states_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
