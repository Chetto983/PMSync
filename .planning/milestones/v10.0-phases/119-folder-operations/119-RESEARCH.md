# Phase 119: Folder Operations - Research

**Researched:** 2026-03-30
**Domain:** Email folder CRUD + provider sync validation (Gmail, Outlook, IMAP)
**Confidence:** HIGH

## Summary

Phase 119 validates folder CRUD operations (create, rename, delete) against all three providers (Gmail, Microsoft/Outlook, IMAP) and verifies that folder sync from providers detects external changes. The entire backend infrastructure already exists and is fully wired: BullMQ queue (`FOLDER_OPERATIONS`), worker (`FolderOperationsWorker`), queue service (`FolderOperationsQueueService`), controller endpoints (`FoldersController`), driver implementations for all three providers, and folder sync services for each provider type.

This is a **validation-only phase** -- no new feature code is needed. The work is: (1) write a validation script following the established `validate-*.mjs` pattern, (2) run it against live providers, (3) fix any bugs found in-place.

**Primary recommendation:** Create `scripts/lib/validate-folder-ops.mjs` and `scripts/validate-folder-ops.mjs` following the exact pattern of `validate-drafts-bulk.mjs`. Test create/rename/delete on each provider, verify sync-from-provider, and confirm system folder protection. Fix bugs in-place.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOLD-01 | Create folder via BullMQ queue succeeds on all three providers | Controller `POST /folders` queues via `FolderOperationsQueueService.addCreateFolderJob()`, worker processes via `IEmailDriver.createFolder()`. All 3 drivers implement createFolder. |
| FOLD-02 | Rename folder updates both local DB and provider | Controller `PATCH /folders/:folderId` queues via `addRenameFolderJob()`, worker calls `driver.renameFolder()` then updates DB path/name. System folder guard uses `isSystemFolder()`. |
| FOLD-03 | Delete folder removes from provider and cleans up local records | Controller `DELETE /folders/:folderId` queues via `addDeleteFolderJob()`, worker calls `driver.deleteFolder()` then `prisma.folder.delete()`. `FolderSyncService.deleteFolder()` also moves emails to TRASH before deletion. |
| FOLD-04 | Folder sync from provider reflects external changes | `POST /folders/sync/:providerId` triggers `FolderSyncService.syncProviderFolders()` which routes to Gmail/Microsoft/IMAP sync. Each detects new folders (upsert), renamed folders (name update), and deleted folders (deleteMany for removed paths). |
| FOLD-05 | System folders protected from delete/rename | `isSystemFolder()` checks against `SYSTEM_LABEL_IDS` set. Controller checks `specialUse` before rename. Worker checks against hardcoded system folder list before delete. `CORE_SYSTEM_FOLDERS` constant used in `FolderSyncService.deleteFolder()`. |
</phase_requirements>

## Standard Stack

No new dependencies needed. All infrastructure exists.

### Core (Existing)
| Library | Purpose | Location |
|---------|---------|----------|
| BullMQ | Queue for folder operations | `QUEUE_NAMES.FOLDER_OPERATIONS` |
| Prisma | DB access for Folder model | Folder model with `@@unique([providerId, path])` |
| googleapis | Gmail label CRUD | `gmail.users.labels.*` |
| axios | Microsoft Graph API calls | `https://graph.microsoft.com/v1.0/me/mailFolders` |
| imapflow (via ImapService) | IMAP mailboxCreate/Rename/Delete | `client.mailboxCreate/Rename/Delete` |

### Validation (Existing Pattern)
| Tool | Purpose |
|------|---------|
| Playwright (Edge CDP) | Browser-connected validation |
| `scripts/lib/validation-helpers.mjs` | Auth cookies, CSRF, reporting |

## Architecture Patterns

### Existing Request Flow (All 3 Operations)

```
HTTP Request (Controller)
  -> Validate tenant ownership + system folder guard
  -> FolderOperationsQueueService.addXxxJob()
  -> BullMQ queue (FOLDER_OPERATIONS)
  -> FolderOperationsWorker.processJob()
    -> EmailDriverFactory.createConnectedDriver()
    -> driver.createFolder/renameFolder/deleteFolder()
    -> Update Prisma DB
    -> Emit realtime event (Socket.IO)
  -> Controller polls job result (waitForJob, 30s timeout)
  -> Return result to client
```

### Two Code Paths for Folder CRUD (Critical Finding)

There are **two parallel code paths** for folder CRUD:

1. **Worker path** (via `FolderOperationsWorker`): Used by controller endpoints (`POST /folders`, `PATCH /folders/:folderId`, `DELETE /folders/:folderId`). Creates a driver via `EmailDriverFactory`, calls `IEmailDriver` methods, then does its own DB save logic.

