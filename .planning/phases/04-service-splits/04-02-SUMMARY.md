---
phase: 04-service-splits
plan: 02
subsystem: email-sync
tags: [imap, gmail, microsoft, folder-sync, crud]

dependency-graph:
  requires:
    - 04-01 (FolderSyncQueryService for database operations)
  provides:
    - ImapFolderSyncService for IMAP folder sync and CRUD
    - Extended GmailFolderService with unified sync and CRUD
    - Extended MicrosoftFolderService with CRUD methods
  affects:
    - 04-04 (Folder Sync Facade will consume these services)

tech-stack:
  added: []
  patterns:
    - Provider-specific service extraction
    - Unified facade pattern with syncFolders() signature
    - RFC 6154 special-use attribute detection
    - Graph API delta query pagination

file-tracking:
  key-files:
    created:
      - backend/src/modules/email-sync/services/imap-folder-sync.service.ts
    modified:
      - backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts
      - backend/src/modules/email-sync/services/microsoft/microsoft-folder.service.ts
      - backend/src/modules/email-sync/email-sync.module.ts

decisions:
  - id: 04-02-D1
    title: FolderSyncQueryService injection for IMAP
    choice: ImapFolderSyncService delegates DB operations to queryService
    rationale: No code duplication - query service handles all folder persistence

  - id: 04-02-D2
    title: Unified syncFolders signature
    choice: All providers implement syncFolders(tenantId, providerId)
    rationale: Enables facade pattern to call any provider uniformly

metrics:
  duration: ~11 minutes
  completed: 2026-02-01
---

# Phase 4 Plan 2: Provider Folder Sync Services Summary

**One-liner:** Provider-specific folder sync services with unified signatures for IMAP, Gmail, and Microsoft

## What Was Built

### 1. ImapFolderSyncService (375 lines)

New service extracting IMAP-specific folder operations:

- `syncImapFolders(tenantId, providerId)`: Full sync with FolderSyncQueryService delegation
- `parseImapFolders()`: Parse IMAP folder list response
- `determineSpecialUse()`: RFC 6154 special-use detection
- `createImapFolder()`: Create folder with duplicate check
- `renameImapFolder()`: Rename with fallback folder creation
- `deleteImapFolder()`: Delete with graceful non-existent handling

### 2. GmailFolderService Extension (429 lines, +122)

Extended existing service with:

- `syncFolders(tenantId, providerId)`: Unified facade method
- `createGmailFolder()`: Label creation with reserved name validation
- `renameGmailFolder()`: Label update via Gmail API
- `deleteGmailFolder()`: Label deletion
- ProviderTokenService injection for token management

### 3. MicrosoftFolderService Extension (447 lines, +60)

Extended existing service with:

- `syncFolders(tenantId, providerId)`: Unified facade method
- `fetchMicrosoftFolders()`: Delta query pagination helper
- `createMicrosoftFolder()`: Folder creation via Graph API
- `renameMicrosoftFolder()`: Folder rename via PATCH
- `deleteMicrosoftFolder()`: Folder deletion
- ProviderTokenService injection for token management

## Key Implementation Details

### Unified Provider Interface

All three services now implement consistent signatures:

```typescript
// Sync method
syncFolders(tenantId: string, providerId: string): Promise<void>
syncImapFolders(tenantId: string, providerId: string): Promise<Folder[]>

// CRUD methods
create*Folder(providerId, name, parentPath?): Promise<{ externalId, path }>
rename*Folder(providerId, folderId/path, newName): Promise<string|void>
delete*Folder(providerId, folderId/path): Promise<void>
```

### Error Handling

- Gmail: 409 conflict errors for duplicate labels
- Microsoft: Graph API 409 for name conflicts
- IMAP: Pattern-matched error messages for exists/permission/denied

### Reserved Name Validation (Gmail)

```typescript
const RESERVED_NAMES = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', ...];
// Blocks creation of labels with system folder names
```

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 1d00798 | feat(04-02): create ImapFolderSyncService | imap-folder-sync.service.ts |
| e0d0e88 | feat(04-02): extend GmailFolderService | gmail-folder.service.ts |
| (parallel) | MicrosoftFolderService changes included in 04-03 | microsoft-folder.service.ts |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

```
npm run type-check                                    # PASS
wc -l imap-folder-sync.service.ts                     # 375 lines (< 400)
wc -l gmail/gmail-folder.service.ts                   # 429 lines (< 500)
wc -l microsoft/microsoft-folder.service.ts           # 447 lines (< 500)
grep ImapFolderSyncService email-sync.module.ts       # Registered in providers + exports
```

## Next Phase Readiness

Ready for 04-04 (Folder Sync Facade):

- ImapFolderSyncService: Registered and exported
- GmailFolderService: Extended with unified interface
- MicrosoftFolderService: Extended with unified interface
- All services injected via DI in module

The facade (04-04) can now inject these services and delegate based on provider type.
