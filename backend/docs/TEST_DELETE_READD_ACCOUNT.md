# Test Plan: Delete & Re-add Gmail Account

**Purpose**: Verify that Gmail folder mapping fixes are permanent and work for new accounts

---

## Pre-Test Validation

Run validation script BEFORE deleting account:

```bash
cd backend
npx tsx scripts/validate-gmail-folder-mappings.ts
```

**Expected**: ✅ All 6 checks pass

---

## Test Steps

### 1. Delete Gmail Account

```sql
-- Get provider ID
SELECT id, email FROM provider_configs WHERE provider_type = 'google';

-- Delete provider (cascades to folders and emails)
DELETE FROM provider_configs WHERE id = '<provider-id>';
```

### 2. Verify Cleanup

```sql
-- Should return 0 folders
SELECT COUNT(*) FROM folders WHERE provider_id = '<provider-id>';

-- Should return 0 emails
SELECT COUNT(*) FROM emails WHERE provider_id = '<provider-id>';
```

### 3. Re-add Gmail Account

- Go to frontend Settings → Email Accounts
- Click "Add Account"
- Select Gmail
- Complete OAuth flow
- Wait for initial sync to complete

### 4. Run Validation

```bash
cd backend
npx tsx scripts/validate-gmail-folder-mappings.ts
```

**Expected Results**:
- ✅ CATEGORY_PERSONAL → INBOX mapping correct
- ✅ No phantom "PERSONAL" or "Personale" folders
- ✅ INBOX folder exists with emails
- ✅ All system folders have `isSystem = true`
- ✅ Custom folders have `isSystem = false`
- ✅ All emails properly assigned to correct folders

---

## Verification SQL Queries

### Check Folder Structure

```sql
SELECT
  name,
  path,
  "specialUse",
  "isSystem",
  "totalCount",
  "unreadCount"
FROM folders
WHERE "providerId" = '<new-provider-id>'
ORDER BY "isSystem" DESC, name ASC;
```

**Expected**:
- System folders (INBOX, SENT, etc.) have `isSystem = true`
- Custom folders have `isSystem = false`
- No "PERSONAL" or "Personale" in folder list

### Check Email Distribution

```sql
SELECT
  folder,
  COUNT(*) as email_count,
  COUNT(CASE WHEN "isRead" = false THEN 1 END) as unread_count
FROM emails
WHERE "providerId" = '<new-provider-id>'
  AND "isDeleted" = false
GROUP BY folder
ORDER BY email_count DESC;
```

**Expected**:
- Most emails in 'INBOX'
- NO emails in 'PERSONAL' or 'Personale'
- Emails distributed across SENT, UPDATES, PROMOTIONS, etc.

---

## What We're Testing

### Code-Level (Permanent)
1. `canonical.types.ts` line 141: CATEGORY_PERSONAL → INBOX
2. `canonical.types.ts` line 201: PERSONAL → INBOX
3. `gmail-folder.service.ts`: Skips CATEGORY_* during sync
4. `google.driver.ts`: Maps CATEGORY_PERSONAL correctly

### Database-Level (Automatic)
1. Migration `20241230_add_folder_is_system` runs on new sync
2. System folders automatically marked `isSystem = true`
3. Index created for performance

### Worker-Level (Fixed)
1. SQL compares `emails.folder` with `folders.path`
2. Folder counts calculated correctly
3. No orphaned emails

---

## Success Criteria

✅ All validation checks pass
✅ No "PERSONAL" or "Personale" folders
✅ All emails in correct folders
✅ System folders protected (`isSystem = true`)
✅ Custom folders editable (`isSystem = false`)

---

## If Test Fails

1. Check migration applied: `npx prisma migrate status`
2. Check code not reverted: `git diff canonical.types.ts`
3. Check folder sync logs for errors
4. Run diagnostic SQL queries above
5. Check browser console for API errors

---

## Rollback Plan

If test fails catastrophically:

```bash
# Restore from backup
pg_restore -d mailagent backup.dump

# Re-apply migration
cd backend
npx prisma migrate deploy
```

---

**Confidence Level**: 🟢 **HIGH**
**Risk Level**: 🟢 **LOW** (fixes are permanent, migration is idempotent)
**Estimated Time**: 10-15 minutes
