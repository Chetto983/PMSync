# Phase 118: Drafts & Bulk Operations - Research

**Researched:** 2026-03-30
**Domain:** Draft CRUD lifecycle and bulk email operations validation across Gmail, Outlook, IMAP
**Confidence:** HIGH

## Summary

Phase 118 is a **validation phase**, not an implementation phase. Both the draft lifecycle (create/update/retrieve/delete) and all bulk operations (mark-read/unread, move-to-folder, delete, label add/remove) are fully implemented in the backend. The code paths are mature: `EmailCrudService` handles draft CRUD with provider sync via `saveDraftToProvider()`, and `EmailBulkService` handles all bulk mutations with sync-back via `EmailSyncBackService.syncOperationsBatch()`.

The validation approach follows the established Phase 112-117 pattern: write `.mjs` validation scripts using Playwright CDP for cookie-based auth against the Railway production backend, exercise each API endpoint, verify local DB state changes, and confirm sync-back fires (provider-side verification is manual checkpoint).

One potential bug identified: **`deleteDraft()` does NOT delete the draft from the provider**. It deletes from the local DB and cleans up S3 attachments, but never calls `driver.deleteMessage()` for the provider-side draft. This means deleted drafts persist on Gmail/Outlook/IMAP until the next sync overwrites them. This needs validation and likely a fix for WRITE-06.

**Primary recommendation:** Write two validation scripts (drafts + bulk ops) following the Phase 117 pattern. Validate all 5 requirements against live providers. Fix the deleteDraft provider-sync gap if confirmed. Bulk operations reuse the sync-back infrastructure already validated in Phase 114, so the focus is on verifying the bulk API layer works correctly.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WRITE-06 | Draft create/update/retrieve/delete lifecycle works per provider | `POST /api/v1/emails/drafts` -> `EmailCrudService.saveDraft()` -> `saveDraftToProvider()` -> `driver.saveDraft()`. `GET /api/v1/emails/drafts/:id` -> `getDraft()`. `DELETE /api/v1/emails/drafts/:id` -> `deleteDraft()`. All three drivers implement `saveDraft()` and `sendDraft()`. **Gap: deleteDraft does not call provider deleteMessage.** |
| WRITE-07 | Bulk mark-read/unread updates DB and triggers sync-back | `PATCH /api/v1/emails/bulk/read` -> `EmailBulkService.bulkUpdateRead()` -> DB updateMany + `syncOperationsBatch()` with markRead/markUnread ops. Validated individually in Phase 114 (SYNC-09); this validates the bulk wrapper. |
| WRITE-08 | Bulk move-to-folder updates DB and triggers sync-back | `PATCH /api/v1/emails/bulk/move` -> `EmailBulkService.bulkMoveToFolder()` -> DB updateMany + `syncOperationsBatch()` with moveToFolder ops + folder count updates. Validated individually in Phase 114 (SYNC-11); this validates the bulk wrapper. |
| WRITE-09 | Bulk delete (soft) updates DB and triggers sync-back | `DELETE /api/v1/emails/bulk` -> `EmailBulkService.bulkDelete()` -> transaction: soft-delete (isDeleted=true, folder=trash) or hard-delete (DB delete). Sync-back with delete/hardDelete ops. Validated individually in Phase 114 (SYNC-12); this validates the bulk wrapper. |
| WRITE-10 | Bulk label add/remove works on Gmail | `PATCH /api/v1/emails/bulk/labels/add` and `/remove` -> `EmailBulkService.bulkAddLabels()`/`bulkRemoveLabels()` -> createMany/deleteMany on EmailLabel + `syncLabelOperationsToProviders()` (Gmail-only via Folder.externalId lookup). Validated individually in Phase 114 (SYNC-13); this validates the bulk wrapper. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Multi-tenant rule:** Every query MUST include `tenantId` -- validation scripts must verify this
- **Post-edit validation:** After every file edit, run `npx tsc --noEmit` for the affected project
- **Follow existing patterns:** Use the established validation script pattern from Phases 112-117
- **Scope control:** Validation and bug fixes only -- no new features, no refactors
- **Frontend UI testing is OUT OF SCOPE** per REQUIREMENTS.md
- **Max 500 lines per file**
- **Provider pattern:** Interface > Factory > Implementation
- **Bugs found during validation get fixed in-place** (from STATE.md decisions)
- **Email consolidation:** Before any email module changes, read `backend/docs/EMAIL_CONSOLIDATION_ENTRY.md` first
- **IMAP/SMTP blocked on Railway** (ports 465/587 blocked -- WRITE-03 precedent from Phase 117)

