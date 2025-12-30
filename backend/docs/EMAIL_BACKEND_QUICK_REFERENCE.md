# Email Backend Quick Reference

**Purpose**: Fast lookup guide for developers working on email backend
**Date**: 2025-12-30

---

## File Map

### Core Email Module (`modules/email/`)

| File | Purpose | Key Methods |
|------|---------|-------------|
| `services/emails.service.ts` | Business logic for email CRUD | `listEmails()`, `getEmailById()`, `updateEmail()`, `deleteEmail()` |
| `controllers/emails.controller.ts` | REST API endpoints | `GET /emails`, `GET /emails/:id`, `PATCH /emails/:id` |
| `services/folder-lookup.service.ts` | Folder path resolution | `getFolderPathsBySpecialUse()` |
| `email.helpers.ts` | Utility functions | `isJunkFolder()`, `normalizeFolderName()` |

### Email Sync Module (`modules/email-sync/`)

| File | Purpose | Key Methods |
|------|---------|-------------|
| `workers/sync.worker.ts` | Background email sync orchestration | `processJob()`, `applyAllPostSyncUpdates()` |
| `services/base-email-sync.service.ts` | Abstract base for provider sync | `syncProvider()`, `syncFullWithDriver()` |
| `services/gmail/google-sync.service.ts` | Gmail sync implementation | `syncProvider()`, `getDriverCredentials()` |
| `services/gmail/gmail-folder.service.ts` | Gmail folder/label sync | `syncGmailFolders()`, `determineFolderFromLabels()` |
| `drivers/google/google.driver.ts` | Gmail API abstraction | `listMessages()`, `getMessage()`, `determineFolderFromLabels()` |
| `drivers/interfaces/canonical.types.ts` | Cross-provider type definitions | `GMAIL_TO_CANONICAL`, `CanonicalMessage` |

---

## Database Schema

### Email Table

```sql
CREATE TABLE email (
  id VARCHAR(255) PRIMARY KEY,
  tenantId VARCHAR(255) NOT NULL,
  providerId VARCHAR(255) NOT NULL,
  folder VARCHAR(255) DEFAULT 'INBOX',  -- ⚠️ String, not FK!
  externalId VARCHAR(255) NOT NULL,
  threadId VARCHAR(255),
  from VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,
  bodyText TEXT,
  bodyHtml TEXT,
  isRead BOOLEAN DEFAULT false,
  isStarred BOOLEAN DEFAULT false,
  isFlagged BOOLEAN DEFAULT false,
  isDraft BOOLEAN DEFAULT false,
  isDeleted BOOLEAN DEFAULT false,
  receivedAt TIMESTAMP NOT NULL,
  sentAt TIMESTAMP NOT NULL,
  -- ...
  CONSTRAINT email_provider_external UNIQUE (providerId, externalId)
);

CREATE INDEX idx_email_folder ON email(providerId, folder);
CREATE INDEX idx_email_tenant ON email(tenantId);
```

### Folder Table

```sql
CREATE TABLE folder (
  id VARCHAR(255) PRIMARY KEY,
  tenantId VARCHAR(255) NOT NULL,
  providerId VARCHAR(255) NOT NULL,
  path VARCHAR(255) NOT NULL,              -- Canonical path (e.g., "INBOX")
  name VARCHAR(255) NOT NULL,              -- Display name (e.g., "Posta in arrivo")
  externalId VARCHAR(255),                 -- Gmail label ID
  specialUse VARCHAR(50),                  -- RFC 6154 type (e.g., "INBOX")
  isSystem BOOLEAN DEFAULT false,
  isSelectable BOOLEAN DEFAULT true,
  delimiter VARCHAR(10) DEFAULT '/',
  totalCount INTEGER DEFAULT 0,
  unreadCount INTEGER DEFAULT 0,
  lastSyncedAt TIMESTAMP,
  -- ...
  CONSTRAINT folder_provider_path UNIQUE (providerId, path)
);

CREATE INDEX idx_folder_specialuse ON folder(providerId, specialUse);
```

---

## Key Concepts

### Canonical Types

**Purpose**: Normalize folder types across Gmail/Outlook/IMAP

| Gmail Label ID | Gmail Display | Canonical Type | Folder Path |
|---------------|---------------|----------------|-------------|
| `INBOX` | "Posta in arrivo" | `INBOX` | `INBOX` |
| `SENT` | "Inviata" | `SENT` | `SENT` |
| `DRAFT` | "Bozze" | `DRAFTS` | `DRAFTS` |
| `TRASH` | "Cestino" | `TRASH` | `TRASH` |
| `SPAM` | "Spam" | `SPAM` | `SPAM` |
| `CATEGORY_PERSONAL` | "Primary" | ⚠️ `PERSONAL` or `INBOX`? | `INBOX` |
| `CATEGORY_SOCIAL` | "Social" | `SOCIAL` | `SOCIAL` |
| `Label_12345` | "Work" | `Work` | `Work` |