2. **Service path** (via `FolderSyncService`): Has its own `createFolder()`, `renameFolder()`, `deleteFolder()` methods that route directly to provider-specific services (GmailFolderService, MicrosoftFolderService, ImapFolderSyncService) WITHOUT using the driver factory or BullMQ queue.

The **controller uses path 1** (queue + worker). Path 2 exists but is not called from any controller endpoint for CRUD -- it's only used internally (e.g., folder sync facade). This is important: validation must test path 1 (the actual user-facing flow).

### Folder Sync (FOLD-04) Flow

```
POST /folders/sync/:providerId
  -> FolderSyncService.syncProviderFolders()
  -> routeSync() based on providerType:
    - google: GmailFolderService.syncFolders() -> lists labels, upserts, deletes missing
    - microsoft: MicrosoftFolderService.syncMicrosoftFolders() -> lists folders via Graph, upserts, deletes missing
    - imap: ImapFolderSyncService.syncImapFolders() -> lists mailboxes, syncs to DB
```

### System Folder Protection (FOLD-05)

Multiple layers of protection:
- **Controller**: Checks `folder.specialUse && isSystemFolder(folder.specialUse)` before queuing rename/delete
- **Worker**: Checks `systemFolders.includes(folder.specialUse)` before executing delete (hardcoded list)
- **FolderSyncService.deleteFolder()**: Checks `CORE_SYSTEM_FOLDERS.includes(folder.specialUse)`
- **`isSystemFolder()`**: Checks against `SYSTEM_LABEL_IDS` set (comprehensive, includes Gmail categories, star variants)

### Anti-Patterns to Avoid
- **Testing path 2 instead of path 1**: The validation MUST test the actual HTTP endpoints, not call service methods directly
- **Assuming folder path format is consistent**: Gmail uses label IDs (e.g., `Label_xxx`), Microsoft uses opaque folder IDs, IMAP uses path strings

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Folder validation script | New script pattern | Copy `validate-drafts-bulk.mjs` pattern | Established pattern with auth, CSRF, reporting |
| System folder detection | Custom list | `isSystemFolder()` from `canonical.types.ts` | Already has comprehensive set of 30+ system labels |
| Error classification | Custom error handling | `FolderOperationError` + `classifyFolderError()` | Already handles timeout, not-found, permission, circuit-breaker |

## Common Pitfalls

### Pitfall 1: Delete Folder Does Not Clean Up Email Associations (Worker Path)
**What goes wrong:** The worker's `processDeleteFolder()` calls `driver.deleteFolder()` then `prisma.folder.delete()` but does NOT move emails to TRASH first. The service path (`FolderSyncService.deleteFolder()`) DOES move emails to TRASH. This means if emails exist in the folder and the controller's delete endpoint is used, emails will have an orphaned `folder` value pointing to a non-existent folder.
**Why it happens:** Two parallel code paths with different cleanup logic.
**How to avoid:** The validation should test this scenario explicitly (create folder, move email into it, delete folder, verify email.folder is updated).
**Warning signs:** Emails with a `folder` value that doesn't match any Folder record.

### Pitfall 2: Gmail Label Path vs External ID Mismatch
**What goes wrong:** The worker uses `folder.externalId || folder.path` as the ID for driver calls. For Gmail, the worker's `processCreateFolder()` saves the folder with `externalId: createdFolder.id` (the Gmail label ID like `Label_xxx`) and `path: createdFolder.path` (also the label ID for Gmail). But `processRenameFolder()` and `processDeleteFolder()` look up the folder by `providerId_path` unique key, which for Gmail is the label ID. If the sync service previously stored the folder with `path: labelName` (the display name, not the ID), the lookup will fail.
**Why it happens:** `GmailFolderService.labelIdToFolderPath()` maps custom labels to their display name for `path`, but `createGmailFolder()` returns `{ path: labelId }`.
**How to avoid:** Verify that after creating a Gmail label, the DB folder record has consistent `path` and `externalId` values, and that rename/delete can find it.
**Warning signs:** "Folder not found" errors on rename/delete for Gmail custom labels.

### Pitfall 3: IMAP Folder Delete Requires Empty Folder
**What goes wrong:** Some IMAP servers refuse to delete non-empty folders. The `ImapFolderService.deleteFolder()` handles this by emptying the folder first (Step 3), but errors in any step are caught and logged as debug, not thrown. If Step 3 fails silently and Step 5 also fails, the circuit breaker kicks in.
**Why it happens:** Different IMAP servers have different requirements for folder deletion.
**How to avoid:** Test with a folder that has emails in it. The worker should ideally move emails before deleting.
**Warning signs:** Circuit breaker errors, "not empty" errors.