## Standard Stack

This is a validation phase. No new libraries are needed.

### Core (existing, used by validation scripts)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| Playwright | CDP connection to Edge for cookie-based auth | Established in Phase 112, all validation scripts use it |
| Node.js fetch (via context.request) | HTTP calls to backend API | Used by validation-helpers.mjs |

### Validation Infrastructure (already exists)
| File | Purpose |
|------|---------|
| `scripts/lib/validation-helpers.mjs` | CDP connect, auth cookies, CSRF token, API helpers (apiGet, apiPost, apiPatch, apiDelete), assertions (assertEqual, assertTrue, assertRange), report |
| `scripts/validate-email-send.mjs` | Phase 117 orchestrator pattern to follow |
| `scripts/lib/validate-email-send.mjs` | Phase 117 per-provider validation module pattern |
| `scripts/validate-syncback.mjs` | Phase 114 orchestrator pattern (sync-back ops) |
| `scripts/lib/validate-syncback.mjs` | Phase 114 validation logic (mark-read, star, move, delete, labels) |

### Backend Infrastructure (already exists)
| File | Purpose |
|------|---------|
| `backend/src/modules/email/controllers/email-actions.controller.ts` | All endpoints: `POST /emails/drafts`, `GET /emails/drafts/:id`, `DELETE /emails/drafts/:id`, `PATCH /emails/bulk/read`, `PATCH /emails/bulk/move`, `DELETE /emails/bulk`, `PATCH /emails/bulk/labels/add`, `PATCH /emails/bulk/labels/remove` |
| `backend/src/modules/email/services/email-crud.service.ts` | Draft CRUD: `saveDraft()`, `getDraft()`, `deleteDraft()`, `saveDraftToProvider()` |
| `backend/src/modules/email/services/email-bulk.service.ts` | Bulk ops: `bulkUpdateRead()`, `bulkMoveToFolder()`, `bulkDelete()`, `bulkAddLabels()`, `bulkRemoveLabels()` |
| `backend/src/modules/email/services/email-sync-back.service.ts` | `syncOperationsBatch()` -- fire-and-forget sync to provider |
| `backend/src/modules/email/dto/bulk-operations.dto.ts` | DTOs with class-validator: BulkDeleteDto, BulkUpdateReadDto, BulkMoveToFolderDto, BulkLabelsDto |
| `backend/src/modules/email/dto/send-email.dto.ts` | SaveDraftDto with validation |

## Architecture Patterns

### Draft Lifecycle Flow

