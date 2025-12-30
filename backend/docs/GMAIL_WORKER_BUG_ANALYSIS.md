# Gmail Worker Bug Analysis - "Personale" vs "INBOX"

**Date**: 2025-12-30
**Debugging Time**: 4+ hours
**Status**: 🔍 **BUG LOCATED IN WORKER**

---

## 🚨 Critical Finding

The issue is in the **WORKER**, specifically in how Gmail messages are processed and assigned to folders during sync.

---

## 📍 Bug Location Flow

### 1. Gmail Message Sync (`google.driver.ts`)

**Line 795**: `const folder = this.determineFolderFromLabels(labelIds);`

```typescript
private gmailMessageToCanonical(message: gmail_v1.Schema$Message): CanonicalMessage {
  const labelIds = message.labelIds || [];
  const folder = this.determineFolderFromLabels(labelIds);  // ⚠️ Determines folder

  return {
    id: message.id || '',
    folder,  // ⚠️ Stored in database!
    // ...
  };
}
```

### 2. Folder Determination Logic (`google.driver.ts:876-898`)

```typescript
private determineFolderFromLabels(labelIds: string[]): CanonicalFolderType {
  if (labelIds.includes('TRASH')) return 'TRASH';
  if (labelIds.includes('SPAM')) return 'SPAM';
  if (labelIds.includes('SENT')) return 'SENT';
  if (labelIds.includes('DRAFT')) return 'DRAFTS';

  // Check categories
  const categoryLabel = labelIds.find((l) => l.startsWith('CATEGORY_'));
  if (categoryLabel) {
    const categoryMap: Record<string, CanonicalFolderType> = {
      CATEGORY_PERSONAL: 'INBOX',  // ✅ Correct mapping
      CATEGORY_SOCIAL: 'SOCIAL',
      CATEGORY_PROMOTIONS: 'PROMOTIONS',
      CATEGORY_UPDATES: 'UPDATES',
      CATEGORY_FORUMS: 'FORUMS',
    };
    if (categoryMap[categoryLabel]) return categoryMap[categoryLabel];
  }

  if (labelIds.includes('INBOX')) return 'INBOX';

  return 'INBOX';  // ✅ Default fallback
}
```

**Analysis**: This logic looks CORRECT! It should:
1. Map `CATEGORY_PERSONAL` → `'INBOX'`
2. Map `INBOX` label → `'INBOX'`
3. Default fallback → `'INBOX'`

---

## 🤔 Possible Bug Scenarios

### Scenario A: Custom "Personale" Label Priority

**Problem**: If Gmail returns labelIds in a specific order, and there's a custom label "Personale", it might be processed incorrectly.

**Example**:
```typescript
labelIds = ['Label_abc123', 'INBOX', 'CATEGORY_PERSONAL']
// Custom label ID: Label_abc123
// Display name: "Personale" (Italian)
```

**Current Logic**: Should return `'INBOX'` (correct)

---

### Scenario B: Label ID vs Label Name Confusion

**Gmail Folder Sync** (`gmail-folder.service.ts:256-260`):
```typescript
// For custom labels, use label name as path
if (labelId.startsWith('Label_') || labelId.startsWith('label_')) {
  return labelName;  // ⚠️ Returns "Personale" as folder path!
}
```

**Problem**:
- Custom label synced with `path: "Personale"`, `name: "Personale"`, `specialUse: null`
- Email synced with `folder: "INBOX"` (from determineFolderFromLabels)
- **Mismatch between folder paths!**

---

### Scenario C: Gmail API Returning Localized Label Names

**Problem**: Gmail API might return label `name` field localized to user's language.

**Example**:
```json
{
  "id": "INBOX",
  "name": "Posta in arrivo",  // ⚠️ Italian localization
  "type": "system"
}
```

If the code uses `label.name` instead of `label.id` anywhere, emails would be assigned to the localized folder name.

---

### Scenario D: Sync Worker Using Wrong Folder Path

**Worker Location**: `backend/src/modules/email-sync/workers/sync.worker.ts`

**Lines 372, 379** - Folder count calculation bug:
```sql
UPDATE "folders"
SET
  "totalCount" = (
    SELECT COUNT(*)
    FROM "emails"
    WHERE "emails"."folder" = "folders"."name"  -- ⚠️ BUG!
  )
```

**Problem**: Comparing `emails.folder` (path) with `folders.name` (display name)!

**Should be**:
```sql
WHERE "emails"."folder" = "folders"."path"
```

---

