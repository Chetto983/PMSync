-- Migration: Fix Gmail CATEGORY_PERSONAL folder mapping
-- This migrates existing data from PERSONAL/Personale to INBOX

-- Step 1: Get your Gmail provider ID
-- Run this first:
SELECT id, email, type FROM email_provider WHERE type = 'GMAIL';

-- Step 2: Replace <GMAIL_PROVIDER_ID> below with the actual ID

-- ============================================
-- FIX 1: Update emails with folder='PERSONAL' to folder='INBOX'
-- ============================================
UPDATE email
SET folder = 'INBOX'
WHERE "providerId" = '<GMAIL_PROVIDER_ID>'
  AND folder IN ('PERSONAL', 'Personale', 'Personal');

-- Verify
SELECT folder, COUNT(*) as count
FROM email
WHERE "providerId" = '<GMAIL_PROVIDER_ID>'
  AND "isDeleted" = false
GROUP BY folder;

-- ============================================
-- FIX 2: Delete phantom PERSONAL/Personale folders
-- ============================================
DELETE FROM folder
WHERE "providerId" = '<GMAIL_PROVIDER_ID>'
  AND (
    path IN ('PERSONAL', 'Personale', 'Personal')
    OR name IN ('PERSONAL', 'Personale', 'Personal')
  )
  AND "specialUse" != 'INBOX';  -- Don't delete real INBOX

-- ============================================
-- FIX 3: Update INBOX folder counts
-- ============================================
UPDATE folder
SET
  "totalCount" = (
    SELECT COUNT(*)
    FROM email
    WHERE email."providerId" = folder."providerId"
      AND email.folder = 'INBOX'
      AND email."isDeleted" = false
  ),
  "unreadCount" = (
    SELECT COUNT(*)
    FROM email
    WHERE email."providerId" = folder."providerId"
      AND email.folder = 'INBOX'
      AND email."isDeleted" = false
      AND email."isRead" = false
  ),
  "updatedAt" = NOW()
WHERE "providerId" = '<GMAIL_PROVIDER_ID>'
  AND (path = 'INBOX' OR "specialUse" = 'INBOX');

-- ============================================
-- VERIFY RESULTS
-- ============================================

-- Should show all emails in INBOX now
SELECT folder, COUNT(*) as email_count
FROM email
WHERE "providerId" = '<GMAIL_PROVIDER_ID>'
  AND "isDeleted" = false
GROUP BY folder
ORDER BY email_count DESC;

-- Should show INBOX folder with correct counts
SELECT
  id,
  path,
  name,
  "specialUse",
  "totalCount",
  "unreadCount"
FROM folder
WHERE "providerId" = '<GMAIL_PROVIDER_ID>'
  AND (
    "specialUse" = 'INBOX'
    OR path = 'INBOX'
    OR name LIKE '%nbox%'
    OR name LIKE '%osta%'
  );

-- Should return ZERO rows (no phantom folders)
SELECT id, path, name, "specialUse"
FROM folder
WHERE "providerId" = '<GMAIL_PROVIDER_ID>'
  AND (
    path IN ('PERSONAL', 'Personale', 'Personal')
    OR name IN ('PERSONAL', 'Personale', 'Personal')
  );