### Pitfall 4: Rename Does Not Update Email.folder References
**What goes wrong:** When a folder is renamed, the worker updates `Folder.name` and `Folder.path` in the DB, but does NOT update `Email.folder` for emails in that folder. Emails will have the old folder path, and folder-based queries will no longer match them.
**Why it happens:** The rename operation only updates the Folder record, not the Email records.
**How to avoid:** After rename validation, check that `Email.folder` values are updated. If not, this is a bug to fix.
**Warning signs:** Emails "disappear" from a renamed folder in the UI.

### Pitfall 5: Microsoft Folder Sync Doesn't Fetch Child Folders
**What goes wrong:** `syncMicrosoftFolders()` calls `GET /me/mailFolders` which only returns top-level folders. Child folders require `GET /me/mailFolders/{id}/childFolders` calls. Externally created nested folders may not be detected.
**Why it happens:** Microsoft Graph API pagination for nested folders is separate.
**How to avoid:** Test FOLD-04 with a nested folder created externally on Outlook.
**Warning signs:** Nested folders not appearing after sync.

## Code Examples

### API Endpoints (Existing)
```
POST   /api/v1/folders              # Create folder (body: { name, providerId, parentPath? })
PATCH  /api/v1/folders/:folderId    # Rename/move folder (body: { newName?, parentId? })
DELETE /api/v1/folders/:folderId    # Delete folder
GET    /api/v1/folders              # List all folders
GET    /api/v1/folders/provider/:id # List folders for provider
POST   /api/v1/folders/sync/:id    # Sync folders from provider
GET    /api/v1/folders/metadata     # Canonical folder type metadata
```

### Validation Script Pattern (from validate-drafts-bulk.mjs)
```javascript
// scripts/validate-folder-ops.mjs
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateFolderOps } from './lib/validate-folder-ops.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1] || 'all';

async function main() {
  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  const results = await validateFolderOps(context, finalCookies, csrfToken, { provider: providerFlag });
  const exitCode = report('Folder Operations Validation', results);
  await browser.close();
  process.exit(exitCode);
}
main().catch(err => { console.error('Fatal error:', err.message); process.exit(1); });
```

### Test Sequence per Provider
```javascript
// For each provider:
// 1. FOLD-01: Create folder
//    POST /api/v1/folders { name: "Test-Folder-{timestamp}", providerId }
//    Verify: 201 response, folder appears in GET /folders/provider/:id
//
// 2. FOLD-02: Rename folder
//    PATCH /api/v1/folders/:folderId { newName: "Renamed-{timestamp}" }
//    Verify: 200 response, name updated in GET response
//
// 3. FOLD-03: Delete folder
//    DELETE /api/v1/folders/:folderId
//    Verify: 200 response, folder gone from GET response
//
// 4. FOLD-04: Sync from provider
//    Create folder externally (or use provider-specific API)
//    POST /api/v1/folders/sync/:providerId
//    Verify: new folder appears in GET response
//
// 5. FOLD-05: System folder protection
//    Find a system folder (specialUse: INBOX, SENT, TRASH, DRAFTS)
//    DELETE /api/v1/folders/:systemFolderId -> expect 400
//    PATCH /api/v1/folders/:systemFolderId { newName: "bad" } -> expect 400
```

## State of the Art

| Component | Status | Notes |
|-----------|--------|-------|
| FoldersController | Complete | All CRUD endpoints, queue integration, system folder guards |
| FolderOperationsQueueService | Complete | BullMQ queue with dedup, metrics, job waiting |
| FolderOperationsWorker | Complete | BaseWorker, distributed locking, all 3 operations |
| GmailFolderService CRUD | Complete | createGmailFolder, renameGmailFolder, deleteGmailFolder |
| MicrosoftFolderService CRUD | Complete | createMicrosoftFolder, renameMicrosoftFolder, deleteMicrosoftFolder |
| ImapFolderSyncService CRUD | Complete | createImapFolder, renameImapFolder, deleteImapFolder |
| IEmailDriver folder methods | Complete | All 3 drivers implement createFolder/renameFolder/deleteFolder |
| Folder sync (all providers) | Complete | syncGmailFolders, syncMicrosoftFolders, syncImapFolders |
| System folder protection | Complete | isSystemFolder(), CORE_SYSTEM_FOLDERS, SYSTEM_LABEL_IDS |

