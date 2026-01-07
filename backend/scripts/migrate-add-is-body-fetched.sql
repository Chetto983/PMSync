-- Migration: Add isBodyFetched column to emails table
-- Purpose: HYBRID SYNC - Track which emails have had body fetched
-- Run: psql -d mailagent -f scripts/migrate-add-is-body-fetched.sql

-- Add column if not exists
ALTER TABLE emails
ADD COLUMN IF NOT EXISTS "isBodyFetched" BOOLEAN NOT NULL DEFAULT false;

-- Create index for efficient lazy-fetch queries
CREATE INDEX IF NOT EXISTS "emails_tenantId_isBodyFetched_idx"
ON emails ("tenantId", "isBodyFetched");

-- Backfill: Set isBodyFetched=true for emails that already have body content
UPDATE emails
SET "isBodyFetched" = true
WHERE "bodyText" IS NOT NULL AND LENGTH("bodyText") > 0;

-- Report results
SELECT
  COUNT(*) FILTER (WHERE "isBodyFetched" = true) as "with_body",
  COUNT(*) FILTER (WHERE "isBodyFetched" = false) as "metadata_only",
  COUNT(*) as total
FROM emails;