```
Client -> POST /api/v1/emails/drafts (SaveDraftDto)
  -> EmailActionsController.saveDraft()
    -> EmailCrudService.saveDraft(tenantId, dto)
      -> Validate provider is active + supportsEmail
      -> If dto.id: look up existing draft (must exist, isDraft=true)
      -> saveDraftToProvider(tenantId, provider, dto, existingExternalId)
        -> Get access token (OAuth2 or SMTP password)
        -> Create connected driver
        -> Build ComposeMessage from dto
        -> driver.saveDraft(composeMessage, existingExternalId?)
          Gmail: users.drafts.create/update with MIME body
          Microsoft: POST /me/messages (create) or PATCH /me/messages/:id (update)
          IMAP: Build MIME via MimeBuilder, IMAP APPEND to Drafts folder
        -> Returns provider draft ID
      -> Resolve draftsFolder path via getDraftsFolderPath()
      -> Upsert Email record in DB (isDraft=true, folder=draftsFolder)
      -> Return draft record

Client -> GET /api/v1/emails/drafts/:id
  -> EmailCrudService.getDraft(id, tenantId)
    -> findFirst where isDraft=true
    -> Return draft record or 404

Client -> DELETE /api/v1/emails/drafts/:id
  -> EmailCrudService.deleteDraft(id, tenantId)
    -> Find draft with S3 attachments
    -> Cancel embedding queue job
    -> Delete from DB (hard delete)
    -> Clean up S3 attachments
    -> **DOES NOT delete from provider** <-- potential bug
```

### Bulk Operations Flow (all ops follow same pattern)

```
Client -> PATCH /api/v1/emails/bulk/read (BulkUpdateReadDto)
  -> EmailBulkService.bulkUpdateRead(emailIds, tenantId, isRead)
    -> validateBulkInput (1-1000 IDs)
    -> Fetch emails with select: id, externalId, providerId, tenantId, folder
    -> ensureProvidersActive for all unique providerIds
    -> DB updateMany (isRead=value)
    -> Update folder counts (async, fire-and-forget)
    -> Build sync operations array (one per email)
    -> syncOperationsBatch(operations) (async, fire-and-forget)
    -> Fetch updated emails with full relations
    -> Emit realtime events per email
    -> Return { updated: count, emails: updatedEmails }
```

### Provider-Specific Draft Details

| Provider | Create | Update | Delete on Provider | Drafts Folder |
|----------|--------|--------|-------------------|---------------|
| Gmail | `users.drafts.create` with base64url MIME | `users.drafts.update` with same draft ID | NOT IMPLEMENTED | Auto (DRAFT label) |
| Microsoft | `POST /me/messages` (creates in Drafts) | `PATCH /me/messages/:id` | NOT IMPLEMENTED | Auto (Drafts folder) |
| IMAP | IMAP APPEND to Drafts folder with `\Draft` flag | Delete old + APPEND new (IMAP has no update-in-place) | NOT IMPLEMENTED | Resolved via `resolveFolder('DRAFTS')` |

### Bulk Operation Endpoints

| Endpoint | HTTP Method | DTO | Service Method | Sync-Back Operation |
|----------|------------|-----|----------------|---------------------|
| `/emails/bulk/read` | PATCH | BulkUpdateReadDto | bulkUpdateRead | markRead / markUnread |
| `/emails/bulk/star` | PATCH | BulkUpdateStarDto | bulkUpdateStarred | star / unstar |
| `/emails/bulk/flag` | PATCH | BulkUpdateFlagDto | bulkUpdateFlagged | flag / unflag |
| `/emails/bulk/move` | PATCH | BulkMoveToFolderDto | bulkMoveToFolder | moveToFolder |
| `/emails/bulk` | DELETE | BulkDeleteDto | bulkDelete | delete / hardDelete |
| `/emails/bulk/labels/add` | PATCH | BulkLabelsDto | bulkAddLabels | addLabel (Gmail only) |
| `/emails/bulk/labels/remove` | PATCH | BulkLabelsDto | bulkRemoveLabels | removeLabel (Gmail only) |

