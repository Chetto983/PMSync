# Email & Label Audit - Detailed Findings

## Methodology

Audited all three layers by reading source code for every file involved in the email/label data flow:
1. **Google -> DB**: Gmail API calls, canonical message conversion, folder sync, message upsert
2. **DB Schema**: Prisma models, indexes, migrations, relations
3. **DB -> Frontend**: API endpoints, query hooks, formatters, components

## Evidence Trail

### C1: Stale Gmail Label IDs in Email.labels[]

**Location**: `backend/src/modules/email-sync/services/sync-message-processor.service.ts:260,304,350`

**Problem**: When Gmail sync runs, `canonicalMsg.labels` (raw Gmail label IDs like `["INBOX", "Label_abc123"]`) are stored directly into `Email.labels[]`. If the user renames or deletes a Gmail label, the stored IDs become stale.

**Evidence**:
```typescript
// sync-message-processor.service.ts:260
labels: canonicalMsg.labels || [],

// gmail-message.service.ts:547
labels: labelIds,  // Raw from message.labelIds
```

**Impact**:
- `email-folder.service.ts:210` queries `labels: { has: labelToken }` — stale IDs return no results
- Emails under renamed Gmail labels become invisible in folder view
- Folder count discrepancies

**Fix**: Re-sync `Email.labels[]` during folder sync when label IDs change. Track Gmail label ID -> name mapping.

---

### C2: Custom-Label-Only Emails Default to INBOX

**Location**: `backend/src/modules/email-sync/drivers/google/services/gmail-message.service.ts:556-578`

**Problem**: `determineFolderFromLabels()` checks TRASH, SPAM, SENT, DRAFT, CATEGORY_* and INBOX. If an email has ONLY custom labels (e.g., `["Label_xyz"]` without INBOX), it falls through to the default `return 'INBOX'`.

```typescript
private determineFolderFromLabels(labelIds: string[]): CanonicalFolderType {
    if (labelIds.includes('TRASH')) return 'TRASH';
    if (labelIds.includes('SPAM')) return 'SPAM';
    if (labelIds.includes('SENT')) return 'SENT';
    if (labelIds.includes('DRAFT')) return 'DRAFTS';
    const categoryLabel = labelIds.find((l) => l.startsWith('CATEGORY_'));
    if (categoryLabel) { /* ... */ }
    if (labelIds.includes('INBOX')) return 'INBOX';
    return 'INBOX'; // <-- PROBLEM: custom-label-only emails land here
}
```

**Impact**: Emails that were archived in Gmail (removed from INBOX) but have custom labels appear as INBOX emails in PMSync.

**Fix**: Return `'ARCHIVE'` (or `'ALL_MAIL'`) when no system labels match. These are emails the user explicitly removed from INBOX.

---

### C3: Dual Folder Count Query Paths

**Location**: `backend/src/modules/email/services/email-folder.service.ts:500-530` (Google) vs `:566-598` (non-Google)

**Problem**: Google provider uses `labels: { has: externalId }` for folder counts while non-Google uses `folder` field groupBy. These are independent code paths with no cross-validation.

**Evidence**:
```typescript
// Google path (line 514-516):
...(labelToken
  ? { labels: { has: labelToken } }
  : { folder: { equals: folder, mode: 'insensitive' } }),

// Non-Google path (line 568-570):
this.prisma.email.groupBy({
  by: ['folder'],
  where: { tenantId, providerId, folder: { in: queryFolderArray, mode: 'insensitive' } },
})
```

**Impact**: If `Email.folder` disagrees with `Email.labels[]` for a Google email, the count shown in sidebar differs from the actual email list.

**Root Cause**: `Email.folder` is set once during sync from `determineFolderFromLabels()`, but `Email.labels[]` is updated on every sync. They can drift.

---

### C4: Missing emailLabels in Email List Query

**Location**: `backend/src/modules/email/services/email-folder.service.ts`

**Problem**: The email-folder.service (main listing endpoint) does NOT include `emailLabels` relation. Only `email-crud.service.ts` (single email) and `email-fetch.service.ts` (on-demand fetch) include it.

**Evidence**: Searched `email-folder.service.ts` for `emailLabels` — only found in WHERE clause (line 352 for filtering), never in select/include.

The actual email list is likely built by a controller that calls email-folder for the WHERE, then does a separate findMany. Need to verify the controller query includes emailLabels.

**Impact**: If the list endpoint doesn't include emailLabels, the frontend receives `emailLabels: undefined`, and `formatEmailToThread()` returns `labels: undefined` — no labels shown in thread list.

---

### C5: aiPrompt Column Missing from Database

**Location**: `backend/prisma/schema.prisma:628` vs `backend/prisma/migrations/`

**Problem**: `UserLabel.aiPrompt` is defined in schema.prisma but no migration creates the column.

