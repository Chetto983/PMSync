-- Migration: Add tsvector GENERATED STORED columns + GIN indexes
-- Purpose: Full-text search for hybrid RAG (vector + keyword) search
-- Config: 'simple' tsvector configuration for bilingual EN/IT support
-- Phase 25 Plan 03: Hybrid Search & RAG
--
-- NOTE: These are manual SQL migrations. Prisma does not model tsvector
-- columns or SQL functions. schema.prisma remains unchanged.
-- Apply manually: psql -f migration.sql

-- =============================================================
-- 1. emails table: FTS on subject + bodyText (truncated) + from
-- =============================================================
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "fts" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce("subject", '') || ' ' ||
      coalesce(LEFT("bodyText", 5000), '') || ' ' ||
      coalesce("from", '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "emails_fts_gin_idx"
  ON "emails" USING gin("fts");

-- =============================================================
-- 2. unified_contacts table: FTS on displayName + company + jobTitle + notes
-- =============================================================
ALTER TABLE "unified_contacts" ADD COLUMN IF NOT EXISTS "fts" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce("displayName", '') || ' ' ||
      coalesce("company", '') || ' ' ||
      coalesce("jobTitle", '') || ' ' ||
      coalesce("notes", '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "contacts_fts_gin_idx"
  ON "unified_contacts" USING gin("fts");

-- =============================================================
-- 3. calendar_events table: FTS on title + description + location
-- =============================================================
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "fts" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce("title", '') || ' ' ||
      coalesce("description", '') || ' ' ||
      coalesce("location", '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS "calendar_events_fts_gin_idx"
  ON "calendar_events" USING gin("fts");
