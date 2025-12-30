# Folder System Roadmap - Complete Audit & Implementation Guide

## Executive Summary

This document captures all findings from the comprehensive folder system audit, including:
- Gmail system labels (complete list)
- Microsoft system folders (complete list)
- Bug fixes applied
- Remaining issues
- Prisma schema recommendations

---

## 1. System Folder Definitions

### 1.1 Gmail System Labels (PROTECTED - Cannot Edit/Delete)

Based on Gmail API and Zero-staging reference implementation.

```typescript
// Complete Gmail system labels - ALL PROTECTED
const GMAIL_SYSTEM_LABELS = [
  // Core system folders
  'INBOX',
  'SENT',
  'DRAFT',           // Gmail uses DRAFT (singular)
  'TRASH',
  'SPAM',
  'STARRED',
  'IMPORTANT',

  // Gmail categories
  'CATEGORY_PERSONAL',
  'CATEGORY_SOCIAL',
  'CATEGORY_PROMOTIONS',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS',

  // Gmail system labels
  'UNREAD',
  'CHAT',
  'MUTED',
  'ALL',             // All mail

  // Gmail star variants
  'YELLOW_STAR',
  'BLUE_STAR',
  'GREEN_STAR',
  'RED_STAR',
  'ORANGE_STAR',
  'PURPLE_STAR',
];
```

**Source**: [Zero-staging/apps/server/src/lib/gmail/driver.ts lines 32-47](../../../esempio/Zero-staging/apps/server/src/lib/gmail/driver.ts)

### 1.2 Microsoft System Folders (PROTECTED - Cannot Edit/Delete)

Based on Microsoft Graph API wellKnownName values and Zero-staging reference.

```typescript
// Complete Microsoft system folders - ALL PROTECTED
const MICROSOFT_SYSTEM_FOLDERS = [
  // Core wellKnownName values
  'inbox',
  'sentitems',
  'drafts',
  'deleteditems',
  'junkemail',
  'archive',
  'outbox',

  // Extended Microsoft folders (from Zero)
  'conversationhistory',
  'conversation history',
  'clutter',
  'conflicts',
  'localfailures',
  'serverfailures',
  'syncissues',
  'scheduled',
  'notes',
  'journal',

  // Localized variants (Italian)
  'posta in arrivo',      // INBOX
  'posta inviata',        // SENT
  'elementi inviati',     // SENT
  'bozze',                // DRAFTS
  'cestino',              // TRASH
  'posta eliminata',      // TRASH
  'posta indesiderata',   // SPAM
  'archivio',             // ARCHIVE
  'posta in uscita',      // OUTBOX

  // Localized variants (German)
  'posteingang',          // INBOX
  'gesendet',             // SENT
  'gesendete objekte',    // SENT
  'entwürfe',             // DRAFTS
  'papierkorb',           // TRASH
  'gelöscht',             // TRASH
  'gelöschte objekte',    // TRASH
  'junk-e-mail',          // SPAM
  'archiv',               // ARCHIVE
  'postausgang',          // OUTBOX

  // Localized variants (French)
  'boîte de réception',   // INBOX
  'éléments envoyés',     // SENT
  'envoyés',              // SENT
  'brouillons',           // DRAFTS
  'corbeille',            // TRASH
  'courrier indésirable', // SPAM
  'boîte d\'envoi',       // OUTBOX

  // Localized variants (Spanish)
  'bandeja de entrada',   // INBOX
  'elementos enviados',   // SENT
  'enviados',             // SENT
  'borradores',           // DRAFTS
  'papelera',             // TRASH
  'eliminados',           // TRASH
  'correo no deseado',    // SPAM
  'archivo',              // ARCHIVE
  'bandeja de salida',    // OUTBOX
];
```

**Source**: [Zero-staging/apps/server/src/lib/microsoft/driver.ts lines 755-770](../../../esempio/Zero-staging/apps/server/src/lib/microsoft/driver.ts)