### Anti-Patterns to Avoid
- **Testing only the happy path:** Bulk ops have edge cases around mixed providers (emails from Gmail + Outlook in same batch). Validate this.
- **Assuming sync-back succeeded:** Sync-back is fire-and-forget. Validation can only confirm the local DB state changed and the sync call was made. Provider-side verification is manual.
- **Ignoring DTO validation:** The DTOs cap emailIds at 500 (ArrayMaxSize) but the service caps at 1000 (MAX_BULK_EMAILS). Effective limit is 500 due to DTO validation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Draft MIME building | Custom RFC 822 builder | `MimeBuilder` (existing, wraps nodemailer) | RFC 822 multipart/MIME complexity |
| CDP auth extraction | Manual cookie parsing | `validation-helpers.mjs` (existing) | Handles Edge CDP, CSRF, cookie merging |
| Drafts folder resolution | Hardcoded folder names | `getDraftsFolderPath()` (existing) | Locale-dependent folder names |
| Provider draft sync | Custom provider calls | `saveDraftToProvider()` (existing) | Already abstracts Gmail/Microsoft/IMAP |
| Bulk sync-back | Custom sync logic | `syncOperationsBatch()` (existing) | Already handles per-provider routing |

## Common Pitfalls

### Pitfall 1: deleteDraft Does Not Sync to Provider (SUSPECTED BUG)
**What goes wrong:** Deleting a draft locally leaves the draft on Gmail/Outlook/IMAP. Next sync may re-create it locally.
**Why it happens:** `EmailCrudService.deleteDraft()` only does DB delete + S3 cleanup. It never calls `driver.deleteMessage(externalId)` to remove from provider. The method also does not use `emailSyncBack` for fire-and-forget cleanup.
**How to fix:** After DB delete, call `driver.deleteMessage(draft.externalId, true)` via the same driver pattern used in `saveDraftToProvider()`. Or add a sync-back operation with `hardDelete` type.
**Warning signs:** Deleted drafts reappear after sync; Gmail/Outlook web UI still shows deleted drafts.

### Pitfall 2: IMAP Draft Update is Delete+Create
**What goes wrong:** IMAP has no in-place update for messages. Updating a draft deletes the old UID and APPENDs a new message, which gets a new UID.
**Why it happens:** IMAP protocol limitation. `ImapSendService.saveDraft()` already handles this correctly (delete old, append new), but the returned UID changes on every update.
**How to avoid:** Already handled in the code. Validation should verify that updating a draft returns a new ID (the new UID) and that `getDraft()` still works with the new ID.
**Warning signs:** Draft update returns a different ID than the original; old draft ID returns 404.

