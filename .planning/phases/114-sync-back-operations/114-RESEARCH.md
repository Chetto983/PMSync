# Phase 114: Sync-back Operations - Research

**Researched:** 2026-03-26
**Domain:** Email sync-back (local state changes propagated to Gmail, Outlook, IMAP)
**Confidence:** HIGH

## Summary

The sync-back infrastructure is already fully implemented across two parallel systems: a direct-call path (`EmailSyncBackService` used by `EmailCrudService`/`EmailBulkService`) and a BullMQ queue-based path (`SyncBackWorker` via `ProviderSyncBackQueueService` used by `BulkOperationsWorker`). All five requirement areas (mark-read/unread, star/unstar, move-to-folder, delete, label add/remove) have provider-specific implementations for Gmail, Microsoft, and IMAP.

The critical finding is that this is a **validation phase, not an implementation phase**. The code exists. The job is to verify it works against live providers, find bugs, and fix them in-place. One known gap: **SYNC-13 (label add/remove)** -- `bulkAddLabels` and `bulkRemoveLabels` in `EmailBulkService` do NOT call `emailSyncBack` at all, meaning label changes are local-only and never propagated to Gmail. This is a confirmed bug that must be fixed.

**Primary recommendation:** Write validation scripts that exercise each sync-back operation against all three providers, verify the remote state changed, then fix any bugs found in-place.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYNC-09 | Sync-back reflects mark-read/unread on all three providers | Direct path: `EmailCrudService.syncChangesToProvider` -> `EmailSyncBackService.syncOperationsBatch`. Bulk path: `EmailBulkService.bulkUpdateRead`. Gmail uses `batchModify` UNREAD label, Microsoft uses `PATCH isRead`, IMAP uses `\Seen` flag. All implemented. |
| SYNC-10 | Sync-back reflects star/unstar on all three providers | Direct: `syncChangesToProvider` maps `isStarred` -> star/unstar. Bulk: `bulkUpdateStarred`. Gmail uses STARRED label, Microsoft uses `flag.flagStatus`, IMAP uses `\Flagged`. All implemented. |
| SYNC-11 | Sync-back reflects move-to-folder on all three providers | Direct: `syncChangesToProvider` maps folder change -> `moveToFolder`. Bulk: `bulkMoveToFolder`. Gmail uses label add/remove, Microsoft uses `/move` endpoint, IMAP uses `messageMove` with COPY+DELETE fallback. All implemented. |
| SYNC-12 | Sync-back reflects delete (soft + permanent) on all three providers | Single: `EmailCrudService.deleteEmail` handles soft (move to trash) + hard (permanent delete). Bulk: `bulkDelete`. Gmail soft=TRASH label, hard=`messages.delete`/`batchDelete`. Microsoft soft=move to deleteditems, hard=DELETE. IMAP soft=move to Trash, hard=`messageDelete`. All implemented. |
| SYNC-13 | Sync-back reflects label add/remove on Gmail | **BUG FOUND:** `bulkAddLabels` and `bulkRemoveLabels` update the local `EmailLabel` join table but do NOT call `emailSyncBack.syncOperationsBatch()`. The Gmail provider-specific code supports `add-label`/`remove-label` operations in `SyncBackWorker` but this path is never triggered from the bulk service. Fix required: add sync-back calls to `bulkAddLabels`/`bulkRemoveLabels`. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Multi-tenant rule:** Every query MUST include `tenantId`
- **Post-edit validation:** Run `npx tsc --noEmit` after every edit
- **FOLLOW EXISTING PATTERNS:** Never invent new approaches when codebase patterns exist
- **SCOPE CONTROL:** Do exactly what was asked -- validation and bug fixes only
- **Bugs found during validation get fixed in-place** (from STATE.md decisions)
- **Provider pattern:** Interface > Factory > Implementation
- **Max 500 lines per file**

## Architecture Patterns

### Dual Sync-Back Systems

There are TWO independent sync-back code paths:

1. **Direct path** (used by HTTP endpoints):
   - `EmailCrudService.updateEmail()` -> `syncChangesToProvider()` -> `EmailSyncBackService.syncOperationsBatch()`
   - `EmailCrudService.deleteEmail()` -> `EmailSyncBackService.syncOperationToProvider()`
   - `EmailBulkService.bulkUpdate*()` -> `EmailSyncBackService.syncOperationsBatch()`
   - Fire-and-forget (`.catch()` swallows errors)
   - Uses per-email distributed lock (`sync-back:{emailId}`)

