---
phase: 03-imap-driver-split
plan: 03
subsystem: email-sync
tags: [imap, folder-operations, rfc6154, cache, imapflow]

# Dependency graph
requires:
  - phase: 03-02
    provides: ImapConnectionPoolService for connection lifecycle
provides:
  - ImapFolderService for folder CRUD operations
  - 5-minute TTL folder cache
  - RFC 6154 special-use folder detection
  - Canonical type to IMAP path resolution
affects:
  - 03-04 (ImapMessageService uses resolveFolder for path mapping)
  - 03-05 (ImapFacadeService wires folder service into driver)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Folder cache with TTL for reducing IMAP LIST calls"
    - "RFC 6154 special-use attribute detection with heuristic fallback"
    - "Canonical folder type resolution for cross-provider compatibility"

key-files:
  created:
    - backend/src/modules/email-sync/drivers/imap/services/imap-folder.service.ts
    - backend/src/modules/email-sync/drivers/imap/__tests__/imap-folder.spec.ts
  modified: []

key-decisions:
  - "5-minute cache TTL balances freshness with IMAP server load"
  - "getFolder searches by path, then canonical type, then case-insensitive name"
  - "resolveFolder returns path as-is if it contains separator or is not uppercase"

patterns-established:
  - "Service caches own state (folderCache) rather than external cache service"
  - "Clear cache on mutating operations (create, delete, rename)"

# Metrics
duration: ~5min (verification of existing artifacts)
completed: 2026-02-01
---

# Phase 03 Plan 03: Folder Service Summary

**Standalone ImapFolderService with folder CRUD, RFC 6154 detection, 5-minute cache, and 21 unit tests**

## Performance

- **Duration:** ~5 min (verification only - artifacts existed from prior execution)
- **Started:** 2026-02-01T10:29:24Z
- **Completed:** 2026-02-01T10:35:00Z
- **Tasks:** 2 (verified)
- **Tests:** 21 passed

## Accomplishments

- ImapFolderService (306 lines) extracted with full folder operations
- RFC 6154 special-use detection with heuristic fallback for legacy servers
- 5-minute TTL cache for folder listings
- Unit tests (213 lines, 21 tests) covering all operations and edge cases

## Task Commits

Artifacts were committed in prior session:

1. **Task 1: Extract folder operations from driver** - `eefb93a` (bundled with pool service)
2. **Task 2: Create unit tests for folder service** - `eefb93a` (same commit)

**Jest globals fix:** `624e847` (test: add jest globals imports to imap driver specs)

## Files Created

- `backend/src/modules/email-sync/drivers/imap/services/imap-folder.service.ts` - Folder CRUD with caching
- `backend/src/modules/email-sync/drivers/imap/__tests__/imap-folder.spec.ts` - Unit tests for folder service

## Key Implementation Details

### ImapFolderService Methods

| Method | Purpose |
|--------|---------|
| `listFolders()` | List all folders with caching |
| `getFolder(id)` | Get folder by path, type, or name |
| `createFolder(name, parentId?)` | Create folder (clears cache) |
| `deleteFolder(id)` | Delete folder with RFC 3501 compliance |
| `renameFolder(id, newName)` | Rename folder (clears cache) |
| `resolveFolder(canonical)` | Map INBOX/SENT/etc to IMAP path |
| `pathToCanonicalFolder(path)` | Map IMAP path to canonical type |
| `clearCache()` | Manually invalidate folder cache |
| `isCacheValid()` | Check if cache is within TTL |

### Folder Cache Behavior

| Scenario | Result |
|----------|--------|
| First call to listFolders | Fetches from server, caches |
| Subsequent call within 5 min | Returns cached data |
| After create/delete/rename | Cache invalidated |
| After clearCache() | Cache invalidated |

### RFC 6154 Special-Use Detection

| IMAP Attribute | Canonical Type |
|----------------|----------------|
| `\Inbox` | INBOX |
| `\Sent` | SENT |
| `\Drafts` | DRAFTS |
| `\Trash` | TRASH |
| `\Junk` | SPAM |
| `\Archive` | ARCHIVE |
| `\Flagged` | STARRED |
| `\Important` | IMPORTANT |

### Heuristic Fallback (Legacy Servers)

When RFC 6154 attributes not present, folder names are matched case-insensitively:
- "Sent Items", "Sent Mail", "Posta inviata", "Gesendet" -> SENT
- "Deleted Items", "Trash", "Cestino", "Papierkorb" -> TRASH
- etc. (see canonical.types.ts IMAP_NAME_HEURISTICS)

## Test Coverage Summary

| Describe Block | Tests | Coverage |
|----------------|-------|----------|
| listFolders | 3 | Cache behavior, server call batching |
| getFolder | 4 | Path match, type match, name match, not found |
| resolveFolder | 4 | INBOX, SENT, path passthrough, separator detection |
| createFolder | 2 | Simple create, nested with parentId |
| deleteFolder | 1 | Delete with cache clear |
| renameFolder | 1 | Rename with cache clear |
| pathToCanonicalFolder | 3 | Cached lookup, heuristic fallback, path extraction |
| isCacheValid | 3 | Initial false, after list true, after clear false |

## Decisions Made

- Cache uses object with `folders` array and `cachedAt` timestamp for TTL calculation
- getFolder cascades through path -> type -> name matching for flexibility
- resolveFolder returns input unchanged if it looks like an IMAP path (contains `/` or is mixed case)

## Deviations from Plan

None - plan executed exactly as written. Artifacts existed from prior partial execution and passed all verification criteria.

## Issues Encountered

None - verification passed cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Folder service ready for use by ImapMessageService (03-04) via resolveFolder
- Folder service ready for wiring into ImapFacadeService (03-05)
- Cache invalidation patterns established for consistency across services

---
*Phase: 03-imap-driver-split*
*Plan: 03*
*Completed: 2026-02-01*
