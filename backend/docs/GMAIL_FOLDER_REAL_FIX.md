# Gmail Folder Bug - THE REAL FIX

**Date**: 2025-12-30
**Status**: ✅ **FIXED** - Requires backend restart + full sync

---

## 🔴 The REAL Bug

The bug was **NOT** in the worker SQL query (though that was also wrong).

The **REAL** bug was an **inconsistent canonical mapping** between:
1. `canonical.types.ts` GMAIL_TO_CANONICAL mapping
2. `google.driver.ts` determineFolderFromLabels() logic

---

## 🐛 Root Cause Analysis

### Inconsistency #1: Canonical Mapping (THE REAL BUG)

**File**: [canonical.types.ts:80](backend/src/modules/email-sync/drivers/interfaces/canonical.types.ts#L80)

```typescript
// ❌ BEFORE (Line 80): Maps to 'PERSONAL'
export const GMAIL_TO_CANONICAL: Record<string, CanonicalFolderType> = {
  'CATEGORY_PERSONAL': 'PERSONAL',  // ❌ WRONG!
  ...
};

// ❌ BEFORE (Line 138): Reverse mapping also wrong
export const CANONICAL_TO_GMAIL: Record<string, string> = {
  'PERSONAL': 'CATEGORY_PERSONAL',  // ❌ WRONG!
  ...
};
```

**But** in `google.driver.ts:886`:

```typescript
private determineFolderFromLabels(labelIds: string[]): CanonicalFolderType {
  const categoryMap: Record<string, CanonicalFolderType> = {
    CATEGORY_PERSONAL: 'INBOX',  // ✅ This one was CORRECT!
    ...
  };
}
```

**The Problem**:
- When **syncing folders/labels**: Uses `gmailLabelToCanonical()` → `GMAIL_TO_CANONICAL` → Creates folder named **'PERSONAL'**
- When **assigning email folders**: Uses `determineFolderFromLabels()` → Returns **'INBOX'**
- **Result**: Emails with folder='INBOX', but folder counts updated for folder='PERSONAL' → mismatch!

---

### Inconsistency #2: Worker SQL Query (ALSO WRONG, but not the main issue)

**File**: [sync.worker.ts:372-379](backend/src/modules/email-sync/workers/sync.worker.ts#L372-L379)

```typescript
// ❌ BEFORE: Comparing path with localized display name
AND "emails"."folder" = "folders"."name"

// ✅ AFTER: Comparing path with path
AND "emails"."folder" = "folders"."path"
```

This was also a bug, but NOT the root cause of "Personale" folder issue.

---

## ✅ The Fix

### Fix #1: Canonical Mapping Consistency (PRIMARY FIX)

**File**: `backend/src/modules/email-sync/drivers/interfaces/canonical.types.ts`

```typescript
// ✅ Line 80: Forward mapping
export const GMAIL_TO_CANONICAL: Record<string, CanonicalFolderType> = {
  'CATEGORY_PERSONAL': 'INBOX',  // ✅ FIXED: Maps to INBOX now
  'CATEGORY_SOCIAL': 'SOCIAL',
  'CATEGORY_PROMOTIONS': 'PROMOTIONS',
  'CATEGORY_UPDATES': 'UPDATES',
  'CATEGORY_FORUMS': 'FORUMS',
};

// ✅ Line 138: Reverse mapping
export const CANONICAL_TO_GMAIL: Record<string, string> = {
  'SOCIAL': 'CATEGORY_SOCIAL',
  'PROMOTIONS': 'CATEGORY_PROMOTIONS',
  'UPDATES': 'CATEGORY_UPDATES',
  'FORUMS': 'CATEGORY_FORUMS',
  'PERSONAL': 'INBOX',  // ✅ FIXED: Maps to INBOX, not CATEGORY_PERSONAL
};
```

### Fix #2: Worker SQL Query (SECONDARY FIX)

**File**: `backend/src/modules/email-sync/workers/sync.worker.ts`

```typescript
// Lines 372 and 379
AND "emails"."folder" = "folders"."path"  // ✅ FIXED: Was folders.name
```

---

## 🧪 Testing

### Step 1: Restart Backend

```bash
cd backend
npm run dev
```

### Step 2: Trigger Full Gmail Sync

```bash
# Via API endpoint
curl -X POST http://localhost:3000/api/v1/email-sync/providers/<provider-id>/sync \
  -H "Authorization: Bearer <your-token>"

# Or from frontend UI
```

### Step 3: Verify Results

```sql
-- Check folders - should have INBOX, not PERSONAL
SELECT id, path, name, "specialUse", "totalCount", "unreadCount"
FROM folder
WHERE "providerId" = '<your-gmail-provider-id>'
ORDER BY "specialUse", path;

-- Check emails - should all be in INBOX
SELECT folder, COUNT(*) as count
FROM email
WHERE "providerId" = '<your-gmail-provider-id>'
  AND "isDeleted" = false
GROUP BY folder
ORDER BY count DESC;
```

**Expected Results**:
- ✅ INBOX folder exists with correct counts
- ✅ NO "PERSONAL" or "Personale" folder
- ✅ All personal category emails have `folder = 'INBOX'`

---

## 📊 Why This Happened

### The Flow That Was Broken:

1. **Gmail Sync Starts**
   ↓
2. **Sync Folders**:
   - Gmail API returns `CATEGORY_PERSONAL` label
   - `gmailLabelToCanonical('CATEGORY_PERSONAL')` → uses GMAIL_TO_CANONICAL
   - Returns `'PERSONAL'` ❌
   - Creates folder in DB: `{path: 'PERSONAL', name: 'Personale', specialUse: 'PERSONAL'}`
   ↓
3. **Sync Messages**:
   - Gmail API returns message with labels: `['INBOX', 'CATEGORY_PERSONAL', 'UNREAD']`
   - `determineFolderFromLabels([...])` → uses internal categoryMap
   - Returns `'INBOX'` ✅
   - Creates email in DB: `{folder: 'INBOX', ...}`
   ↓
4. **Update Folder Counts** (Worker):
   - Tries to count emails where `emails.folder = folders.name`
   - Compares `'INBOX'` with `'Personale'` → mismatch! ❌
   - Result: INBOX folder shows 0 emails, PERSONAL folder never gets counted

### Result:
- Emails stored with `folder = 'INBOX'` ✅
- But frontend queries for `specialUse = 'INBOX'` and finds folder named 'PERSONAL' ❌
- User sees emails under "Personale" instead of "INBOX" ❌

---

## 🎯 Root Cause Summary

**Primary Issue**: Inconsistent canonical type mappings
- `GMAIL_TO_CANONICAL` said: CATEGORY_PERSONAL → PERSONAL
- `determineFolderFromLabels()` said: CATEGORY_PERSONAL → INBOX
- **These MUST match!**

**Secondary Issue**: Worker SQL used wrong field
- Compared `emails.folder` (path) with `folders.name` (localized display)
- Should compare `emails.folder` with `folders.path`

---

## 🚀 Prevention

**Lessons Learned**:

1. **Check ALL mappings for consistency**:
   - Forward mapping (provider → canonical)
   - Reverse mapping (canonical → provider)
   - Driver logic (message → folder assignment)

2. **Use path fields consistently**:
   - `emails.folder` = canonical path
   - `folders.path` = canonical path
   - `folders.name` = localized display name
   - Always join on path, not name

3. **Test with localized Gmail accounts**:
   - Italian: "Posta in arrivo", "Personale"
   - French: "Boîte de réception", "Personnel"
   - German: "Posteingang", "Persönlich"

---

## 📁 Files Modified

| File | Changes |
|------|---------|
| `backend/src/modules/email-sync/drivers/interfaces/canonical.types.ts` | Lines 80, 138 - Fixed CATEGORY_PERSONAL mappings |
| `backend/src/modules/email-sync/workers/sync.worker.ts` | Lines 372, 379 - Fixed SQL to use folders.path |

---

## 🎉 Status

✅ **PRIMARY BUG FIXED**: Canonical mapping inconsistency resolved
✅ **SECONDARY BUG FIXED**: Worker SQL query corrected
⏳ **TESTING REQUIRED**: Backend restart + full Gmail sync

---

**Fix Applied**: 2025-12-30
**Testing Status**: ⏳ Pending full sync verification
**Production Ready**: ⏳ After successful test
