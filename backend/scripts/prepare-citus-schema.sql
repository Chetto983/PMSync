-- ============================================================
-- CITUS SCHEMA PREPARATION - Phase 1
-- ============================================================
-- Run BEFORE installing Citus extension
-- These changes make the schema compatible with horizontal sharding
--
-- IMPORTANT: Take full backup before running!
-- pg_dump -Fc mailagent > mailagent_pre_citus.dump
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Fix unique constraints missing tenantId
-- ============================================================

-- 1.1 emails: Add tenantId to (providerId, externalId) constraint
-- Already has: @@unique([tenantId, messageId, folder]) ✅
ALTER TABLE emails
  DROP CONSTRAINT IF EXISTS "emails_providerId_externalId_key";
-- Note: This constraint may not exist in current schema, safe to drop

-- Create new constraint with tenantId
-- Actually, providerId is already scoped to tenant, so this is redundant
-- BUT Citus requires explicit tenantId in all unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "emails_tenantId_providerId_externalId_idx"
  ON emails ("tenantId", "providerId", "externalId");

-- 1.2 folders: Add tenantId to (providerId, path) constraint
ALTER TABLE folders
  DROP CONSTRAINT IF EXISTS "folders_providerId_path_key";

CREATE UNIQUE INDEX IF NOT EXISTS "folders_tenantId_providerId_path_idx"
  ON folders ("tenantId", "providerId", path);

-- 1.3 calendar_events: Add tenantId to (providerId, externalId) constraint
ALTER TABLE calendar_events
  DROP CONSTRAINT IF EXISTS "calendar_events_providerId_externalId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_tenantId_providerId_externalId_idx"
  ON calendar_events ("tenantId", "providerId", "externalId");

-- 1.4 provider_contacts: Add tenantId to (providerId, externalId) constraint
ALTER TABLE provider_contacts
  DROP CONSTRAINT IF EXISTS "provider_contacts_providerId_externalId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "provider_contacts_tenantId_providerId_externalId_idx"
  ON provider_contacts ("tenantId", "providerId", "externalId");

-- 1.5 webhook_subscriptions: Add tenantId to (providerId, resourcePath) constraint
ALTER TABLE webhook_subscriptions
  DROP CONSTRAINT IF EXISTS "webhook_subscriptions_providerId_resourcePath_key";

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_subscriptions_tenantId_providerId_resourcePath_idx"
  ON webhook_subscriptions ("tenantId", "providerId", "resourcePath");

-- 1.6 calendar_sync_state: Add tenantId column and constraint
-- First check if column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'calendar_sync_state' AND column_name = 'tenantId'
  ) THEN
    -- Add tenantId column (populate from provider)
    ALTER TABLE calendar_sync_state ADD COLUMN "tenantId" TEXT;

    UPDATE calendar_sync_state css
    SET "tenantId" = pc."tenantId"
    FROM provider_configs pc
    WHERE css."providerId" = pc.id;

    ALTER TABLE calendar_sync_state ALTER COLUMN "tenantId" SET NOT NULL;
  END IF;
END $$;

ALTER TABLE calendar_sync_state
  DROP CONSTRAINT IF EXISTS "calendar_sync_state_providerId_calendarId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "calendar_sync_state_tenantId_providerId_calendarId_idx"
  ON calendar_sync_state ("tenantId", "providerId", "calendarId");

-- ============================================================
-- STEP 2: Add tenantId indexes for faster filtering
-- (Already have most, but verify)
-- ============================================================

-- These should already exist, but ensure they do
CREATE INDEX IF NOT EXISTS "emails_tenantId_idx" ON emails ("tenantId");
CREATE INDEX IF NOT EXISTS "embeddings_tenantId_idx" ON embeddings ("tenantId");
CREATE INDEX IF NOT EXISTS "unified_contacts_tenantId_idx" ON unified_contacts ("tenantId");
CREATE INDEX IF NOT EXISTS "folders_tenantId_idx" ON folders ("tenantId");
CREATE INDEX IF NOT EXISTS "calendar_events_tenantId_idx" ON calendar_events ("tenantId");

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check all unique constraints include tenantId
DO $$
DECLARE
  bad_constraints RECORD;
  has_issues BOOLEAN := FALSE;
BEGIN
  FOR bad_constraints IN
    SELECT
      tc.table_name,
      tc.constraint_name,
      string_agg(kcu.column_name, ', ') as columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_name IN ('emails', 'embeddings', 'unified_contacts', 'folders', 'calendar_events', 'provider_contacts')
    GROUP BY tc.table_name, tc.constraint_name
    HAVING NOT bool_or(kcu.column_name = 'tenantId')
  LOOP
    RAISE WARNING 'Constraint % on % missing tenantId: %',
      bad_constraints.constraint_name,
      bad_constraints.table_name,
      bad_constraints.columns;
    has_issues := TRUE;
  END LOOP;

  IF NOT has_issues THEN
    RAISE NOTICE '✅ All unique constraints include tenantId';
  END IF;
END $$;

COMMIT;

-- ============================================================
-- POST-MIGRATION: Verify
-- ============================================================
-- Run this to check the schema is Citus-ready:

SELECT
  t.table_name,
  c.constraint_name,
  array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns
FROM information_schema.tables t
LEFT JOIN information_schema.table_constraints c
  ON t.table_name = c.table_name
LEFT JOIN information_schema.key_column_usage kcu
  ON c.constraint_name = kcu.constraint_name
WHERE t.table_schema = 'public'
  AND t.table_name IN ('emails', 'embeddings', 'unified_contacts', 'folders', 'calendar_events')
  AND c.constraint_type IN ('UNIQUE', 'PRIMARY KEY')
GROUP BY t.table_name, c.constraint_name
ORDER BY t.table_name, c.constraint_name;