### 1.3 IMAP Special-Use Attributes (RFC 6154)

```typescript
const IMAP_SPECIAL_USE = [
  '\\Inbox',
  '\\Sent',
  '\\Drafts',
  '\\Trash',
  '\\Junk',
  '\\Archive',
  '\\Flagged',
  '\\Important',
  '\\All',
];
```

---

## 2. Canonical Type System

### 2.1 SYSTEM_LABEL_IDS Set

Located at: `backend/src/modules/email-sync/drivers/interfaces/canonical.types.ts`

```typescript
export const SYSTEM_LABEL_IDS = new Set<string>([
  // Core system folders (all providers)
  'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE', 'IMPORTANT', 'STARRED', 'OUTBOX',
  // Aliases
  'JUNK', 'FLAGGED', 'DRAFT',
  // Gmail system labels
  'UNREAD', 'MUTED', 'CHAT', 'ALL',
  // Gmail categories
  'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'CATEGORY_PROMOTIONS',
  // Gmail star variants
  'YELLOW_STAR', 'BLUE_STAR', 'GREEN_STAR', 'RED_STAR', 'ORANGE_STAR', 'PURPLE_STAR',
  // Microsoft extended folders (from Zero systemFolderNames)
  'CONVERSATIONHISTORY', 'CONVERSATION HISTORY', 'CLUTTER', 'SCHEDULED', 'NOTES', 'JOURNAL',
]);

export function isSystemFolder(type: CanonicalFolderType): boolean {
  return SYSTEM_LABEL_IDS.has(type);
}
```

---

## 3. Bugs Fixed

### 3.1 BUG-001: folderNameToCanonical() Always Returns Value

**Problem**: The `folderNameToCanonical()` function was returning `name.toUpperCase()` for unknown folders instead of `undefined`. This caused ALL folders to get a `specialUse` value set.

**Location**: `backend/src/modules/email-sync/services/folder-sync.service.ts`

**Fix Applied**:
```typescript
private determineMicrosoftFolderType(folderName: string): string | undefined {
  const canonical = folderNameToCanonical(folderName);
  // Only return specialUse for known system folders, not custom folders
  return isSystemFolder(canonical) ? canonical : undefined;
}
```

### 3.2 BUG-002: Gmail UNREAD/CHAT Labels Missing Protection

**Problem**: Gmail's `determineFolderTypeFromLabelId()` returned `undefined` for UNREAD, CHAT, and MUTED labels, allowing users to attempt editing/deleting them.

**Location**: `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts`

**Fix Applied**: Added all Gmail system labels to the label map.

### 3.4 BUG-004: Gmail Categories Overwriting INBOX specialUse

**Problem**: Gmail CATEGORY_PERSONAL label mapped to same path as INBOX, causing specialUse to be overwritten from 'INBOX' to 'CATEGORY_PERSONAL' during sync.

**Location**: `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts`

**Root Cause**: `labelIdToFolderPath()` maps CATEGORY_PERSONAL to 'INBOX'. When processing labels in order, if CATEGORY_PERSONAL comes after INBOX, it overwrites the specialUse value.

**Fix Applied (2025-12-30)**: Skip ALL Gmail category labels during folder sync. Based on Zero-staging pattern: Gmail categories are virtual inbox tabs, not real folders. They cannot be created/deleted/renamed by users - they're managed by Gmail settings.

```typescript
// Skip ALL Gmail category labels - they are virtual categories, not real folders
if (label.id?.startsWith('CATEGORY_')) {
  this.logger.debug(`Skipping Gmail category label: ${label.id}`);
  continue;
}
```

### 3.5 BUG-005: isSystem Not Set in Provider-Specific Folder Services

**Problem**: Gmail and Microsoft folder services had their own `folder.upsert()` calls that didn't include the `isSystem` field, causing folders to have `isSystem=false` even when they should be protected.

**Location**:
- `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts`
- `backend/src/modules/email-sync/services/microsoft/microsoft-folder.service.ts`