### Pitfall 3: Bulk Labels Only Work on Gmail
**What goes wrong:** Calling `bulkAddLabels` with emails from Outlook or IMAP providers silently does nothing on the provider side (labels only in local DB).
**Why it happens:** `syncLabelOperationsToProviders()` explicitly filters to GOOGLE providers only. Non-Gmail emails get local DB changes but no sync-back.
**How to avoid:** This is by design (Gmail labels are provider-native, Outlook/IMAP don't have the same concept). Validation should verify Gmail label sync works and that non-Gmail providers don't error.
**Warning signs:** Labels appear locally but not on Gmail web UI (for Gmail emails); no errors but also no sync for Outlook/IMAP emails.

### Pitfall 4: Bulk Delete Dual Behavior (Soft vs Hard)
**What goes wrong:** `bulkDelete()` has dual behavior: non-deleted emails get soft-deleted (isDeleted=true, moved to trash), already-deleted emails get hard-deleted (removed from DB).
**Why it happens:** Design decision for two-stage delete (trash first, then permanent). The sync-back sends `delete` for soft-delete and `hardDelete` for hard-delete.
**How to avoid:** Validation should test both paths: first call moves to trash, second call permanently deletes.
**Warning signs:** First delete doesn't actually remove from DB (expected -- it moves to trash); emails vanish on second delete (expected -- hard delete).

### Pitfall 5: IMAP Port Blocked on Railway
**What goes wrong:** IMAP-based draft save/delete fails because Railway blocks ports 465/587.
**Why it happens:** Railway infrastructure limitation (same as WRITE-03 in Phase 117).
**How to avoid:** Mark IMAP draft tests as Blocked (Infrastructure) if they fail with connection errors. Focus validation on Gmail and Outlook.
**Warning signs:** Connection timeout or ECONNREFUSED on draft save for IMAP providers.

### Pitfall 6: Draft Update Race With Provider
**What goes wrong:** If `saveDraftToProvider()` fails (network error, expired token), the local DB still gets updated with the DTO data.
**Why it happens:** `saveDraftToProvider()` throws on failure (`throw new BadRequestException`), which should prevent the DB write. But the error handling in `saveDraft()` calls `saveDraftToProvider()` first, and only proceeds to DB write if it succeeds. So this is actually handled correctly.
**How to avoid:** Already handled. If provider sync fails, the whole operation fails with 400.
**Warning signs:** 400 errors on draft save when provider is unreachable.

## Code Examples

### Validation Script Structure (following Phase 117 pattern)

```javascript
// scripts/validate-drafts-bulk.mjs (orchestrator)
import { connectCDP, getAuthCookies, getCsrfToken, report } from './lib/validation-helpers.mjs';
import { validateDraftsBulk } from './lib/validate-drafts-bulk.mjs';

const args = process.argv.slice(2);
const providerFlag = args.find(a => a.startsWith('--provider='))?.split('=')[1] || 'all';

async function main() {
  console.log('=== Drafts & Bulk Operations Validation ===');
  console.log(`Provider: ${providerFlag}\n`);

  const { browser, context } = await connectCDP();
  const cookieHeader = await getAuthCookies(context);
  const { csrfToken, cookieHeader: finalCookies } = await getCsrfToken(context, cookieHeader);

  const results = await validateDraftsBulk(context, finalCookies, csrfToken, {
    provider: providerFlag,
  });

  const exitCode = report('Drafts & Bulk Operations Validation', results);
  await browser.close();
  process.exit(exitCode);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
```

### Draft CRUD Validation Pattern

```javascript
// WRITE-06: Draft lifecycle
// Step 1: Create draft
const draft = await apiPost(context, '/api/v1/emails/drafts', {
  providerId: provider.id,
  to: ['test@example.com'],
  subject: `Validation draft ${Date.now()}`,
  bodyHtml: '<p>Draft body</p>',
}, cookies, csrf);
// Assert: draft has id, isDraft=true, folder matches drafts folder

// Step 2: Get draft
const retrieved = await apiGet(context, `/api/v1/emails/drafts/${draft.id}`, cookies);
// Assert: retrieved.id === draft.id, retrieved.isDraft === true

// Step 3: Update draft
const updated = await apiPost(context, '/api/v1/emails/drafts', {
  id: draft.id,
  providerId: provider.id,
  to: ['updated@example.com'],
  subject: 'Updated subject',
  bodyHtml: '<p>Updated body</p>',
}, cookies, csrf);
// Assert: updated subject matches, to list updated

// Step 4: Delete draft
await apiDelete(context, `/api/v1/emails/drafts/${draft.id}`, cookies, csrf);
// Assert: 204 response, subsequent GET returns 404
```

### Bulk Operations Validation Pattern

```javascript
// WRITE-07: Bulk mark-read
const emails = await findTestEmails(context, cookies, providerId, 3);
const emailIds = emails.map(e => e.id);

const readResult = await apiPatch(context, '/api/v1/emails/bulk/read', {
  emailIds,
  isRead: true,
}, cookies, csrf);
// Assert: readResult.updated === emailIds.length
// Assert: all returned emails have isRead=true

// Verify reversal
const unreadResult = await apiPatch(context, '/api/v1/emails/bulk/read', {
  emailIds,
  isRead: false,
}, cookies, csrf);
// Assert: unreadResult.updated === emailIds.length
// Assert: all returned emails have isRead=false

// WRITE-08: Bulk move
const moveResult = await apiPatch(context, '/api/v1/emails/bulk/move', {
  emailIds: [emails[0].id],
  folder: 'INBOX',
}, cookies, csrf);
// Assert: moveResult.updated === 1
// Assert: returned email has folder='INBOX'

// WRITE-09: Bulk delete (soft)
const deleteResult = await apiDelete(context, '/api/v1/emails/bulk', {
  emailIds: [emails[0].id],
}, cookies, csrf);
// Assert: deleteResult.deleted === 1

// WRITE-10: Bulk label add (Gmail only)
const labels = await apiGet(context, '/api/v1/labels', cookies);
if (providerType === 'GOOGLE' && labels.length > 0) {
  const labelResult = await apiPatch(context, '/api/v1/emails/bulk/labels/add', {
    emailIds: [emails[1].id],
    labelIds: [labels[0].id],
  }, cookies, csrf);
  // Assert: labelResult.updated >= 1
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright CDP + custom assertion helpers (validation-helpers.mjs) |
| Config file | `scripts/lib/validation-helpers.mjs` (shared infrastructure) |
| Quick run command | `node scripts/validate-drafts-bulk.mjs --provider=gmail` |
| Full suite command | `node scripts/validate-drafts-bulk.mjs` (all providers) |

### Test Strategy

This phase uses **live provider integration tests** via Playwright CDP, consistent with Phases 112-117. The validation scripts exercise the draft and bulk APIs against real provider accounts on Railway production.

**Test categories:**

1. **Draft CRUD (WRITE-06):** For each provider, create a draft via `POST /api/v1/emails/drafts`, retrieve it via `GET /api/v1/emails/drafts/:id`, update it via another `POST /api/v1/emails/drafts` with the same ID, then delete via `DELETE /api/v1/emails/drafts/:id`. Verify each step returns expected state. IMAP may be blocked (Railway port restriction).

2. **Bulk mark-read/unread (WRITE-07):** Select 2-3 test emails, call `PATCH /api/v1/emails/bulk/read` with isRead=true, verify all returned emails have isRead=true. Reverse with isRead=false. Check across providers.

3. **Bulk move-to-folder (WRITE-08):** Select a test email, move to a known folder via `PATCH /api/v1/emails/bulk/move`. Verify the email's folder field matches. Move back to original folder to restore state.

4. **Bulk delete (WRITE-09):** Select a sacrificial test email, call `DELETE /api/v1/emails/bulk`. Verify isDeleted=true and folder=trash. Then call again for hard delete.

5. **Bulk label add/remove (WRITE-10, Gmail only):** Select Gmail emails and existing labels, call add then remove. Verify label associations exist/removed.

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRITE-06 | Draft create/update/retrieve/delete lifecycle per provider | integration (live provider) | `node scripts/validate-drafts-bulk.mjs --provider=gmail` | No -- Wave 0 |
| WRITE-07 | Bulk mark-read/unread updates DB and triggers sync-back | integration (live provider) | `node scripts/validate-drafts-bulk.mjs --provider=gmail` | No -- Wave 0 |
| WRITE-08 | Bulk move-to-folder updates DB and triggers sync-back | integration (live provider) | `node scripts/validate-drafts-bulk.mjs --provider=gmail` | No -- Wave 0 |
| WRITE-09 | Bulk delete (soft) updates DB and triggers sync-back | integration (live provider) | `node scripts/validate-drafts-bulk.mjs --provider=gmail` | No -- Wave 0 |
| WRITE-10 | Bulk label add/remove works on Gmail | integration (live provider) | `node scripts/validate-drafts-bulk.mjs --provider=gmail` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `node scripts/validate-drafts-bulk.mjs --provider=gmail` (quick single-provider check)
- **Per wave merge:** `node scripts/validate-drafts-bulk.mjs` (all providers)
- **Phase gate:** All providers green, all 5 WRITE requirements passing before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `scripts/validate-drafts-bulk.mjs` -- orchestrator script (WRITE-06 through WRITE-10)
- [ ] `scripts/lib/validate-drafts-bulk.mjs` -- per-provider validation logic module
- [ ] Bug investigation: `deleteDraft()` provider-side sync -- may need fix in `email-crud.service.ts`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No draft provider sync | `saveDraftToProvider()` syncs to all providers | v7.0+ | Drafts appear on Gmail/Outlook/IMAP web UI |
| Individual sync-back calls | `syncOperationsBatch()` batches sync-back | v7.0+ | Better error handling, fewer network calls |
| No bulk input validation | DTO class-validator with ArrayMaxSize(500) | BUG-017 fix | Prevents DoS via oversized bulk requests |
| No transactional bulk delete | Prisma `$transaction` wrapping soft+hard delete | Current | Atomicity for mixed soft/hard delete |

## Open Questions

1. **deleteDraft provider-side sync**
   - What we know: `deleteDraft()` only deletes from DB and S3. It does NOT call `driver.deleteMessage()` to remove the draft from the provider.
   - What's unclear: Is this intentional (drafts auto-cleanup on provider?) or a bug? Gmail drafts.delete API exists. Microsoft DELETE /me/messages/:id works for drafts. IMAP requires STORE + EXPUNGE.
   - Recommendation: Validate manually -- create draft via API, delete via API, check if draft still exists on provider web UI. If it persists, add provider-side delete. This is the primary potential bug fix for this phase.

2. **Bulk delete with body in DELETE request**
   - What we know: `DELETE /api/v1/emails/bulk` sends `BulkDeleteDto` in the request body. Some HTTP clients/proxies strip bodies from DELETE requests.
   - What's unclear: Whether Railway's proxy passes request bodies on DELETE.
   - Recommendation: Test first. If it fails, the fix would be changing to `POST /api/v1/emails/bulk/delete`. But this is unlikely an issue since Phase 114 already validated single DELETE with body.

3. **Labels API path**
   - What we know: Bulk labels reference `UserLabel` records. The validation script needs to discover existing labels.
   - What's unclear: The exact API path for listing labels (may be `/api/v1/labels` or `/api/v1/user-labels`).
   - Recommendation: Check Swagger at `/api/docs-json` during validation script development, or grep for the labels controller.

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- Read all relevant source files: email-actions.controller.ts, email-crud.service.ts (draft CRUD + saveDraftToProvider), email-bulk.service.ts (all bulk ops + label sync), email-driver.interface.ts (saveDraft/sendDraft/deleteMessage), bulk-operations.dto.ts, send-email.dto.ts (SaveDraftDto)
- **Driver implementations** -- Confirmed saveDraft exists in all 3 drivers: gmail-send.service.ts (users.drafts.create/update), microsoft-send.service.ts (POST/PATCH /me/messages), imap-send.service.ts (MIME build + IMAP APPEND)
- **Prior phase research** -- Phase 117 RESEARCH.md, Phase 114 validation scripts for sync-back pattern
- **Validation infrastructure** -- scripts/lib/validation-helpers.mjs (CDP, auth, API helpers, assertions)

### Secondary (MEDIUM confidence)
- Gmail Drafts API (`users.drafts.create`, `users.drafts.update`, `users.drafts.delete`) -- Training data, verified by googleapis usage in gmail-send.service.ts
- Microsoft Graph draft operations (`POST /me/messages`, `PATCH /me/messages/:id`, `POST /me/messages/:id/send`) -- Verified in microsoft-send.service.ts
- IMAP APPEND for drafts with `\Draft` flag -- Verified in imap-send.service.ts

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies, all existing infrastructure
- Architecture: HIGH -- Complete codebase inspection of all draft and bulk operation paths
- Pitfalls: HIGH -- deleteDraft provider-sync gap identified by code inspection; bulk delete dual behavior documented; IMAP Railway limitation known from Phase 117
- Validation architecture: HIGH -- Follows established Phase 112-117 pattern

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- validation of existing code)
