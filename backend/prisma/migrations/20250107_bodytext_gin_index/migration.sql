-- Performance optimization migration for email search
-- Research: https://pganalyze.com/blog/gin-index
-- GIN trigram: 98.7% faster wildcard search (8s -> 103ms)

-- GIN trigram index on bodyText for full-text search
-- Note: Only index first 10KB of bodyText to avoid bloat on large emails
CREATE INDEX IF NOT EXISTS "emails_bodyText_gin_idx"
  ON "emails"
  USING gin (LEFT("bodyText", 10000) gin_trgm_ops);

-- Expression index for case-insensitive folder queries
-- Avoids runtime LOWER() calls on every row
CREATE INDEX IF NOT EXISTS "emails_folder_lower_idx"
  ON "emails" (LOWER("folder"));

-- Composite index for common list queries (tenantId + folder + receivedAt)
CREATE INDEX IF NOT EXISTS "emails_tenantId_folder_receivedAt_idx"
  ON "emails" ("tenantId", "folder", "receivedAt" DESC);

-- Composite index for unread count queries
CREATE INDEX IF NOT EXISTS "emails_providerId_folder_isRead_isDeleted_idx"
  ON "emails" ("providerId", "folder", "isRead", "isDeleted");
