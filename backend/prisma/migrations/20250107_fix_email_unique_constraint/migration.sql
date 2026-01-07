-- Fix Email Unique Constraint: Remove folder from unique key
-- Problem: When email moves folders (e.g., INBOX -> TRASH), sync creates duplicate
--          because lookup by (providerId, externalId, folder) fails
-- Solution: Use (providerId, externalId) only - externalId is globally unique per provider

-- Step 1: Delete duplicates, keeping the oldest by createdAt
-- This handles emails that exist in multiple folders (original + TRASH)
DELETE FROM emails
WHERE id NOT IN (
  SELECT MIN(id)
  FROM emails
  WHERE "externalId" IS NOT NULL
  GROUP BY "providerId", "externalId"
)
AND "externalId" IN (
  SELECT "externalId"
  FROM emails
  WHERE "externalId" IS NOT NULL
  GROUP BY "providerId", "externalId"
  HAVING COUNT(*) > 1
);

-- Step 2: Drop the old composite unique constraint that includes folder
DROP INDEX IF EXISTS "emails_providerId_externalId_folder_key";

-- Step 3: Create new unique constraint without folder
CREATE UNIQUE INDEX "emails_providerId_externalId_key"
  ON emails ("providerId", "externalId")
  WHERE "externalId" IS NOT NULL;

-- Note: We use a partial unique index (WHERE externalId IS NOT NULL)
-- because some emails may have NULL externalId during initial sync
