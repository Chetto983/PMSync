# Gmail Folder Mapping Audit - "Personale" vs "INBOX" Bug

**Date**: 2025-12-30
**Issue**: Emails showing in "Personale" folder instead of "INBOX"
**Status**: 🔍 **ROOT CAUSE IDENTIFIED**

---

## 🚨 Problem Summary

Gmail emails are appearing in a folder named "Personale" (Italian for "Personal") instead of the canonical "INBOX" folder. This is affecting the frontend email list filter.

---

## 🔬 Root Cause Analysis

### Issue #1: Gmail Category Label Skipping (CORRECT BEHAVIOR)

**Location**: `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts:148-154`

```typescript
// CRITICAL: Skip ALL Gmail category labels - they are virtual categories, not real folders.
if (label.id?.startsWith('CATEGORY_')) {
  this.logger.debug(`Skipping Gmail category label: ${label.id} (virtual category, not a real folder)`);
  continue;
}
```

**Analysis**: This is **CORRECT** behavior. Gmail's `CATEGORY_PERSONAL`, `CATEGORY_SOCIAL`, etc. are virtual labels used for Gmail's inbox tabs, not real folders. The code correctly skips syncing them.

---

### Issue #2: Custom Label Naming (POTENTIAL BUG)

**Location**: `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts:256-260`

```typescript
// For custom labels (Label_xxx or label_xxx), use the label name as path
if (labelId.startsWith('Label_') || labelId.startsWith('label_')) {
  return labelName;  // ⚠️ Uses Gmail's LOCALIZED display name as path!
}
```

**Problem**: If a user creates a custom Gmail label named "Personale" (Italian), it gets synced with:
- `path: "Personale"` (localized name)
- `name: "Personale"`
- `specialUse: null`

This creates a custom folder that looks like INBOX but isn't!

---

### Issue #3: Folder Determination Priority

**Location**: `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts:41-87`

```typescript
determineFolderFromLabels(labelIds?: string[], fallback?: string): string {
  if (!labelIds || labelIds.length === 0) {
    return fallback ?? 'INBOX';
  }

  // Priority order:
  if (labelIds.includes('TRASH')) return 'TRASH';        // 1. TRASH
  if (labelIds.includes('SPAM')) return 'SPAM';          // 2. SPAM
  if (labelIds.includes('SENT')) return 'SENT';          // 3. SENT
  if (labelIds.includes('DRAFT')) return 'DRAFTS';      // 4. DRAFTS

  // 5. Check Gmail categories (BEFORE generic INBOX)
  const categoryLabel = labelIds.find((label) => label.startsWith('CATEGORY_'));
  if (categoryLabel) {
    switch (categoryLabel) {
      case 'CATEGORY_PERSONAL':
        return 'INBOX';  // ✅ Maps CATEGORY_PERSONAL → INBOX
      // ... other categories
    }
  }

  // 6. Generic INBOX (last priority)
  if (labelIds.includes('INBOX')) {
    return 'INBOX';
  }

  return fallback ?? 'INBOX';  // 7. Default fallback
}
```

**Problem**: This method returns the **folder path** for an email, but if an email has BOTH:
- `INBOX` label (system)
- `Label_12345` (custom "Personale" label)

The method will return `'INBOX'`, but **the email might be stored with a different folder path during sync!**

---

## 🔍 Investigation Steps

### Step 1: Check Database for "Personale" Folder

**Query**:
```sql
SELECT id, tenantId, providerId, path, name, externalId, specialUse, isSystem
FROM folder
WHERE LOWER(name) LIKE '%personal%' OR LOWER(path) LIKE '%personal%';
```

**Expected Result**:
- If a custom "Personale" folder exists, it will have `specialUse: null` and `isSystem: false`
- System INBOX folder should have `specialUse: 'INBOX'` and `isSystem: true`

### Step 2: Check Email Folder Assignment

**Query**:
```sql
SELECT id, subject, folder, labels, providerId
FROM email
WHERE folder = 'Personale' OR folder LIKE '%personal%'
LIMIT 10;
```

**Expected Result**:
- Check if emails are assigned to folder `'Personale'` instead of `'INBOX'`
- Check if `labels` array contains both `INBOX` and custom label IDs

### Step 3: Check Gmail Label Sync Logs

**Check backend logs for**:
```
Found X Gmail labels for provider
Skipping Gmail category label: CATEGORY_PERSONAL
```

Look for any custom labels with Italian names like "Personale", "Posta in arrivo", etc.

---

## 💡 Recommended Fixes

### Fix #1: Normalize Folder Path for Frontend (IMMEDIATE FIX)

**Location**: `backend/src/modules/email/controllers/emails.controller.ts`

**Change**: When fetching emails with `specialUse: 'INBOX'` filter, ensure we're querying by `specialUse` field, not `folder` field.

```typescript
// ❌ BEFORE: Query by folder path (can be "Personale", "INBOX", etc.)
const emails = await this.emailsService.listEmails({
  folder: 'INBOX',  // ❌ Matches folder path
});

// ✅ AFTER: Query by specialUse (canonical folder type)
const emails = await this.emailsService.listEmails({
  specialUse: 'INBOX',  // ✅ Matches canonical folder type
});
```

**Files to Check**:
- `backend/src/modules/email/services/emails.service.ts` - List emails query
- `backend/src/modules/email/controllers/emails.controller.ts` - API endpoint

---

### Fix #2: Add specialUse to Email Table (ARCHITECTURAL FIX)