### Folder Fields Explained

- **path**: Canonical identifier used in joins (e.g., `"INBOX"`)
- **name**: Localized display name (e.g., `"Posta in arrivo"`)
- **specialUse**: RFC 6154 folder type (e.g., `"INBOX"`, `"SENT"`)
- **externalId**: Provider's label/folder ID (e.g., Gmail `"INBOX"`)
- **isSystem**: Cannot be deleted by user

### Email-Folder Relationship

```typescript
// ⚠️ Current implementation (string-based)
email.folder = "INBOX"  // String
folder.path = "INBOX"   // String
// Join: WHERE email.folder = folder.path

// ✅ Recommended (foreign key)
email.folderId = "abc123"  // FK to folder.id
folder.id = "abc123"       // PK
// Join: WHERE email.folderId = folder.id
```

---

## Common Queries

### Get Emails by Folder Type (specialUse)

```typescript
// Step 1: Get folder paths for specialUse
const folders = await prisma.folder.findMany({
  where: {
    tenantId,
    providerId,
    specialUse: { equals: 'INBOX', mode: 'insensitive' }
  },
  select: { path: true, name: true }
});

const folderPaths = new Set<string>();
folders.forEach(f => {
  if (f.path) folderPaths.add(f.path);
  if (f.name) folderPaths.add(f.name);
});

// Step 2: Query emails
const emails = await prisma.email.findMany({
  where: {
    tenantId,
    providerId,
    folder: { in: Array.from(folderPaths), mode: 'insensitive' },
    isDeleted: false
  },
  orderBy: { receivedAt: 'desc' }
});
```

### Update Folder Counts

```sql
-- ✅ CORRECT (after fix)
UPDATE folders
SET
  "totalCount" = (
    SELECT COUNT(*)
    FROM emails
    WHERE emails."providerId" = folders."providerId"
      AND emails.folder = folders.path  -- ✅ Join on path
      AND emails."isDeleted" = false
  ),
  "unreadCount" = (
    SELECT COUNT(*)
    FROM emails
    WHERE emails."providerId" = folders."providerId"
      AND emails.folder = folders.path
      AND emails."isDeleted" = false
      AND emails."isRead" = false
  )
WHERE folders."providerId" = 'abc123';
```

### Find Orphaned Emails

```sql
-- Emails with folder path not in folders table
SELECT e.id, e.subject, e.folder
FROM emails e
LEFT JOIN folders f ON
  e."providerId" = f."providerId"
  AND e.folder = f.path
WHERE f.id IS NULL
  AND e."isDeleted" = false;
```

---

## Gmail-Specific Behavior

### Label Priority Order (determineFolderFromLabels)

When Gmail email has multiple labels, folder is determined by this priority:

1. `TRASH` → `'TRASH'`
2. `SPAM` → `'SPAM'`
3. `SENT` → `'SENT'`
4. `DRAFT` → `'DRAFTS'`
5. `CATEGORY_PERSONAL` → `'INBOX'` ⚠️
6. `CATEGORY_SOCIAL` → `'SOCIAL'`
7. `CATEGORY_PROMOTIONS` → `'PROMOTIONS'`
8. `INBOX` → `'INBOX'`
9. Default → `'INBOX'`

**Example**:
```typescript
labelIds = ['INBOX', 'CATEGORY_PERSONAL', 'Label_Work']
determineFolderFromLabels(labelIds) // → 'INBOX' (step 5)
```

### Category Labels Handling

| Label | Folder Sync | Email Sync | Recommended |
|-------|-------------|------------|-------------|
| `CATEGORY_PERSONAL` | Skipped ❌ | Maps to `INBOX` ✅ | Align to `INBOX` |
| `CATEGORY_SOCIAL` | Skipped ❌ | Maps to `SOCIAL` ✅ | Sync as folder |
| `CATEGORY_PROMOTIONS` | Skipped ❌ | Maps to `PROMOTIONS` ✅ | Sync as folder |

**Why skipped?**
- Gmail categories are "virtual" inbox tabs, not real folders
- Cannot be deleted via API
- Based on Zero/Mail-0 pattern

**Issue**: Inconsistency between folder sync and email sync.

---

## Common Bugs & Fixes

### Bug 1: Folder Count Always 0 ✅ FIXED

