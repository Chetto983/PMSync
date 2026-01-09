-- Citus Horizontal Sharding Preparation: Add tenantId to child tables
-- This migration adds tenantId columns and updates unique constraints for Citus compatibility

-- ============================================================================
-- PHASE 1: Add tenantId columns to tables that were missing them
-- ============================================================================

-- UserPreferences: Add tenantId (populate from User.tenantId)
ALTER TABLE "user_preferences" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "user_preferences" up SET "tenantId" = u."tenantId"
FROM "users" u WHERE up."userId" = u."id" AND up."tenantId" IS NULL;
ALTER TABLE "user_preferences" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "user_preferences_tenantId_idx" ON "user_preferences"("tenantId");
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DashboardPreference: Add tenantId (populate from User.tenantId)
ALTER TABLE "dashboard_preferences" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "dashboard_preferences" dp SET "tenantId" = u."tenantId"
FROM "users" u WHERE dp."userId" = u."id" AND dp."tenantId" IS NULL;
ALTER TABLE "dashboard_preferences" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "dashboard_preferences_tenantId_idx" ON "dashboard_preferences"("tenantId");
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MfaSecret: Add tenantId (populate from User.tenantId)
ALTER TABLE "mfa_secrets" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "mfa_secrets" ms SET "tenantId" = u."tenantId"
FROM "users" u WHERE ms."userId" = u."id" AND ms."tenantId" IS NULL;
ALTER TABLE "mfa_secrets" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "mfa_secrets_tenantId_idx" ON "mfa_secrets"("tenantId");
ALTER TABLE "mfa_secrets" ADD CONSTRAINT "mfa_secrets_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MfaBackupCode: Add tenantId (populate from User.tenantId)
ALTER TABLE "mfa_backup_codes" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "mfa_backup_codes" mbc SET "tenantId" = u."tenantId"
FROM "users" u WHERE mbc."userId" = u."id" AND mbc."tenantId" IS NULL;
ALTER TABLE "mfa_backup_codes" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "mfa_backup_codes_tenantId_idx" ON "mfa_backup_codes"("tenantId");
ALTER TABLE "mfa_backup_codes" ADD CONSTRAINT "mfa_backup_codes_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EmailLabel: Add tenantId (populate from Email.tenantId)
ALTER TABLE "email_labels" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "email_labels" el SET "tenantId" = e."tenantId"
FROM "emails" e WHERE el."emailId" = e."id" AND el."tenantId" IS NULL;
ALTER TABLE "email_labels" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "email_labels_tenantId_idx" ON "email_labels"("tenantId");
ALTER TABLE "email_labels" ADD CONSTRAINT "email_labels_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EmailAttachment: Add tenantId (populate from Email.tenantId)
ALTER TABLE "email_attachments" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "email_attachments" ea SET "tenantId" = e."tenantId"
FROM "emails" e WHERE ea."emailId" = e."id" AND ea."tenantId" IS NULL;
ALTER TABLE "email_attachments" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "email_attachments_tenantId_idx" ON "email_attachments"("tenantId");
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CalendarEventAttachment: Add tenantId (populate from CalendarEvent.tenantId)
ALTER TABLE "calendar_event_attachments" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "calendar_event_attachments" cea SET "tenantId" = ce."tenantId"
FROM "calendar_events" ce WHERE cea."eventId" = ce."id" AND cea."tenantId" IS NULL;
ALTER TABLE "calendar_event_attachments" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "calendar_event_attachments_tenantId_idx" ON "calendar_event_attachments"("tenantId");
ALTER TABLE "calendar_event_attachments" ADD CONSTRAINT "calendar_event_attachments_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CalendarSyncState: Add tenantId (populate from ProviderConfig.tenantId)
ALTER TABLE "calendar_sync_state" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
UPDATE "calendar_sync_state" css SET "tenantId" = pc."tenantId"
FROM "provider_configs" pc WHERE css."providerId" = pc."id" AND css."tenantId" IS NULL;
ALTER TABLE "calendar_sync_state" ALTER COLUMN "tenantId" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "calendar_sync_state_tenantId_idx" ON "calendar_sync_state"("tenantId");
ALTER TABLE "calendar_sync_state" ADD CONSTRAINT "calendar_sync_state_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- PHASE 2: Update unique constraints to include tenantId
-- ============================================================================

-- EmailLabel: Update unique constraint from (emailId, labelId) to (tenantId, emailId, labelId)
ALTER TABLE "email_labels" DROP CONSTRAINT IF EXISTS "email_labels_emailId_labelId_key";
ALTER TABLE "email_labels" ADD CONSTRAINT "email_labels_tenantId_emailId_labelId_key"
  UNIQUE ("tenantId", "emailId", "labelId");

-- CalendarSyncState: Update unique constraint from (providerId, calendarId) to (tenantId, providerId, calendarId)
ALTER TABLE "calendar_sync_state" DROP CONSTRAINT IF EXISTS "calendar_sync_state_providerId_calendarId_key";
ALTER TABLE "calendar_sync_state" ADD CONSTRAINT "calendar_sync_state_tenantId_providerId_calendarId_key"
  UNIQUE ("tenantId", "providerId", "calendarId");