**Fix Applied (2025-12-30)**: Added `isSystem: isSystemFolder(specialUse ?? '')` to both create and update sections of the upsert in both services.

### 3.3 BUG-003: Microsoft Folder Service Missing Extended Folders

**Problem**: Microsoft folder service didn't include all system folders from Zero-staging reference.

**Location**: `backend/src/modules/email-sync/services/microsoft/microsoft-folder.service.ts`

**Fix Applied**: Complete systemFolderMap with localized variants.

---

## 4. Remaining Issues

### 4.1 CRITICAL: folders.controller.ts Uses Hardcoded List

**Location**: `backend/src/modules/email/controllers/folders.controller.ts` lines 698-702

**Current Code (WRONG)**:
```typescript
const systemFolders = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK', 'ARCHIVE'];
if (folder.specialUse && systemFolders.includes(folder.specialUse)) {
  throw new BadRequestException(`Cannot delete system folder: ${folder.specialUse}`);
}
```

**Problem**: Only 7 system folders are protected. Missing:

- Gmail: STARRED, IMPORTANT, UNREAD, CHAT, MUTED, ALL, CATEGORY_*, star variants
- Microsoft: OUTBOX, CONVERSATIONHISTORY, CLUTTER, SCHEDULED, NOTES, JOURNAL

**Required Fix**:

```typescript
import { isSystemFolder } from '../email-sync/drivers/interfaces/canonical.types';

// In deleteFolder method:
if (folder.specialUse && isSystemFolder(folder.specialUse)) {
  throw new BadRequestException(`Cannot delete system folder: ${folder.specialUse}`);
}
```

### 4.2 MEDIUM: Update Endpoint Lacks System Folder Check

The `updateFolder` endpoint should also check for system folders to prevent renaming.

---

## 5. Prisma Schema Recommendations

### 5.1 Add isSystem Computed Field

Add a boolean `isSystem` field to the Folder model for faster queries and explicit protection.

```prisma
model Folder {
  // ... existing fields ...

  // NEW: Explicit system folder flag
  // Set during sync based on provider's system folder detection
  isSystem     Boolean        @default(false)

  // ... rest of model ...
}
```

**Benefits**:

- Faster queries: `WHERE isSystem = false` instead of complex `specialUse` checks
- Explicit intent: Clear distinction between system and user folders
- Database-level protection: Can add constraints or triggers

### 5.2 Migration Script

```sql
-- Add isSystem column
ALTER TABLE folders ADD COLUMN "isSystem" BOOLEAN DEFAULT false;

-- Update existing system folders
UPDATE folders
SET "isSystem" = true
WHERE "specialUse" IN (
  'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK', 'ARCHIVE',
  'STARRED', 'IMPORTANT', 'FLAGGED',
  'UNREAD', 'CHAT', 'MUTED', 'ALL',
  'CATEGORY_PERSONAL', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS', 'CATEGORY_PROMOTIONS',
  'YELLOW_STAR', 'BLUE_STAR', 'GREEN_STAR', 'RED_STAR', 'ORANGE_STAR', 'PURPLE_STAR',
  'OUTBOX', 'CONVERSATIONHISTORY', 'CONVERSATION HISTORY', 'CLUTTER', 'SCHEDULED', 'NOTES', 'JOURNAL'
);

-- Add index for queries
CREATE INDEX folders_is_system_idx ON folders("isSystem");
```

### 5.3 Sync Service Updates

After adding `isSystem` field, update sync services:

```typescript
// In all folder sync services
const folder = {
  // ... existing fields ...
  isSystem: isSystemFolder(specialUse),
};
```

---

## 6. Frontend Impact

### 6.1 Current Logic

Location: `frontend/components/email/folders/FolderSidebar.tsx` line 415

```tsx
{!folder.specialUse && (
  // Show edit/delete menu
)}
```

**Status**: Correct approach - checks for presence of `specialUse` value.

### 6.2 After Prisma Update