2. **Queue path** (used by BullMQ workers):
   - `BulkOperationsWorker` -> `ProviderSyncBackQueueService.enqueueSyncBack()` -> `SyncBackWorker.processJob()`
   - Has debounce, deduplication, progress tracking, DLQ
   - Uses per-provider+action distributed lock
   - Concurrency: 5, rate limit: 20/min, 5 retry attempts

Both paths implement the same provider operations independently (duplicated logic in `SyncBackWorker` vs `GmailSyncBackService`/`MicrosoftSyncBackService`/`ImapSyncBackService`).

### Operation Type Mapping

| Local Operation | `EmailSyncOperation.operation` | `SyncBackAction` (queue) |
|----------------|-------------------------------|--------------------------|
| Set isRead=true | `markRead` | `mark-read` |
| Set isRead=false | `markUnread` | `mark-unread` |
| Set isStarred=true | `star` | `star` |
| Set isStarred=false | `unstar` | `unstar` |
| Set isFlagged=true | `flag` | `flag` |
| Set isFlagged=false | `unflag` | `unflag` |
| Change folder | `moveToFolder` | `move` |
| Soft delete | `delete` | `delete` |
| Permanent delete | `hardDelete` | `delete` (permanent=true) |
| Add label | N/A (gap) | `add-label` |
| Remove label | N/A (gap) | `remove-label` |

Note the naming inconsistency: direct path uses camelCase (`markRead`), queue path uses kebab-case (`mark-read`).

### Provider-Specific Implementations

#### Gmail
- **Batch API:** `users.messages.batchModify` for label changes (up to 900 per call)
- **Permanent delete:** `users.messages.batchDelete` or `users.messages.delete`
- **Labels as folders:** Gmail uses labels (INBOX, TRASH, STARRED, UNREAD, etc.)
- **Move = label swap:** Remove old labels, add new label
- **Rate limit handling:** Exponential backoff on 429

#### Microsoft Graph
- **Batch API:** `/$batch` endpoint (max 20 requests per batch)
- **Flag/star:** Uses `flag.flagStatus: 'flagged'|'notFlagged'`
- **Move:** `POST /me/messages/{id}/move` with `destinationId`
- **Delete:** Soft = move to `deleteditems`, hard = `DELETE /me/messages/{id}`
- **Folder resolution:** Well-known map + DB lookup via `getMicrosoftFolderId()`

#### IMAP
- **Flags:** `\Seen` (read), `\Flagged` (star), `\Deleted` (delete)
- **Move:** `MOVE` command with `COPY+DELETE` fallback
- **Folder names:** DB lookup via `getImapFolderPath()` with fallback map
- **Connection per batch:** Creates new `ImapFlow` connection per operation batch
- **External ID format:** `folder:uid` (parsed to extract UID)

### Key File Map

| File | Purpose |
|------|---------|
| `email/types/sync-back.types.ts` | `EmailSyncOperation` interface |
| `email/services/email-sync-back.service.ts` | Facade: routes ops to provider services |
| `email/services/sync-back-orchestrator.service.ts` | Token refresh + batch grouping |
| `email/services/gmail-sync-back.service.ts` | Gmail API calls (googleapis) |
| `email/services/microsoft-sync-back.service.ts` | Graph API calls (@microsoft/microsoft-graph-client) |
| `email/services/imap-sync-back.service.ts` | IMAP commands (imapflow) |
| `email-sync/workers/sync-back.worker.ts` | BullMQ worker (parallel implementation) |
| `email-sync/services/provider-sync-back-queue.service.ts` | Queue service for enqueuing jobs |
| `email/services/email-crud.service.ts` | Single email CRUD (triggers direct sync-back) |
| `email/services/email-bulk.service.ts` | Bulk operations (triggers direct sync-back) |
| `email/controllers/email-actions.controller.ts` | HTTP endpoints for all operations |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gmail batch operations | Custom HTTP calls | `googleapis` npm package (`gmail.users.messages.batchModify`) | Already used throughout, handles auth headers |
| Microsoft batch | Custom fetch | `@microsoft/microsoft-graph-client` | Already used, handles serialization |
| IMAP commands | Raw socket | `imapflow` | Already used, handles IMAP protocol |
| Token refresh | Manual refresh logic | `SyncBackOrchestratorService.getValidAccessToken()` | Has distributed locking for race conditions |
| Rate limiting | Custom backoff | Existing `executeWithRetry()` in each provider service | Handles 429s with exponential backoff |