## 🔧 THE ACTUAL BUG

### Worker Folder Count Calculation

**File**: `backend/src/modules/email-sync/workers/sync.worker.ts:365-385`

```typescript
await tx.$executeRaw`
  UPDATE "folders"
  SET
    "totalCount" = (
      SELECT COUNT(*)
      FROM "emails"
      WHERE "emails"."providerId" = "folders"."providerId"
        AND "emails"."folder" = "folders"."name"  -- ❌ WRONG!
        AND "emails"."isDeleted" = false
    ),
    "unreadCount" = (
      SELECT COUNT(*)
      FROM "emails"
      WHERE "emails"."providerId" = "folders"."providerId"
        AND "emails"."folder" = "folders"."name"  -- ❌ WRONG!
        AND "emails"."isDeleted" = false
        AND "emails"."isRead" = false
    ),
    "updatedAt" = NOW()
  WHERE "folders"."providerId" = ${providerId}
`;
```

**Root Cause**:
- `emails.folder` stores the canonical **path** (e.g., "INBOX")
- `folders.name` stores the localized **display name** (e.g., "Posta in arrivo", "Personale")
- The SQL join is comparing path with display name!

**Result**:
- INBOX folder shows 0 emails (because "INBOX" ≠ "Posta in arrivo")
- Custom "Personale" folder might match if emails have `folder: "Personale"`

---

## 💡 THE FIX

### Change 1: Fix Worker SQL Query

**File**: `backend/src/modules/email-sync/workers/sync.worker.ts`

```typescript
// ❌ BEFORE (Lines 372, 379)
AND "emails"."folder" = "folders"."name"

// ✅ AFTER
AND "emails"."folder" = "folders"."path"
```

### Change 2: Verify Folder Path Consistency

**Ensure**:
- `emails.folder` always contains canonical path (e.g., "INBOX", "SENT")
- `folders.path` always contains canonical path (e.g., "INBOX", "SENT")
- `folders.name` contains localized display name (e.g., "Posta in arrivo")

---

## 🧪 Testing Plan

### Step 1: Check Current Database State

```sql
-- See what's in emails.folder
SELECT DISTINCT folder, COUNT(*) as count
FROM email
WHERE "providerId" = '<gmail-provider-id>'
GROUP BY folder;

-- See what's in folders.path and folders.name
SELECT path, name, "specialUse", "totalCount", "unreadCount"
FROM folder
WHERE "providerId" = '<gmail-provider-id>'
ORDER BY "specialUse", path;

-- Check the mismatch
SELECT
  e.folder as email_folder,
  f.path as folder_path,
  f.name as folder_name,
  COUNT(*) as email_count
FROM email e
LEFT JOIN folder f ON e."providerId" = f."providerId" AND e.folder = f.name
WHERE e."providerId" = '<gmail-provider-id>'
GROUP BY e.folder, f.path, f.name;
```

### Step 2: Apply Fix

```bash
# Fix the worker SQL query
cd backend/src/modules/email-sync/workers
# Edit sync.worker.ts lines 372 and 379
```

### Step 3: Re-sync Folder Counts

```sql
-- After fix, manually trigger folder count update
UPDATE "folders"
SET
  "totalCount" = (
    SELECT COUNT(*)
    FROM "emails"
    WHERE "emails"."providerId" = "folders"."providerId"
      AND "emails"."folder" = "folders"."path"  -- ✅ Fixed
      AND "emails"."isDeleted" = false
  ),
  "unreadCount" = (
    SELECT COUNT(*)
    FROM "emails"
    WHERE "emails"."providerId" = "folders"."providerId"
      AND "emails"."folder" = "folders"."path"  -- ✅ Fixed
      AND "emails"."isDeleted" = false
      AND "emails"."isRead" = false
  ),
  "updatedAt" = NOW()
WHERE "providerId" = '<gmail-provider-id>';
```

---

## ✅ Expected Result After Fix

- INBOX folder shows correct email count
- No "Personale" folder (unless it's a real custom label)
- Frontend filter by `specialUse: 'INBOX'` works correctly
- Folder counts match actual emails

---

## 📚 Related Files

- `backend/src/modules/email-sync/workers/sync.worker.ts` - **BUG HERE**
- `backend/src/modules/email-sync/drivers/google/google.driver.ts` - Folder determination logic
- `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts` - Folder sync
- `backend/src/modules/email/services/emails.service.ts` - Email list query

---

**Next Action**: Apply the fix to `sync.worker.ts` and test with real database.