**Symptom**: INBOX shows 0 emails despite having emails

**Root Cause**: Worker SQL joined `email.folder = folder.name`
- `email.folder = "INBOX"` (canonical)
- `folder.name = "Posta in arrivo"` (localized)
- `"INBOX" ≠ "Posta in arrivo"` → Count = 0

**Fix**: Change to `email.folder = folder.path`

**File**: `backend/src/modules/email-sync/workers/sync.worker.ts:365-385`

### Bug 2: CATEGORY_PERSONAL Inconsistency ❌ OPEN

**Symptom**: Confusion about where Personal emails go

**Root Cause**: Three definitions:
1. Canonical types: `CATEGORY_PERSONAL → 'PERSONAL'`
2. Driver: `CATEGORY_PERSONAL → 'INBOX'`
3. Folder sync: Skips `CATEGORY_PERSONAL`

**Recommended Fix**: Change canonical.types.ts line 80:
```typescript
'CATEGORY_PERSONAL': 'INBOX',  // Change from 'PERSONAL'
```

### Bug 3: Orphaned Emails on Folder Deletion ❌ OPEN

**Symptom**: Emails disappear when custom label deleted in Gmail

**Root Cause**: No foreign key constraint, no cascade delete

**Recommended Fix**: Before deleting folder, move emails to INBOX:
```typescript
await prisma.email.updateMany({
  where: { providerId, folder: deletedPath },
  data: { folder: 'INBOX' }
});
```

---

## Performance Tips

### Cache Folder Paths by specialUse

```typescript
// ❌ SLOW: Query every time
const paths = await getFolderPathsBySpecialUse(tenantId, 'INBOX');

// ✅ FAST: Cache in Redis
const cacheKey = `folders:${providerId}:specialUse:INBOX`;
let paths = await redis.get(cacheKey);
if (!paths) {
  paths = await getFolderPathsBySpecialUse(tenantId, 'INBOX');
  await redis.setex(cacheKey, 300, JSON.stringify(paths)); // 5min TTL
}
```

### Update Only Affected Folders

```typescript
// ❌ SLOW: Update all folders
UPDATE folders SET totalCount = ... WHERE providerId = 'abc';

// ✅ FAST: Track and update only affected
const affectedFolders = new Set(['INBOX', 'SENT']);
UPDATE folders SET totalCount = ...
WHERE providerId = 'abc' AND path IN ('INBOX', 'SENT');
```

### Use Composite Indexes

```sql
-- For email queries by folder + flags
CREATE INDEX idx_email_folder_flags
ON email(providerId, folder, isRead, isDeleted);

-- For folder queries by specialUse
CREATE INDEX idx_folder_specialuse
ON folder(providerId, specialUse)
WHERE specialUse IS NOT NULL;
```

---

## Debugging Queries

### Check Folder Configuration

```sql
-- View all folders for a provider
SELECT
  path,
  name,
  externalId,
  specialUse,
  isSystem,
  totalCount,
  unreadCount
FROM folder
WHERE providerId = '<provider-id>'
ORDER BY specialUse, path;
```

### Verify Email-Folder Join

```sql
-- Check if emails match folders correctly
SELECT
  f.path as folder_path,
  f.name as folder_name,
  f.specialUse,
  COUNT(e.id) as email_count,
  f.totalCount as reported_count,
  (f.totalCount - COUNT(e.id)) as discrepancy
FROM folder f
LEFT JOIN email e ON
  e.providerId = f.providerId
  AND e.folder = f.path  -- ✅ Correct join
  AND e.isDeleted = false
WHERE f.providerId = '<provider-id>'
GROUP BY f.id, f.path, f.name, f.specialUse, f.totalCount
HAVING (f.totalCount - COUNT(e.id)) != 0
ORDER BY discrepancy DESC;
```

### Find Category Labels (Should Be Empty)

```sql
-- Check if any CATEGORY_ labels were synced (should be 0)
SELECT *
FROM folder
WHERE externalId LIKE 'CATEGORY_%';
```

### Check Email Folder Distribution

```sql
-- See which folders have emails
SELECT
  folder,
  COUNT(*) as email_count,
  SUM(CASE WHEN isRead = false THEN 1 ELSE 0 END) as unread_count
FROM email
WHERE providerId = '<provider-id>'
  AND isDeleted = false
GROUP BY folder
ORDER BY email_count DESC;
```

---

## Worker Configuration

### Queue Setup (BullMQ)