## Common Pitfalls

### Pitfall 1: Label sync-back is missing (SYNC-13 bug)
**What goes wrong:** Labels are added/removed locally but never propagated to Gmail
**Why it happens:** `bulkAddLabels`/`bulkRemoveLabels` in `EmailBulkService` create/delete `EmailLabel` records but skip the `emailSyncBack.syncOperationsBatch()` call
**How to avoid:** Add sync-back calls for Gmail-specific label operations
**Warning signs:** Labels appear in PMSync but not in Gmail web UI

### Pitfall 2: Two parallel sync-back implementations
**What goes wrong:** A fix applied to one path (direct) doesn't fix the other (queue)
**Why it happens:** `SyncBackWorker` has its own Gmail/Microsoft/IMAP implementations separate from the provider sub-services
**How to avoid:** When fixing bugs, check BOTH paths. Validation should test both.
**Warning signs:** Operation works via UI but not via BullMQ bulk operations

### Pitfall 3: IMAP folder name resolution
**What goes wrong:** Move/delete fails because folder name doesn't match server
**Why it happens:** IMAP servers have inconsistent folder names (Trash vs [Gmail]/Trash vs Deleted Messages)
**How to avoid:** Use `getImapFolderPath()` which does DB lookup + fallback
**Warning signs:** "folder not found" errors in IMAP sync-back logs

### Pitfall 4: Fire-and-forget error swallowing
**What goes wrong:** Sync-back fails silently, user thinks operation succeeded
**Why it happens:** All direct sync-back calls use `.catch()` that only logs
**How to avoid:** Validation must check remote state, not just local DB
**Warning signs:** Local state shows update, remote provider doesn't reflect it

### Pitfall 5: Gmail label vs folder semantics
**What goes wrong:** Moving to a folder on Gmail removes unrelated labels
**Why it happens:** Gmail's `moveToFolder` implementation removes all non-immutable labels before adding the target
**How to avoid:** The code preserves UNREAD, STARRED, IMPORTANT, SENT, DRAFT -- but custom labels (Label_*) may get removed on move
**Warning signs:** Custom labels disappear when moving emails between folders

### Pitfall 6: ExternalId format differences
**What goes wrong:** Operations fail because externalId is empty or wrong format
**Why it happens:** Gmail uses message ID strings, Microsoft uses Graph message IDs, IMAP uses `folder:uid` format
**How to avoid:** Validation checks for `externalId` existence before sync-back
**Warning signs:** "Invalid externalId" errors in logs

## Code Examples

### How single email update triggers sync-back (existing pattern)
```typescript
// Source: email/services/email-crud.service.ts:293
this.syncChangesToProvider(updated, data).catch((error) => {
  this.logger.error(`Failed to sync email update to provider: ${error.message}`);
});
```

### How bulk operations trigger sync-back (existing pattern)
```typescript
// Source: email/services/email-bulk.service.ts:118
const operations = emails.map((email) => ({
  emailId: email.id,
  externalId: email.externalId,
  providerId: email.providerId,
  tenantId: email.tenantId,
  operation: isRead ? ('markRead' as const) : ('markUnread' as const),
  sourceFolder: email.folder,
}));

this.emailSyncBack.syncOperationsBatch(operations).catch((error) => {
  this.logger.error(`Failed to sync bulk read update to provider: ${error.message}`);
});
```

### SYNC-13 fix pattern (label sync-back to Gmail)
```typescript
// Pattern to add to bulkAddLabels/bulkRemoveLabels:
// Only sync to Gmail providers (IMAP doesn't support labels natively)
const gmailEmails = emails.filter(e => /* provider is Google */);
if (gmailEmails.length > 0) {
  const operations = gmailEmails.flatMap(email =>
    labelIds.map(labelId => ({
      emailId: email.id,
      externalId: email.externalId,
      providerId: email.providerId,
      tenantId: email.tenantId,
      operation: 'add-label' as const, // or 'remove-label'
      // Note: Need to map local labelId to Gmail label ID
    }))
  );
  // ... but need Gmail-specific label ID, not local UUID
}
```

