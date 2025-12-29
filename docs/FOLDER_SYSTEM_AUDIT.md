# Folder System - Deep Audit Report

**Date**: December 29, 2025
**Scope**: Provider → Backend → Database → Frontend
**Issue Duration**: 3+ months

---

## Executive Summary

The folder system has **8 critical issues** causing confusion across all layers. The root problem is **inconsistent data types and naming conventions** between layers.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EMAIL PROVIDERS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Google:     specialUse = "INBOX", "SENT", etc.                             │
│  Microsoft:  wellKnownName = "inbox", "sentitems", etc.                     │
│  IMAP:       attributes = ["\\Inbox"], path = "INBOX" or localized name     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATABASE (Prisma)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  Folder: {                                                                  │
│    id: CUID                      ← Primary key                              │
│    name: "Posta in arrivo"       ← Localized display name                   │
│    path: "INBOX"                 ← Provider path (may be localized)         │
│    specialUse: "INBOX"           ← RFC 6154 canonical type (UPPERCASE)      │
│    externalId: "inbox"           ← Provider-specific ID                     │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND API                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  GET /emails?folder=X&specialUse=Y                                          │
│                                                                             │
│  - folder: Filter by path OR name (case-insensitive)                        │
│  - specialUse: Filter by RFC 6154 type (aggregates across providers)        │
│                                                                             │
│  PROBLEM: Both params accepted, unclear which to use                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  FolderItem: {                                                              │
│    id: "all:inbox" | "smart:unread" | "label:uuid" | "db-uuid"              │
│    filterFolder: "INBOX" | "Posta in arrivo"  ← CONFUSION: What is this?    │
│    specialUse: "INBOX"                                                      │
│    queryOverrides: { folder: ???, specialUse: ??? }                         │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Issues

### Issue #1: TWO Different `FolderItem` Types (CRITICAL)

**Location**:
- `frontend/components/dashboard/hooks/use-folder-logic.tsx:12-26`
- `frontend/components/email/EmailSidebar/types.ts:6-19`

**Problem**: Two incompatible interfaces exist:

| Field | use-folder-logic.tsx | EmailSidebar/types.ts |
|-------|---------------------|----------------------|
| aggregate | ✅ Yes | ❌ No |
| filterFolder | ✅ Yes | ❌ No |
| queryOverrides | ✅ Yes | ❌ No |

**Impact**: Components importing from different files get different types. EmailSidebar cannot properly use `filterFolder` or `queryOverrides`.

**Fix**: Unify into single type in `frontend/lib/types/folder.ts`.

---

### Issue #2: Magic String Folder IDs (CRITICAL)

**Location**: `frontend/components/dashboard/hooks/use-folder-logic.tsx`

**Problem**: `selectedFolderId` can be:
- `"all:inbox"` - Aggregate folder
- `"smart:unread"` - Smart filter
- `"smart:today"` - Smart filter
- `"label:uuid-here"` - Label
- `"cm12345..."` - Database CUID

**Impact**: Every component must parse the ID format to understand what it represents.

**Fix**: Create discriminated union type:
```typescript
type FolderSelection =
  | { type: 'aggregate'; specialUse: string }
  | { type: 'smart'; filter: SmartFilterType }
  | { type: 'label'; labelId: string }
  | { type: 'remote'; folderId: string; providerId: string };
```

---

### Issue #3: `filterFolder` vs `folder` vs `specialUse` Confusion (CRITICAL)

**Location**:
- `frontend/components/dashboard/hooks/use-folder-logic.tsx:177,198,202-205`
- `frontend/components/dashboard/hooks/useMailboxData.ts:144-149`

**Problem**: Three different concepts used interchangeably:

```typescript
// use-folder-logic.tsx:177
const canonicalFolder = folder.specialUse?.toUpperCase() || folder.path || folder.name;

// useMailboxData.ts:144-149
folder:
  activeFolder?.filterFolder ||
  activeFolder?.queryOverrides?.folder ||
  activeFolder?.specialUse ||
  activeFolder?.queryOverrides?.specialUse,
```

**Values observed**:
- `filterFolder = "INBOX"` (from specialUse)
- `filterFolder = "Posta in arrivo"` (localized folder name)
- `folder = "INBOX"` (canonical)
- `specialUse = "INBOX"` (RFC 6154)

**Impact**: API requests send inconsistent values. Backend must handle all variations.

**Fix**: Always use `specialUse` for canonical folders, `path` for custom folders.

---

### Issue #4: FolderSelectorDialog Hardcoded Folders (HIGH)

**Location**: `frontend/components/email/dialogs/FolderSelectorDialog.tsx:41-48`

**Problem**: Dialog shows only 6 hardcoded folders:
```typescript
const commonFolders = [
  { id: 'INBOX', name: t.folders.inbox },
  { id: 'SENT', name: t.folders.sent },
  { id: 'ARCHIVE', name: t.folders.archive },
  { id: 'TRASH', name: t.folders.trash },
  { id: 'DRAFTS', name: t.folders.drafts },
  { id: 'SPAM', name: t.folders.spam },
];
```

**Impact**: Users cannot move emails to custom folders they created.

**Fix**: Use actual folders from `useFoldersStore()`.

---

### Issue #5: Inconsistent Case Handling (HIGH)

**Location**:
- `frontend/lib/utils/folder-normalization.ts` uses lowercase: `'inbox'`
- `frontend/components/dashboard/hooks/use-folder-logic.tsx` uses uppercase: `'INBOX'`
- Backend uses case-insensitive queries: `mode: 'insensitive'`

**Impact**: Potential icon/color mismatches, inconsistent comparisons.

**Fix**: Standardize on UPPERCASE for all specialUse values.

---

### Issue #6: Folder Count Lookup Key Mismatch (MEDIUM)

**Location**:
- Store: `frontend/stores/folders-store.ts:36` uses `${providerId}:${folderId}`
- Component: `frontend/components/email/EmailSidebar/FoldersList.tsx:114`

**Problem**: When `providerId` is undefined, lookup fails.

**Fix**: Always use composite key, ensure providerId is always set.

---

### Issue #7: Drag-and-Drop Uses Wrong Folder Identifier (MEDIUM)

**Location**: `frontend/components/dashboard/Mailbox.tsx:321`

```typescript
const targetFolderName = targetFolder.filterFolder || targetFolder.label;
```

**Problem**: Uses `filterFolder` (which could be specialUse "INBOX") or falls back to display label ("Posta in arrivo"). Neither is reliable for API calls.

**Fix**: Use `folder.path` or `folder.specialUse` consistently.

---

### Issue #8: Missing Type Export for `FolderItem` (MEDIUM)

**Location**: `frontend/components/email/index.ts`

**Problem**: `FolderItem` exported from multiple locations, causing import confusion.

**Fix**: Single source of truth in `frontend/lib/types/folder.ts`.

---

## Recommended Fixes (Priority Order)

### Phase 1: Type Unification (2-3 hours)

1. Create `frontend/lib/types/folder.ts`:
```typescript
import type { Folder } from '@/lib/api/folders';
import type { EmailListParams } from '@/lib/api/email';

// Folder ID prefixes for parsing
export const FOLDER_PREFIXES = {
  SMART: 'smart:',
  AGGREGATE: 'all:',
  LABEL: 'label:',
} as const;

// Unified FolderItem interface
export interface FolderItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  count?: number;
  color?: string;

  // Folder classification
  aggregate?: boolean;

  // Provider info
  providerId?: string;
  providerEmail?: string;

  // Folder identifiers (use ONE of these)
  specialUse?: string;  // For canonical folders: INBOX, SENT, etc.
  path?: string;        // For custom folders: "MyFolder/SubFolder"

  // Full data for CRUD operations
  folderData?: Folder;

  // Query parameters to fetch emails
  queryOverrides?: Partial<EmailListParams>;
}

// Utility to parse folder ID
export function parseFolderId(id: string): {
  type: 'smart' | 'aggregate' | 'label' | 'remote';
  value: string;
} {
  if (id.startsWith(FOLDER_PREFIXES.SMART)) {
    return { type: 'smart', value: id.slice(FOLDER_PREFIXES.SMART.length) };
  }
  if (id.startsWith(FOLDER_PREFIXES.AGGREGATE)) {
    return { type: 'aggregate', value: id.slice(FOLDER_PREFIXES.AGGREGATE.length) };
  }
  if (id.startsWith(FOLDER_PREFIXES.LABEL)) {
    return { type: 'label', value: id.slice(FOLDER_PREFIXES.LABEL.length) };
  }
  return { type: 'remote', value: id };
}
```

2. Update all imports to use new unified type.

3. Delete duplicate type definitions.

### Phase 2: Fix FolderSelectorDialog (1 hour)

Replace hardcoded folders with store data:
```typescript
const folders = useFoldersStore(state => state.foldersByProvider);
// Map to all unique folders by specialUse
```

### Phase 3: Fix Query Parameter Generation (2 hours)

Create utility function in `useMailboxData.ts`:
```typescript
function buildEmailQuery(folder: FolderItem): Partial<EmailListParams> {
  // Smart filters
  if (folder.queryOverrides) {
    return folder.queryOverrides;
  }

  // Aggregate by specialUse
  if (folder.specialUse) {
    return { specialUse: folder.specialUse };
  }

  // Custom folder by path
  if (folder.path && folder.providerId) {
    return { providerId: folder.providerId, folder: folder.path };
  }

  return {};
}
```

### Phase 4: Standardize Case (1 hour)

1. Update `folder-normalization.ts` to use UPPERCASE keys.
2. Update all comparisons to use `.toUpperCase()`.

### Phase 5: Fix Drag-and-Drop (30 min)

Update `Mailbox.tsx` to use correct folder identifier:
```typescript
const targetFolderPath = targetFolder.path || targetFolder.specialUse;
```

---

## Database Schema (Reference)

```prisma
model Folder {
  id           String  @id @default(cuid())
  tenantId     String
  providerId   String
  name         String        // "Posta in arrivo" (localized)
  path         String        // "INBOX" or "MyFolder/SubFolder"
  specialUse   String?       // RFC 6154: "INBOX", "SENT", "TRASH", etc.
  externalId   String?       // Provider-specific ID
  totalCount   Int
  unreadCount  Int
  // ... other fields
}
```

---

## Backend API Reference

| Endpoint | Parameter | Purpose |
|----------|-----------|---------|
| GET /emails | `folder` | Filter by path (case-insensitive) |
| GET /emails | `specialUse` | Filter by RFC 6154 type (aggregates) |
| GET /emails | `providerId` | Filter by provider |
| GET /folders | - | Returns all folders by provider |

---

## Testing Checklist

After fixes:

- [ ] Select "Posta in arrivo" → shows INBOX emails
- [ ] Select "All Accounts > Inbox" → shows all INBOX emails
- [ ] Select "Smart > Unread" → shows unread from all folders
- [ ] Drag email to "Cestino" → moves to trash
- [ ] Create custom folder → appears in sidebar
- [ ] Move email to custom folder → works
- [ ] Folder counts update after operations

---

*Report generated from comprehensive system audit*
