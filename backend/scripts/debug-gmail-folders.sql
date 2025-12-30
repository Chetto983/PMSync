-- Debug Gmail Folder Mapping Issue
-- Run this query to find "Personale" folders and INBOX folders

-- 1. Check all folders with "personal" or "inbox" in name/path
SELECT
  id,
  "tenantId",
  "providerId",
  path,
  name,
  "externalId",
  "specialUse",
  "isSystem",
  "isSelectable",
  "totalCount",
  "unreadCount"
FROM folder
WHERE
  LOWER(name) LIKE '%personal%'
  OR LOWER(path) LIKE '%personal%'
  OR LOWER(name) = 'inbox'
  OR LOWER(path) = 'inbox'
  OR "specialUse" = 'INBOX'
ORDER BY "providerId", "specialUse", path;

-- 2. Check if there are multiple INBOX folders for same provider
SELECT
  "providerId",
  "specialUse",
  COUNT(*) as count,
  STRING_AGG(path, ', ') as paths,
  STRING_AGG(name, ', ') as names
FROM folder
WHERE "specialUse" = 'INBOX'
GROUP BY "providerId", "specialUse"
HAVING COUNT(*) > 1;

-- 3. Check custom labels that might be named "Personale"
SELECT
  id,
  "tenantId",
  "providerId",
  path,
  name,
  "externalId",
  "specialUse",
  "isSystem"
FROM folder
WHERE
  (LOWER(name) = 'personale' OR LOWER(path) = 'personale')
  AND ("specialUse" IS NULL OR "specialUse" != 'INBOX');

-- 4. Check all Gmail category labels (should be skipped)
SELECT
  id,
  path,
  name,
  "externalId",
  "specialUse"
FROM folder
WHERE "externalId" LIKE 'CATEGORY_%';

-- 5. Check email assignments to "Personale" folder
SELECT
  COUNT(*) as email_count,
  folder,
  "providerId"
FROM email
WHERE LOWER(folder) LIKE '%personal%'
GROUP BY folder, "providerId";