**Known bugs to investigate during validation:**
1. Worker delete path doesn't move emails to TRASH (Pitfall 1)
2. Rename doesn't update Email.folder references (Pitfall 4)
3. Gmail label path consistency between create and sync (Pitfall 2)
4. Microsoft nested folder sync (Pitfall 5)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (Edge CDP) + custom validation helpers |
| Config file | `scripts/lib/validation-helpers.mjs` |
| Quick run command | `node scripts/validate-folder-ops.mjs --provider=gmail` |
| Full suite command | `node scripts/validate-folder-ops.mjs` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOLD-01 | Create folder on all providers | integration | `node scripts/validate-folder-ops.mjs` | No - Wave 0 |
| FOLD-02 | Rename folder on all providers | integration | `node scripts/validate-folder-ops.mjs` | No - Wave 0 |
| FOLD-03 | Delete folder + cleanup | integration | `node scripts/validate-folder-ops.mjs` | No - Wave 0 |
| FOLD-04 | Sync from provider detects changes | integration | `node scripts/validate-folder-ops.mjs` | No - Wave 0 |
| FOLD-05 | System folder protection | integration | `node scripts/validate-folder-ops.mjs` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `node scripts/validate-folder-ops.mjs --provider=gmail`
- **Per wave merge:** `node scripts/validate-folder-ops.mjs`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/lib/validate-folder-ops.mjs` -- covers FOLD-01 through FOLD-05
- [ ] `scripts/validate-folder-ops.mjs` -- orchestrator entry point

## Open Questions

1. **Email cleanup on folder delete (worker path)**
   - What we know: `FolderSyncService.deleteFolder()` moves emails to TRASH before provider delete. The worker's `processDeleteFolder()` does NOT.
   - What's unclear: Is this intentional (assume provider handles email relocation) or a bug?
   - Recommendation: Validate behavior. If emails become orphaned, fix the worker to move emails to TRASH before delete.

2. **Email.folder update on rename**
   - What we know: Neither the worker nor the service path updates `Email.folder` when a folder is renamed.
   - What's unclear: Does the next sync fix this, or do emails remain orphaned until manual intervention?
   - Recommendation: Validate. If emails disappear after rename, add `Email.updateMany` to the rename flow.

3. **Microsoft nested folder sync**
   - What we know: `GET /me/mailFolders` only returns top-level. Child folders require separate API calls.
   - What's unclear: Does `syncMicrosoftFolders()` handle nested folders at all?
   - Recommendation: Test with a nested folder. If not synced, may need `$expand=childFolders` or recursive fetch. This could be deferred if no nested folders are expected in typical usage.

## Environment Availability

> All dependencies are existing infrastructure -- no new tools needed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Redis | BullMQ queue | Assumed available (existing infra) | -- | -- |
| PostgreSQL | Prisma ORM | Assumed available (Railway) | -- | -- |
| Gmail API | FOLD-01/02/03/04 | Requires active Google provider | -- | Skip with warning |
| Microsoft Graph | FOLD-01/02/03/04 | Requires active Microsoft provider | -- | Skip with warning |
| IMAP server | FOLD-01/02/03/04 | Requires active IMAP provider | -- | Skip with warning |
| Edge CDP (port 9222) | Validation script | Requires manual launch | -- | -- |

## Project Constraints (from CLAUDE.md)

- Multi-tenant: Every query MUST include `tenantId`
- Provider pattern: Interface > Factory > Implementation
- Post-edit validation: `cd backend && npx tsc --noEmit` after every file edit
- Max 500 lines per file
- Bugs found during validation get fixed in-place within the same phase
- Follow existing patterns (validate-*.mjs scripts)
- No frontend UI testing (focus is backend API + provider integration per REQUIREMENTS.md)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `folders.controller.ts` (891 lines, full CRUD + queue endpoints)
- Codebase analysis: `folder-operations.worker.ts` (464 lines, BullMQ worker)
- Codebase analysis: `folder-operations-queue.service.ts` (380 lines, queue management)
- Codebase analysis: `folder-sync.service.ts` (266 lines, sync facade)
- Codebase analysis: `gmail-folder.service.ts` (585 lines, Gmail label CRUD + sync)
- Codebase analysis: `microsoft-folder.service.ts` (447 lines, Graph API folder CRUD + sync)
- Codebase analysis: `imap-folder-sync.service.ts` (375 lines, IMAP folder CRUD + sync)
- Codebase analysis: `email-driver.interface.ts` (IEmailDriver contract)
- Codebase analysis: `canonical.types.ts` (SYSTEM_LABEL_IDS, isSystemFolder, CORE_SYSTEM_FOLDERS)
- Codebase analysis: `folder-errors.ts` (FolderOperationError, classifyFolderError)
- Codebase analysis: Prisma schema `Folder` model
- Codebase analysis: `imap-folder.service.ts` (IMAP driver folder operations with circuit breaker)

### Secondary (MEDIUM confidence)
- Pattern analysis from `validate-drafts-bulk.mjs` and `validation-helpers.mjs`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All infrastructure exists and is fully implemented
- Architecture: HIGH - Read all source files, both code paths identified
- Pitfalls: HIGH - Derived from direct source code analysis of actual logic gaps

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- no external dependencies changing)
