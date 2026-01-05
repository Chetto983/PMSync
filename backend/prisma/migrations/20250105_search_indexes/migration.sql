-- Enable pg_trgm extension for GIN trigram indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Email indexes for search optimization (avoid embedding costs)
-- HIGH-4 FIX: Composite index for count queries
CREATE INDEX IF NOT EXISTS "emails_providerId_folder_isRead_idx" ON "emails" ("providerId", "folder", "isRead");

-- Search by sender
CREATE INDEX IF NOT EXISTS "emails_tenantId_from_idx" ON "emails" ("tenantId", "from");

-- Flagged emails
CREATE INDEX IF NOT EXISTS "emails_tenantId_isFlagged_idx" ON "emails" ("tenantId", "isFlagged");

-- GIN trigram indexes for partial text search (LIKE '%keyword%')
CREATE INDEX IF NOT EXISTS "emails_subject_gin_idx" ON "emails" USING gin ("subject" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "emails_from_gin_idx" ON "emails" USING gin ("from" gin_trgm_ops);

-- Calendar event indexes
CREATE INDEX IF NOT EXISTS "calendar_events_tenantId_title_idx" ON "calendar_events" ("tenantId", "title");
CREATE INDEX IF NOT EXISTS "calendar_events_title_gin_idx" ON "calendar_events" USING gin ("title" gin_trgm_ops);

-- Contact indexes
CREATE INDEX IF NOT EXISTS "unified_contacts_displayName_gin_idx" ON "unified_contacts" USING gin ("displayName" gin_trgm_ops);

