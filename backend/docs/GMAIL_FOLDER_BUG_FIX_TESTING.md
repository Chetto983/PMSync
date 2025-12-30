# Gmail Folder Bug Fix - Testing & Verification

**Date**: 2025-12-30
**Bug**: Worker comparing `emails.folder` (path) with `folders.name` (display name)
**Fix**: Changed to compare with `folders.path`
**Status**: ✅ **FIX APPLIED**

---

## 🔧 Fix Applied

**File**: `backend/src/modules/email-sync/workers/sync.worker.ts`
**Lines**: 372 and 379

### Before (Bug)
```typescript
AND "emails"."folder" = "folders"."name"
```

### After (Fixed)
```typescript
AND "emails"."folder" = "folders"."path"
```

---

## 🧪 Testing Plan

### Step 1: Verify Database State BEFORE Fix

Run these queries to document the current (broken) state:

```sql
-- 1. Check current folder counts (likely wrong)
SELECT
  id,
  "providerId",
  path,
  name,
  "specialUse",
  "totalCount",
  "unreadCount"
FROM folder
WHERE "providerId" = '<your-gmail-provider-id>'
ORDER BY "specialUse", path;

-- 2. Check email folder assignments
SELECT
  folder,
  COUNT(*) as email_count
FROM email
WHERE "providerId" = '<your-gmail-provider-id>'
  AND "isDeleted" = false
GROUP BY folder
ORDER BY folder;

-- 3. Check for mismatches (this shows the bug)
SELECT
  f.path as folder_path,
  f.name as folder_name,
  f."specialUse",
  f."totalCount" as reported_count,
  COUNT(e.id) as actual_count,
  (f."totalCount" - COUNT(e.id)) as discrepancy
FROM folder f
LEFT JOIN email e ON
  e."providerId" = f."providerId"
  AND e.folder = f.path  -- ✅ Correct join
  AND e."isDeleted" = false
WHERE f."providerId" = '<your-gmail-provider-id>'
GROUP BY f.id, f.path, f.name, f."specialUse", f."totalCount"
ORDER BY discrepancy DESC;
```

**Expected Results BEFORE Fix**:
- INBOX folder shows `totalCount = 0` (because "INBOX" ≠ "Posta in arrivo")
- Custom "Personale" folder might show counts if emails have `folder = "Personale"`
- Large discrepancies in the mismatch query

---

### Step 2: Manually Run Corrected SQL (Test Fix)

```sql
-- Manually apply the fix to see if it works
UPDATE folder
SET
  "totalCount" = (
    SELECT COUNT(*)
    FROM email
    WHERE email."providerId" = folder."providerId"
      AND email.folder = folder.path  -- ✅ Correct join
      AND email."isDeleted" = false
  ),
  "unreadCount" = (
    SELECT COUNT(*)
    FROM email
    WHERE email."providerId" = folder."providerId"
      AND email.folder = folder.path  -- ✅ Correct join
      AND email."isDeleted" = false
      AND email."isRead" = false
  ),
  "updatedAt" = NOW()
WHERE "providerId" = '<your-gmail-provider-id>';
```

---

### Step 3: Verify Counts After Manual Fix

```sql
-- 1. Check updated folder counts (should be correct now)
SELECT
  id,
  "providerId",
  path,
  name,
  "specialUse",
  "totalCount",
  "unreadCount",
  "updatedAt"
FROM folder
WHERE "providerId" = '<your-gmail-provider-id>'
ORDER BY "specialUse", path;

-- 2. Verify no discrepancies
SELECT
  f.path as folder_path,
  f.name as folder_name,
  f."specialUse",
  f."totalCount" as reported_count,
  COUNT(e.id) as actual_count,
  (f."totalCount" - COUNT(e.id)) as discrepancy
FROM folder f
LEFT JOIN email e ON
  e."providerId" = f."providerId"
  AND e.folder = f.path
  AND e."isDeleted" = false
WHERE f."providerId" = '<your-gmail-provider-id>'
GROUP BY f.id, f.path, f.name, f."specialUse", f."totalCount"
HAVING (f."totalCount" - COUNT(e.id)) != 0;
```