**Evidence**: `grep -r "aiPrompt" backend/prisma/migrations/` returns NO results.

**Impact**:
- `labels.service.ts` reads/writes aiPrompt — may crash at runtime
- `email-analysis.service.ts` queries labels with aiPrompt for AI triage — silent failure
- Frontend LabelDialog has aiPrompt field — saves succeed but data is lost

**Note**: Prisma Client generates based on schema, not actual DB. If schema has it but DB doesn't, runtime Prisma queries will fail with column not found.

**Caveat**: If the baseline migration (0_baseline) includes it, this is not an issue. Need to verify.

---

### C6: No Sync-Back for Label Changes

**Location**: `backend/src/modules/email-sync/workers/sync-back.worker.ts`, `backend/src/modules/email/services/gmail-sync-back.service.ts`

**Problem**: When users add/remove UserLabels via the UI, changes are stored only in EmailLabel junction table. No mechanism pushes these to Gmail.

**Evidence**:
- `labels.service.ts:addEmailsToLabel()` creates EmailLabel records but doesn't queue sync-back
- `gmail-sync-back.service.ts` handles folder moves, read/star/flag changes but NOT label changes
- Gmail has `messages.modify()` API for addLabelIds/removeLabelIds — unused for UserLabels

**Impact**: Gmail shows stale labels. If user creates "Important Client" label in PMSync and adds emails, Gmail doesn't know.

**Design Note**: This may be intentional — UserLabels are app-level, not provider-level. But Google-native labels created in Gmail ARE synced to PMSync as Folders, creating an asymmetry.

---

### H1: No Label Display in Email Detail

**Location**: `frontend/components/email/thread/ExpandedMessage.tsx`, `frontend/components/email/thread/MessageCard.tsx`

**Problem**: Neither component renders labels. ExpandedMessage shows an "Add Labels" button but never displays existing labels.

**Evidence**: MessageCard interface (`MessageCardData`) doesn't include labels. ExpandedMessage only has the label picker button.

---

### H5: Atomic Label Array Overwrite During Sync

**Location**: `backend/src/modules/email-sync/services/sync-message-processor.service.ts:249-262`

**Problem**: RC-2 fix preserves user state for 5 minutes, but there's no merge logic for labels. If user is NOT in the 5-minute window, the entire `labels[]` array is replaced by the sync value.

```typescript
const updateData = userModifiedRecently
  ? { ...baseUpdateData }  // Preserves labels (no update)
  : {
      ...baseUpdateData,
      labels: canonicalMsg.labels || [],  // <-- FULL REPLACE
      folder: canonicalMsg.folder,
    };
```

**Impact**: If user manually modified labels via API/tool and 5+ minutes passed, next sync overwrites all label changes.

---

### M1: DRAFT vs DRAFTS Inconsistency

**Locations**:
- `gmail-folder.service.ts:298`: `DRAFT` -> `DRAFTS`
- `gmail-message.service.ts:560`: `DRAFT` -> `DRAFTS`

**Status**: Both functions agree (DRAFT maps to DRAFTS). **No actual inconsistency** — false alarm on deeper inspection. Both labelIdToFolderPath AND determineFolderFromLabels return `'DRAFTS'` for the Gmail `DRAFT` label.

---

### M6: No GIN Index on Email.labels[]

**Location**: `backend/prisma/schema.prisma:471-549`

**Problem**: The `Email.labels` field is a `String[]` used with `{ has: labelToken }` queries, but there's no GIN index on it.

**Evidence**: Schema shows indexes on `[tenantId, folder, receivedAt]`, `[tenantId, aiPriority]`, etc. but no `@@index([labels], type: Gin)`.

**Impact**: Every `labels: { has: "INBOX" }` query does a full table scan on the labels array. At 10K+ emails, this becomes the bottleneck.

**Fix**: Add `@@index([labels], type: Gin)` to schema.prisma and create migration.

---

### M7: CATEGORY_PERSONAL Exclusion

**Location**: `gmail-folder.service.ts:151`

```typescript
const labelsToSync = labels.filter(
  (l) => !!l.id && !!l.name && l.id !== 'CATEGORY_PERSONAL',
);
```

**Problem**: CATEGORY_PERSONAL is excluded from folder sync. However, `determineFolderFromLabels()` maps it to `'INBOX'` (line 566). Emails with `["CATEGORY_PERSONAL"]` as only label have:
- `folder: 'INBOX'` (correct via determineFolderFromLabels)
- `labels: ["CATEGORY_PERSONAL"]` (stored in array)
- No Folder record for CATEGORY_PERSONAL (excluded from sync)

**Impact**: When querying INBOX with Google label filter `labels: { has: "INBOX" }`, these emails won't match because they only have `CATEGORY_PERSONAL` in their labels array. They match only via `folder: 'INBOX'` fallback.

**Severity**: Low — the OR query in email-folder.service catches this. But counts could still differ.