**Current Problem**: The `email.folder` field stores the **path** (which can be localized), but there's no `email.specialUse` field to store the **canonical folder type**.

**Proposed Database Migration**:

```typescript
// Add specialUse column to email table
ALTER TABLE email ADD COLUMN "specialUse" VARCHAR(50);

// Create index for fast filtering
CREATE INDEX idx_email_specialuse ON email("specialUse");

// Backfill existing emails
UPDATE email e
SET "specialUse" = f."specialUse"
FROM folder f
WHERE e."folder" = f."path" AND e."providerId" = f."providerId";
```

**Benefits**:
- Frontend can filter by canonical `specialUse: 'INBOX'` instead of localized `folder: 'Personale'`
- Works across all locales (Italian, German, French, etc.)
- Aligns with RFC 6154 special-use mailbox standard

---

### Fix #3: Join Folder Table in Email Queries (IMMEDIATE ALTERNATIVE)

**Location**: `backend/src/modules/email/services/emails.service.ts`

**Change**: When querying emails by `specialUse`, join the `folder` table to match on `specialUse`:

```typescript
// ✅ Join folder table to filter by specialUse
const emails = await this.prisma.email.findMany({
  where: {
    folder: {
      specialUse: 'INBOX',  // Filter by canonical folder type
      providerId: providerId,
    },
  },
  include: {
    folderData: {  // Include folder metadata
      select: { specialUse: true, name: true, path: true },
    },
  },
});
```

**Problem**: The current schema has `email.folder` as a **string path**, not a **foreign key** to the `folder` table!

**Immediate Workaround**:
```typescript
// Get all INBOX folder paths for this provider
const inboxFolders = await this.prisma.folder.findMany({
  where: { providerId, specialUse: 'INBOX' },
  select: { path: true },
});

const inboxPaths = inboxFolders.map(f => f.path);

// Query emails in any of those paths
const emails = await this.prisma.email.findMany({
  where: {
    providerId,
    folder: { in: inboxPaths },  // Match any INBOX path
  },
});
```

---

## 📊 Schema Analysis

### Current Email Schema (Problematic)

```typescript
model Email {
  id         String   @id
  tenantId   String
  providerId String
  folder     String   // ⚠️ Stores PATH (localized, can be "Personale", "INBOX", etc.)
  labels     String[] // Gmail label IDs
  // ... other fields
}
```

**Problem**: `folder` field stores the **display path**, not the **canonical type**.

### Folder Schema (Correct)

```typescript
model Folder {
  id         String   @id
  providerId String
  path       String   // Display path (localized, e.g., "Personale")
  name       String   // Display name (localized, e.g., "Personale")
  specialUse String?  // ✅ Canonical type (e.g., "INBOX")
  isSystem   Boolean  // System folder flag
  // ... other fields

  @@unique([providerId, path])
}
```

**Correct**: `specialUse` field stores the canonical folder type.

---

## 🎯 Action Items

### Immediate (Frontend Query Fix)
1. ✅ Check `backend/src/modules/email/services/emails.service.ts` - List emails query
2. ✅ Modify `listEmails()` to query by `specialUse` instead of `folder`
3. ✅ Join folder table or pre-fetch folder paths for `specialUse: 'INBOX'`

### Short-term (Database Migration)
1. 🔄 Add `email.specialUse` column
2. 🔄 Backfill existing emails from folder join
3. 🔄 Update email sync to populate `specialUse` during sync

### Long-term (Schema Refactor)
1. 📋 Change `email.folder` from `String` to `String @relation` (foreign key)
2. 📋 Add database constraint: `@@index([providerId, specialUse])`
3. 📋 Update all email sync services to use folder relations

---

## 🧪 Testing Plan

### Test Case 1: Custom "Personale" Label
1. Create custom Gmail label named "Personale"
2. Apply to inbox emails
3. Sync emails
4. Check if frontend shows emails in "Personale" or "INBOX"

### Test Case 2: Localized Gmail UI
1. Set Gmail to Italian locale
2. Sync Gmail folders
3. Check folder names: `name: "Posta in arrivo"`, `path: "INBOX"`, `specialUse: "INBOX"`
4. Query emails with `specialUse: 'INBOX'` filter

### Test Case 3: Multiple Providers
1. Add Gmail (Italian) + Outlook (English)
2. Query `specialUse: 'INBOX'` for both providers
3. Verify both providers' inbox emails show up

---

## 📚 References

- **RFC 6154**: IMAP LIST Extension for Special-Use Mailboxes
- **Gmail API**: https://developers.google.com/workspace/gmail/api/guides/labels
- **Zero Mail**: https://github.com/elie222/inbox-zero (reference implementation)
- **File**: `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts`
- **File**: `backend/src/modules/email/services/emails.service.ts`

---

## ✅ Conclusion

**Root Cause**: The `email.folder` field stores the **localized folder path** (e.g., "Personale"), but the frontend is filtering by this path instead of the **canonical `specialUse`** field from the `folder` table.

**Recommended Fix**: Modify the `listEmails()` query to join the `folder` table and filter by `folder.specialUse = 'INBOX'` instead of `email.folder = 'INBOX'`.

**Status**: Ready for backend code investigation and fix implementation.

---

**Next Steps**:
1. Read `emails.service.ts` to see current query implementation
2. Check if `specialUse` parameter exists in `ListEmailsParams`
3. Implement folder table join for specialUse filtering