### Critical consideration for SYNC-13
The `EmailSyncOperation` type uses `operation: 'markRead' | 'markUnread' | 'star' | ...` but does NOT include `add-label` or `remove-label`. The queue-based `SyncBackAction` type DOES include them. The direct path would need:
1. Add `'addLabel' | 'removeLabel'` to `EmailSyncOperation.operation`
2. Handle it in `GmailSyncBackService.syncToGmail()` and `syncGmailBatch()`
3. Map local `UserLabel.id` to Gmail label external ID (stored where?)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single god-file (1429 lines) | Facade + 4 sub-services | Phase 43 | Better maintainability |
| Individual sync per email | Batch operations per provider | Phase 4 consolidation | Fewer API calls |
| No rate limiting | Exponential backoff on 429 | Current | Handles Gmail/MS throttling |

## Open Questions

1. **Gmail label ID mapping for SYNC-13**
   - What we know: Local labels use UUIDs (`UserLabel.id`). Gmail uses label IDs like `Label_123`.
   - What's unclear: Where is the Gmail label external ID stored? Is there a `UserLabel.externalId` or similar mapping field?
   - Recommendation: Check Prisma schema for `UserLabel` model to find external ID storage. If missing, need to add it.

2. **Queue vs Direct path: which to validate?**
   - What we know: HTTP endpoints use direct path. BullMQ bulk operations use queue path.
   - What's unclear: Are both paths exercised in production? Should we test both?
   - Recommendation: Focus validation on the direct path (HTTP endpoints) since that's what users trigger. Queue path is secondary.

3. **IMAP move operation changes UID**
   - What we know: IMAP MOVE/COPY gives the message a new UID in the destination folder
   - What's unclear: Does the code update `externalId` after a move? If not, subsequent operations on the moved message will fail
   - Recommendation: Check if IMAP move updates the email's `externalId` in the database

## Validation Strategy

### Per-requirement validation approach

**SYNC-09 (mark-read/unread):**
1. Select an email with known externalId for each provider
2. Call `PATCH /emails/:id` with `{ isRead: true }`
3. Verify on provider: Gmail check UNREAD label removed, MS check `isRead`, IMAP check `\Seen` flag
4. Reverse: set `isRead: false`, verify UNREAD label added back

**SYNC-10 (star/unstar):**
1. Call `PATCH /emails/:id` with `{ isStarred: true }`
2. Verify: Gmail STARRED label, MS `flag.flagStatus === 'flagged'`, IMAP `\Flagged`
3. Reverse with `{ isStarred: false }`

**SYNC-11 (move-to-folder):**
1. Call `PATCH /emails/:id` with `{ folder: 'TRASH' }` (or other folder)
2. Verify message moved on provider
3. Test edge cases: archive (Gmail = remove INBOX), move between custom folders

**SYNC-12 (delete):**
1. Soft delete: `DELETE /emails/:id` on non-deleted email -> verify moved to Trash on provider
2. Hard delete: `DELETE /emails/:id` on already-deleted email -> verify permanently removed from provider
3. Bulk delete: `DELETE /emails/bulk` with multiple IDs

**SYNC-13 (label add/remove - Gmail only):**
1. First fix the missing sync-back in `bulkAddLabels`/`bulkRemoveLabels`
2. Call `PATCH /emails/bulk/labels/add` with Gmail label IDs
3. Verify label appears on message in Gmail
4. Remove label and verify

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `backend/src/modules/email/services/` -- all sync-back services read directly
- Codebase analysis: `backend/src/modules/email-sync/workers/sync-back.worker.ts` -- queue-based implementation read
- Codebase analysis: `backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts` -- queue service read

### Secondary (MEDIUM confidence)
- Gmail API: `batchModify`, `batchDelete` endpoints -- documented in googleapis
- Microsoft Graph API: `/$batch`, `/move`, `PATCH` -- documented in @microsoft/microsoft-graph-client
- IMAP: ImapFlow `messageFlagsAdd`, `messageMove`, `messageDelete` -- documented in imapflow

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies needed
- Architecture: HIGH -- code read directly, both sync-back paths fully understood
- Pitfalls: HIGH -- identified from actual code analysis, not speculation
- SYNC-13 bug: HIGH -- confirmed by reading `bulkAddLabels`/`bulkRemoveLabels` source code (no sync-back calls present)

**Research date:** 2026-03-26
**Valid until:** 2026-04-26 (stable -- infrastructure unchanged)
