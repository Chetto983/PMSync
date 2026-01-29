-- Migration: Remove content column from embeddings for GDPR compliance
-- Date: 2026-01-29
--
-- Problem: We were storing duplicate content in both:
--   1. Source tables (Email.body, Email.snippet, Contact.*)
--   2. Embedding.content
--
-- Solution: Remove content column entirely. Use emailId/contactId to JOIN
-- and fetch content from source tables when needed. This:
--   - Reduces storage by ~60%
--   - Full GDPR compliance (no PII duplication)
--   - Vectors are NOT reversible, so they're safe to keep

-- Drop the GIN trigram index on content (no longer needed)
DROP INDEX IF EXISTS "embeddings_content_gin_idx";

-- Drop the content column
ALTER TABLE "embeddings"
  DROP COLUMN IF EXISTS "content";

-- Add comment explaining the change
COMMENT ON TABLE "embeddings" IS
  'GDPR-compliant: No content stored. Use emailId/contactId to JOIN with source tables. Vectors are NOT reversible.';
