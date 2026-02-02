-- Partial Composite Index for Unread Emails
-- Purpose: PERF-04 - Optimize the most common email list query pattern
--
-- Target query: WHERE isRead = false ORDER BY receivedAt DESC
-- This is the default inbox view showing unread emails sorted by date.
--
-- Why partial index (WHERE "isRead" = false)?
-- - Unread emails are typically ~20% of total emails (most are read)
-- - Partial index covers only unread emails, reducing index size by ~80%
-- - Index stays compact and fast even with millions of emails
--
-- Why tenantId + receivedAt?
-- - Multi-tenant: Must filter by tenant first (tenant isolation)
-- - receivedAt DESC: Natural sort order for inbox (newest first)
-- - Combined with WHERE "isRead" = false, covers the exact query plan
--
-- Expected impact:
-- - Inbox list queries: <10ms for unread emails (was ~50-100ms with seq scan)
-- - Index size: ~20% of full index (only unread rows)
-- - Write overhead: Minimal (only touches unread emails)
--
-- NOTE: Prisma doesn't support partial indexes in schema.prisma, so this is
-- managed via raw SQL migration only. Do not modify schema.prisma for this index.

-- Use CONCURRENTLY to avoid locking the table during index creation
-- NOTE: CONCURRENTLY cannot run inside a transaction, so this migration
-- should be applied with --skip-transactions flag in production:
--   prisma migrate deploy --skip-transactions
CREATE INDEX CONCURRENTLY IF NOT EXISTS "emails_unread_by_date_idx"
  ON "emails" ("tenantId", "receivedAt" DESC)
  WHERE "isRead" = false;

-- Add comment explaining the index purpose
COMMENT ON INDEX "emails_unread_by_date_idx" IS
  'PERF-04: Partial index for unread emails sorted by date. Covers ~20% of emails. Used by inbox list views. Created: 2026-02-02.';