Can simplify to:
```tsx
{!folder.isSystem && (
  // Show edit/delete menu
)}
```

---

## 7. Zero-staging Reference Files

| Feature | Zero File | MailAgent File |
|---------|-----------|----------------|
| Gmail systemLabelIds | `apps/server/src/lib/gmail/driver.ts:32-47` | `canonical.types.ts:SYSTEM_LABEL_IDS` |
| Microsoft systemFolderNames | `apps/server/src/lib/microsoft/driver.ts:755-770` | `microsoft-folder.service.ts:systemFolderMap` |
| Label CRUD | `apps/server/src/trpc/routes/label.ts` | `labels.controller.ts` |
| Folder operations | `apps/server/src/lib/*/driver.ts` | `*-folder.service.ts` |

---

## 8. Implementation Checklist

### Phase 1: Controller Fix (CRITICAL) ✅ COMPLETED
- [x] Update `SYSTEM_LABEL_IDS` Set in canonical.types.ts
- [x] Update gmail-folder.service.ts with complete system labels
- [x] Update microsoft-folder.service.ts with complete system folders
- [x] **FIX folders.controller.ts to use isSystemFolder()** ✅
- [x] Add system folder check to renameFolder endpoint ✅

### Phase 2: Prisma Enhancement (MEDIUM) ✅ COMPLETED
- [x] Add `isSystem` field to Prisma Folder model ✅
- [x] Run `prisma db push` to apply schema ✅
- [x] Update sync services to set `isSystem` flag ✅
- [x] Update frontend to use `isSystem` instead of `specialUse` check ✅

### Phase 3: Validation (REQUIRED) ✅ COMPLETED
- [x] Run E2E validation script ✅
- [x] Verify all system folders have `isSystem=true` (28 folders) ✅
- [x] Verify all custom folders have `isSystem=false` (2 folders) ✅
- [x] TypeScript type-check passes (backend + frontend) ✅

---

## 9. Validation Scripts

### Comprehensive E2E Validation
Located at: `backend/scripts/validate-folder-system.ts`

```bash
npx ts-node scripts/validate-folder-system.ts          # Run validation
npx ts-node scripts/validate-folder-system.ts --fix    # Auto-fix issues
npx ts-node scripts/validate-folder-system.ts --verbose # Detailed output
```

### Quick Status Check
Located at: `backend/scripts/check-folders.ts`

```bash
npx ts-node scripts/check-folders.ts
```

---

## 10. Final Validation Results (2025-12-30)

```
============================================================
  FOLDER SYSTEM VALIDATION
============================================================

✅ SYSTEM_LABEL_IDS completeness: All 33 expected labels present
✅ isSystemFolder() function: 8/8 test cases passed
✅ Total folders: 30 (28 system, 2 user)
✅ All folders correctly aligned
✅ All core folders (INBOX, SENT, DRAFTS, TRASH, SPAM) protected

Provider Coverage:
- testopta@libero.it (IMAP): 6 system folders
- chetto983@hotmail.it (Microsoft): 8 system folders
- dvdmarchetto@gmail.com (Gmail): 14 system, 2 user folders

✅ ALL VALIDATIONS PASSED
============================================================
```

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2024-12-30 | Initial audit and roadmap creation | Claude |
| 2024-12-30 | Fixed folderNameToCanonical bug | Claude |
| 2024-12-30 | Updated SYSTEM_LABEL_IDS Set | Claude |
| 2024-12-30 | Updated Gmail/Microsoft folder services | Claude |
| 2025-12-30 | Fixed folders.controller.ts to use isSystemFolder() | Claude |
| 2025-12-30 | Added isSystem field to Prisma Folder model | Claude |
| 2025-12-30 | Updated folder-sync.service.ts to set isSystem | Claude |
| 2025-12-30 | Updated frontend to use isSystem field | Claude |
| 2025-12-30 | Created E2E validation script | Claude |
| 2025-12-30 | **ALL PHASES COMPLETED** ✅ | Claude |
