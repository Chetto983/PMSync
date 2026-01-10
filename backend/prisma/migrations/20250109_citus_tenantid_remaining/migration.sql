-- Citus Schema Migration: Add tenantId to 6 remaining tables
-- Phase: Schema Blockers for 100% Citus-readiness
-- Date: 2026-01-09
--
-- Tables affected:
-- 1. sessions - Add tenantId + unique constraint
-- 2. trusted_devices - Add tenantId + unique constraint
-- 3. webauthn_credentials - Add tenantId + unique constraint
-- 4. ai_memory_history - Add tenantId + index
-- 5. library_documents - Add tenantId + index
-- 6. deal_activities - Add tenantId + index

-- ============================================================================
-- STEP 1: Add tenantId columns (nullable initially for safe backfill)
-- ============================================================================
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "trusted_devices" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "webauthn_credentials" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ai_memory_history" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "library_documents" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "deal_activities" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- ============================================================================
-- STEP 2: Backfill tenantId from parent tables
-- ============================================================================
-- Sessions, TrustedDevices, WebAuthnCredentials -> derive from User
UPDATE "sessions" s
SET "tenantId" = u."tenantId"
FROM "users" u
WHERE s."userId" = u.id AND s."tenantId" IS NULL;

UPDATE "trusted_devices" td
SET "tenantId" = u."tenantId"
FROM "users" u
WHERE td."userId" = u.id AND td."tenantId" IS NULL;

UPDATE "webauthn_credentials" wc
SET "tenantId" = u."tenantId"
FROM "users" u
WHERE wc."userId" = u.id AND wc."tenantId" IS NULL;

-- AIMemoryHistory -> derive from AIMemory
UPDATE "ai_memory_history" amh
SET "tenantId" = am."tenantId"
FROM "ai_memories" am
WHERE amh."memoryId" = am.id AND amh."tenantId" IS NULL;

-- LibraryDocuments -> derive from DocumentLibrary
UPDATE "library_documents" ld
SET "tenantId" = dl."tenantId"
FROM "document_libraries" dl
WHERE ld."libraryId" = dl.id AND ld."tenantId" IS NULL;

-- DealActivities -> derive from Deal
UPDATE "deal_activities" da
SET "tenantId" = d."tenantId"
FROM "deals" d
WHERE da."dealId" = d.id AND da."tenantId" IS NULL;

-- ============================================================================
-- STEP 3: Set NOT NULL constraint (only if backfill succeeded)
-- ============================================================================
-- Note: These will fail if any rows have NULL tenantId after backfill
-- This is intentional - we want to catch orphan records before they cause issues
ALTER TABLE "sessions" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "trusted_devices" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "webauthn_credentials" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ai_memory_history" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "library_documents" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "deal_activities" ALTER COLUMN "tenantId" SET NOT NULL;

-- ============================================================================
-- STEP 4: Drop old unique constraints (that don't include tenantId)
-- ============================================================================
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_token_key";
ALTER TABLE "trusted_devices" DROP CONSTRAINT IF EXISTS "trusted_devices_deviceToken_key";
ALTER TABLE "webauthn_credentials" DROP CONSTRAINT IF EXISTS "webauthn_credentials_credentialId_key";

-- ============================================================================
-- STEP 5: Add new unique constraints with tenantId (Citus-ready)
-- ============================================================================
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_token_key" UNIQUE ("tenantId", "token");
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_tenantId_deviceToken_key" UNIQUE ("tenantId", "deviceToken");
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_tenantId_credentialId_key" UNIQUE ("tenantId", "credentialId");

-- ============================================================================
-- STEP 6: Add tenantId indexes for query performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS "sessions_tenantId_idx" ON "sessions"("tenantId");
CREATE INDEX IF NOT EXISTS "trusted_devices_tenantId_idx" ON "trusted_devices"("tenantId");
CREATE INDEX IF NOT EXISTS "webauthn_credentials_tenantId_idx" ON "webauthn_credentials"("tenantId");
CREATE INDEX IF NOT EXISTS "ai_memory_history_tenantId_idx" ON "ai_memory_history"("tenantId");
CREATE INDEX IF NOT EXISTS "library_documents_tenantId_idx" ON "library_documents"("tenantId");
CREATE INDEX IF NOT EXISTS "deal_activities_tenantId_idx" ON "deal_activities"("tenantId");

-- ============================================================================
-- STEP 7: Delete orphan records with non-existent tenants (test data cleanup)
-- ============================================================================
DELETE FROM "sessions" WHERE "tenantId" NOT IN (SELECT id FROM "tenants");
DELETE FROM "trusted_devices" WHERE "tenantId" NOT IN (SELECT id FROM "tenants");
DELETE FROM "webauthn_credentials" WHERE "tenantId" NOT IN (SELECT id FROM "tenants");
DELETE FROM "ai_memory_history" WHERE "tenantId" NOT IN (SELECT id FROM "tenants");
DELETE FROM "library_documents" WHERE "tenantId" NOT IN (SELECT id FROM "tenants");
DELETE FROM "deal_activities" WHERE "tenantId" NOT IN (SELECT id FROM "tenants");

-- ============================================================================
-- STEP 8: Add FK constraints to tenants table
-- ============================================================================
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_memory_history" ADD CONSTRAINT "ai_memory_history_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_activities" ADD CONSTRAINT "deal_activities_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- VERIFICATION: Check all tables have tenantId
-- ============================================================================
DO $$
DECLARE
  orphan_sessions INTEGER;
  orphan_trusted_devices INTEGER;
  orphan_webauthn INTEGER;
  orphan_memory_history INTEGER;
  orphan_library_docs INTEGER;
  orphan_deal_activities INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_sessions FROM "sessions" WHERE "tenantId" IS NULL;
  SELECT COUNT(*) INTO orphan_trusted_devices FROM "trusted_devices" WHERE "tenantId" IS NULL;
  SELECT COUNT(*) INTO orphan_webauthn FROM "webauthn_credentials" WHERE "tenantId" IS NULL;
  SELECT COUNT(*) INTO orphan_memory_history FROM "ai_memory_history" WHERE "tenantId" IS NULL;
  SELECT COUNT(*) INTO orphan_library_docs FROM "library_documents" WHERE "tenantId" IS NULL;
  SELECT COUNT(*) INTO orphan_deal_activities FROM "deal_activities" WHERE "tenantId" IS NULL;

  IF orphan_sessions > 0 OR orphan_trusted_devices > 0 OR orphan_webauthn > 0 OR
     orphan_memory_history > 0 OR orphan_library_docs > 0 OR orphan_deal_activities > 0 THEN
    RAISE WARNING 'Orphan records found: sessions=%, trusted_devices=%, webauthn=%, memory_history=%, library_docs=%, deal_activities=%',
      orphan_sessions, orphan_trusted_devices, orphan_webauthn, orphan_memory_history, orphan_library_docs, orphan_deal_activities;
  ELSE
    RAISE NOTICE 'Migration complete: All 6 tables now have tenantId with Citus-ready constraints';
  END IF;
END $$;