**Expected Results AFTER Fix**:
- INBOX folder shows correct `totalCount` (number of emails with `folder = "INBOX"`)
- No "Personale" folder (unless it's a real custom label)
- Zero rows in the discrepancy query (all counts match)

---

### Step 4: Trigger Real Sync to Test Worker

```bash
# Restart backend to load fixed worker code
cd backend
npm run dev

# Trigger a Gmail sync (this will run the fixed worker)
# Method 1: Manual sync endpoint
curl -X POST http://localhost:3000/api/v1/email-sync/providers/<provider-id>/sync \
  -H "Authorization: Bearer <your-token>"

# Method 2: Wait for automatic sync (check BullMQ dashboard)
# Or trigger from frontend UI
```

---

### Step 5: Verify Worker Used Correct Join

```sql
-- After worker runs, verify counts are still correct
SELECT
  f.path as folder_path,
  f.name as folder_name,
  f."specialUse",
  f."totalCount" as reported_count,
  COUNT(e.id) as actual_count,
  (f."totalCount" - COUNT(e.id)) as discrepancy
FROM folder f
LEFT JOIN email e ON
  e."providerId" = f."providerId"
  AND e.folder = f.path
  AND e."isDeleted" = false
WHERE f."providerId" = '<your-gmail-provider-id>'
GROUP BY f.id, f.path, f.name, f."specialUse", f."totalCount"
HAVING (f."totalCount" - COUNT(e.id)) != 0;
```

**Expected**: Zero rows (all counts accurate)

---

## 🎯 Success Criteria

✅ **Fix is successful if**:

1. **INBOX folder shows correct email count**
   - `folders.totalCount` matches actual number of emails with `folder = "INBOX"`

2. **No phantom "Personale" folder**
   - Unless user has a real custom label named "Personale"

3. **Frontend filter works correctly**
   - `/api/v1/emails?specialUse=INBOX` returns all inbox emails
   - Email list shows correct emails

4. **Folder counts match reality**
   - Zero discrepancies in verification query

5. **Worker updates remain accurate**
   - After sync, counts still correct

---

## 🔍 Additional Diagnostic Queries

### Find Duplicate INBOX Folders
```sql
SELECT
  "providerId",
  COUNT(*) as inbox_count,
  STRING_AGG(path, ', ') as paths,
  STRING_AGG(name, ', ') as names
FROM folder
WHERE "specialUse" = 'INBOX'
GROUP BY "providerId"
HAVING COUNT(*) > 1;
```

### Check for Gmail Category Labels (Should Be Empty)
```sql
SELECT
  id,
  path,
  name,
  "externalId",
  "specialUse"
FROM folder
WHERE "externalId" LIKE 'CATEGORY_%';
```

**Expected**: Zero rows (category labels should NOT be synced)

### Check Custom "Personale" Label
```sql
SELECT
  id,
  "providerId",
  path,
  name,
  "externalId",
  "specialUse",
  "isSystem",
  "totalCount"
FROM folder
WHERE (LOWER(name) = 'personale' OR LOWER(path) = 'personale')
  AND ("specialUse" IS NULL OR "specialUse" != 'INBOX');
```

**Expected**: Either zero rows OR one row showing a legitimate custom label (not a system folder)

---

## 📝 Quick Reference

### Get Gmail Provider ID
```sql
SELECT id, email FROM "email_provider" WHERE type = 'GMAIL';
```

### Replace `<your-gmail-provider-id>` in all queries above with actual ID

---

## 🚀 Post-Fix Actions

After verifying the fix works:

1. **Update frontend** to remove any workarounds
2. **Clear cache** if using Redis/memory cache
3. **Monitor logs** for any folder-related errors
4. **Document** in release notes

---

## 📚 Related Documentation

- [GMAIL_WORKER_BUG_ANALYSIS.md](./GMAIL_WORKER_BUG_ANALYSIS.md) - Full bug analysis
- [GMAIL_FOLDER_MAPPING_AUDIT.md](./GMAIL_FOLDER_MAPPING_AUDIT.md) - Complete audit
- [debug-gmail-folders.sql](../scripts/debug-gmail-folders.sql) - Diagnostic queries

---

**Fix Status**: ✅ **APPLIED**
**Testing Status**: ⏳ **PENDING VERIFICATION**
**Production Ready**: ⏳ **After successful testing**
