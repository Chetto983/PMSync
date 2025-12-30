-- Add isSystem field to folders table
-- This provides explicit system folder protection at the database level

-- Add the column with default value
ALTER TABLE "folders" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- Update existing system folders based on specialUse value
UPDATE "folders"
SET "isSystem" = true
WHERE "specialUse" IN (
  -- Core system folders (all providers)
  'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE', 'IMPORTANT', 'STARRED', 'OUTBOX',
  -- Aliases
  'JUNK', 'FLAGGED', 'DRAFT',
  -- Gmail system labels
  'UNREAD', 'MUTED', 'CHAT', 'ALL',
  -- Gmail categories
  'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'CATEGORY_PROMOTIONS',
  -- Gmail star variants
  'YELLOW_STAR', 'BLUE_STAR', 'GREEN_STAR', 'RED_STAR', 'ORANGE_STAR', 'PURPLE_STAR',
  -- Microsoft extended folders
  'CONVERSATIONHISTORY', 'CONVERSATION HISTORY', 'CLUTTER', 'SCHEDULED', 'NOTES', 'JOURNAL'
);

-- Create index for efficient queries
CREATE INDEX "folders_tenant_is_system_idx" ON "folders"("tenantId", "isSystem");
