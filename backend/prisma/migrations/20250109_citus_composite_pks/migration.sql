-- Citus Horizontal Sharding: Convert to Composite Primary Keys
-- This migration converts single-column PKs to composite PKs for Citus compatibility
-- IMPORTANT: Run AFTER 20250109_citus_tenantid_columns migration

-- ============================================================================
-- PHASE 1: Drop existing foreign keys that reference tables being modified
-- ============================================================================

-- Email references (EmailLabel, EmailAttachment, Embedding, EmailAnalysis, EmailFollowUp, ActionQueue)
ALTER TABLE "email_labels" DROP CONSTRAINT IF EXISTS "email_labels_emailId_fkey";
ALTER TABLE "email_attachments" DROP CONSTRAINT IF EXISTS "email_attachments_emailId_fkey";
ALTER TABLE "embeddings" DROP CONSTRAINT IF EXISTS "embeddings_emailId_fkey";
ALTER TABLE "email_analyses" DROP CONSTRAINT IF EXISTS "email_analyses_emailId_fkey";
ALTER TABLE "email_follow_ups" DROP CONSTRAINT IF EXISTS "email_follow_ups_emailId_fkey";
ALTER TABLE "action_queue" DROP CONSTRAINT IF EXISTS "action_queue_emailId_fkey";

-- Contact references (Embedding, ProviderContact, Deal, ContactInteraction)
ALTER TABLE "embeddings" DROP CONSTRAINT IF EXISTS "embeddings_contactId_fkey";
ALTER TABLE "provider_contacts" DROP CONSTRAINT IF EXISTS "provider_contacts_contactId_fkey";
ALTER TABLE "deals" DROP CONSTRAINT IF EXISTS "deals_contactId_fkey";
ALTER TABLE "contact_interactions" DROP CONSTRAINT IF EXISTS "contact_interactions_contactId_fkey";

-- CalendarEvent references (CalendarEventAttachment)
ALTER TABLE "calendar_event_attachments" DROP CONSTRAINT IF EXISTS "calendar_event_attachments_eventId_fkey";

-- Folder self-reference
ALTER TABLE "folders" DROP CONSTRAINT IF EXISTS "folders_parentId_fkey";

-- ============================================================================
-- PHASE 2: Drop existing unique constraints that will be replaced
-- ============================================================================

-- EmailAnalysis: emailId unique → (emailId, tenantId) unique
ALTER TABLE "email_analyses" DROP CONSTRAINT IF EXISTS "email_analyses_emailId_key";

-- EmailFollowUp: emailId unique → (emailId, tenantId) unique
ALTER TABLE "email_follow_ups" DROP CONSTRAINT IF EXISTS "email_follow_ups_emailId_key";

-- ============================================================================
-- PHASE 3: Convert to composite primary keys
-- ============================================================================

-- Email: id → (id, tenantId)
ALTER TABLE "emails" DROP CONSTRAINT IF EXISTS "emails_pkey";
ALTER TABLE "emails" ADD PRIMARY KEY ("id", "tenantId");

-- Folder: id → (id, tenantId)
ALTER TABLE "folders" DROP CONSTRAINT IF EXISTS "folders_pkey";
ALTER TABLE "folders" ADD PRIMARY KEY ("id", "tenantId");

-- CalendarEvent: id → (id, tenantId)
ALTER TABLE "calendar_events" DROP CONSTRAINT IF EXISTS "calendar_events_pkey";
ALTER TABLE "calendar_events" ADD PRIMARY KEY ("id", "tenantId");

-- Contact (unified_contacts): id → (id, tenantId)
ALTER TABLE "unified_contacts" DROP CONSTRAINT IF EXISTS "unified_contacts_pkey";
ALTER TABLE "unified_contacts" ADD PRIMARY KEY ("id", "tenantId");

-- Embedding: id → (id, tenantId)
ALTER TABLE "embeddings" DROP CONSTRAINT IF EXISTS "embeddings_pkey";
ALTER TABLE "embeddings" ADD PRIMARY KEY ("id", "tenantId");

-- ============================================================================
-- PHASE 4: Re-create unique constraints with tenantId
-- ============================================================================

-- EmailAnalysis: unique on (emailId, tenantId)
ALTER TABLE "email_analyses" ADD CONSTRAINT "email_analyses_emailId_tenantId_key"
  UNIQUE ("emailId", "tenantId");

-- EmailFollowUp: unique on (emailId, tenantId)
ALTER TABLE "email_follow_ups" ADD CONSTRAINT "email_follow_ups_emailId_tenantId_key"
  UNIQUE ("emailId", "tenantId");

-- ============================================================================
-- PHASE 5: Re-create foreign keys with composite references
-- ============================================================================

-- Email references
ALTER TABLE "email_labels" ADD CONSTRAINT "email_labels_email_fkey"
  FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_email_fkey"
  FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_email_fkey"
  FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_analyses" ADD CONSTRAINT "email_analyses_email_fkey"
  FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "email_follow_ups" ADD CONSTRAINT "email_follow_ups_email_fkey"
  FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "action_queue" ADD CONSTRAINT "action_queue_email_fkey"
  FOREIGN KEY ("emailId", "tenantId") REFERENCES "emails"("id", "tenantId") ON UPDATE CASCADE;

-- Contact references
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_contact_fkey"
  FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "provider_contacts" ADD CONSTRAINT "provider_contacts_contact_fkey"
  FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_fkey"
  FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contact_interactions" ADD CONSTRAINT "contact_interactions_contact_fkey"
  FOREIGN KEY ("contactId", "tenantId") REFERENCES "unified_contacts"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- CalendarEvent references
ALTER TABLE "calendar_event_attachments" ADD CONSTRAINT "calendar_event_attachments_event_fkey"
  FOREIGN KEY ("eventId", "tenantId") REFERENCES "calendar_events"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Folder self-reference
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_fkey"
  FOREIGN KEY ("parentId", "tenantId") REFERENCES "folders"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify composite PKs are in place
DO $$
DECLARE
  pk_record RECORD;
BEGIN
  FOR pk_record IN
    SELECT
      t.relname as table_name,
      array_agg(a.attname ORDER BY array_position(i.indkey, a.attnum)) as pk_columns
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(i.indkey)
    WHERE i.indisprimary
      AND t.relname IN ('emails', 'folders', 'calendar_events', 'unified_contacts', 'embeddings')
    GROUP BY t.relname
  LOOP
    IF pk_record.pk_columns::text[] = ARRAY['id', 'tenantId']::text[] THEN
      RAISE NOTICE '✅ % has composite PK (id, tenantId)', pk_record.table_name;
    ELSE
      RAISE WARNING '❌ % has PK: %', pk_record.table_name, pk_record.pk_columns;
    END IF;
  END LOOP;
END $$;