```typescript
// Three priority queues
QUEUE_NAMES = {
  EMAIL_SYNC_HIGH: 'email-sync-high',      // Concurrency: 17
  EMAIL_SYNC_NORMAL: 'email-sync-normal',  // Concurrency: 10
  EMAIL_SYNC_LOW: 'email-sync-low'         // Concurrency: 7
};
```

### Folder Sync Lock (Redis)

```typescript
// Distributed lock to prevent race conditions
const lockKey = `folder-sync:${providerId}`;
const lockTtl = 30000; // 30 seconds

await redisLock.withLock(
  lockKey,
  lockTtl,
  async () => {
    await folderSyncService.syncProviderFolders(tenantId, providerId);
  },
  { maxRetries: 3 }
);
```

---

## Testing Checklist

### Unit Tests

- [ ] `labelIdToFolderPath()` maps categories correctly
- [ ] `determineFolderFromLabels()` respects priority order
- [ ] Folder deletion moves emails to INBOX
- [ ] Custom labels don't conflict with system folders

### Integration Tests

- [ ] Full sync creates folders and emails
- [ ] Incremental sync updates existing emails
- [ ] Folder counts match actual email counts
- [ ] CATEGORY_PERSONAL emails appear in INBOX
- [ ] Localized folder names display correctly

### Manual Tests

1. Create custom Gmail label "Personale"
2. Apply to inbox emails
3. Sync emails
4. Verify emails show in INBOX, not "Personale"
5. Delete custom label in Gmail
6. Sync again
7. Verify emails moved to INBOX (not orphaned)

---

## Quick Fixes Reference

### Fix Orphaned Emails

```sql
-- Move emails with invalid folder paths to INBOX
UPDATE email
SET folder = 'INBOX'
WHERE id IN (
  SELECT e.id
  FROM email e
  LEFT JOIN folder f ON
    e.providerId = f.providerId
    AND e.folder = f.path
  WHERE f.id IS NULL
    AND e.isDeleted = false
);
```

### Recalculate All Folder Counts

```sql
-- Manually trigger folder count update
UPDATE folder f
SET
  totalCount = (
    SELECT COUNT(*)
    FROM email e
    WHERE e.providerId = f.providerId
      AND e.folder = f.path
      AND e.isDeleted = false
  ),
  unreadCount = (
    SELECT COUNT(*)
    FROM email e
    WHERE e.providerId = f.providerId
      AND e.folder = f.path
      AND e.isDeleted = false
      AND e.isRead = false
  );
```

### Force Full Resync

```typescript
// Clear last sync token to trigger full sync
await prisma.providerConfig.update({
  where: { id: providerId },
  data: {
    metadata: { lastSyncToken: null }
  }
});

// Trigger sync job
await syncScheduler.scheduleSyncJob({
  providerId,
  syncType: 'full',
  priority: 'high'
});
```

---

## Environment Variables

```bash
# Sync configuration
SYNC_BATCH_SIZE=100
GMAIL_BATCH_GET_SIZE=100
FULL_SYNC_MAX_MESSAGES=200

# Worker configuration
EMAIL_SYNC_WORKERS_ENABLED=true
SYNC_WORKER_LOCK_MS=900000          # 15 min
SYNC_WORKER_STALLED_INTERVAL_MS=120000  # 2 min

# Timeouts
SYNC_OPERATION_TIMEOUT_MS=600000    # 10 min
FOLDER_SYNC_TIMEOUT_MS=60000        # 60 sec

# Retry configuration
RETRY_MAX_ATTEMPTS=3
RETRY_429_DELAY_MS=2000
RETRY_5XX_DELAY_MS=2000
```

---

## Key Contacts & References

### Documentation
- [RFC 6154](https://www.rfc-editor.org/rfc/rfc6154.html) - IMAP Special-Use Mailboxes
- [Gmail API Labels](https://developers.google.com/workspace/gmail/api/guides/labels)
- [Inbox Zero Reference](https://github.com/elie222/inbox-zero)

### Audit Documents
- [EMAIL_BACKEND_COMPREHENSIVE_AUDIT.md](./EMAIL_BACKEND_COMPREHENSIVE_AUDIT.md) - Full analysis
- [EMAIL_BACKEND_DATA_FLOW.md](./EMAIL_BACKEND_DATA_FLOW.md) - Architecture diagrams
- [GMAIL_WORKER_BUG_ANALYSIS.md](./GMAIL_WORKER_BUG_ANALYSIS.md) - Bug investigation
- [GMAIL_FOLDER_BUG_FIX_TESTING.md](./GMAIL_FOLDER_BUG_FIX_TESTING.md) - Testing guide

---

**Last Updated**: 2025-12-30
**Maintained By**: Backend Team
