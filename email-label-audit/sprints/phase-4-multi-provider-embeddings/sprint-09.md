# Sprint 09 - Microsoft/IMAP Label Parity

| Key | Value |
|-----|-------|
| Phase | 4 - Multi-Provider & Embeddings |
| Sprint | 09 |
| SP | 13 |
| Objective | Extend label/folder operations to Microsoft and IMAP so all 3 drivers have consistent behavior |
| Addresses | MP1, MP2, MP3, MP4 |

## Context

Phase 1-3 focused on Google-only label sync. This sprint extends coverage to Microsoft (Outlook) and IMAP drivers. Key differences:
- **Google**: Labels ARE folders (flat namespace, many-to-many with messages)
- **Microsoft**: Folders (hierarchical) + Categories (tags on messages, separate concept)
- **IMAP**: Folders only (hierarchical mailboxes), no label concept. Only flags (`\Seen`, `\Flagged`)

## Sprint Backlog

### T-0901: Implement UserLabel sync-back for Microsoft (categories) [3 SP]

- [ ] When `labels.service.addEmailsToLabel()` is called for a Microsoft provider email, queue category sync-back
- [ ] Map UserLabel name -> Outlook category via `messages.modify()` with `addLabels()`
- [ ] When removing label, call `removeLabels()` to remove category
- [ ] Use existing `microsoft-sync-back.service.ts` pattern for queueing
- [ ] Rate limiting: max 4 requests/second per user (Graph API throttling)
- [ ] Files: `microsoft-sync-back.service.ts`, `labels.service.ts`

### T-0902: Handle IMAP label operations gracefully [2 SP]

- [ ] `addLabels`/`removeLabels` are optional on IEmailDriver — IMAP doesn't implement them
- [ ] When user adds a UserLabel to an IMAP email, skip sync-back (labels are app-only)
- [ ] Add `supportsLabels(): boolean` method to IEmailDriver interface (Google/MS: true, IMAP: false)
- [ ] Labels service checks `supportsLabels()` before queueing sync-back
- [ ] Frontend shows info tooltip for IMAP accounts: "Labels are local-only for this account"
- [ ] Files: `email-driver.interface.ts`, `labels.service.ts`, translations

### T-0903: Fix Microsoft folder cache invalidation [3 SP]

- [ ] `folderIdCache` and `folderPathCache` on MicrosoftDriver are never invalidated on external changes
- [ ] Add cache invalidation on folder sync: `syncFolders()` clears both caches after refresh
- [ ] Add TTL (5 min, matching IMAP pattern) as safety net for between-sync changes
- [ ] Handle edge case: folder renamed externally -> cache has old path -> move operation fails
- [ ] Add retry with cache clear on folder-not-found errors
- [ ] Files: `microsoft.driver.ts`, `microsoft-folder.service.ts`

### T-0904: Add timeout and circuit breaker to IMAP deleteFolder [3 SP]

- [ ] Current 5-step RFC 3501 process has 3 retries but no timeout — can hang indefinitely
- [ ] Add 30-second timeout per step (150s total max)
- [ ] Add circuit breaker: after 2 consecutive failures, skip folder delete for 5 minutes
- [ ] Log structured errors with step number for debugging
- [ ] Handle IMAP servers that don't support `DELETE` (some shared hosting)
- [ ] Files: `imap-folder.service.ts`

### T-0905: Unify folder operation error handling across drivers [2 SP]

- [ ] Create shared `FolderOperationError` with `code`, `driver`, `operation`, `recoverable` fields
- [ ] All 3 drivers throw consistent error types for: not-found, permission-denied, server-error, timeout
- [ ] Frontend `useFolderManagement` shows driver-specific error messages
- [ ] Add translations for folder error messages (en.ts, it.ts)
- [ ] Files: `canonical.types.ts` (error types), all 3 drivers, `useFolderManagement.ts`

## Dependencies

- S08 complete (Phase 3 validation must pass first)
- Can run in parallel with S10

## Risks

- Microsoft Graph API category limits (max 250 per mailbox)
- IMAP server diversity — behavior varies widely between implementations
- Mitigation: Test against Gmail IMAP, Dovecot, and Exchange IMAP

## Definition of Done

- [ ] UserLabel sync-back works for Microsoft accounts (categories)
- [ ] IMAP accounts handle labels gracefully (no silent failures)
- [ ] Microsoft folder cache invalidated properly
- [ ] IMAP deleteFolder has timeout protection
- [ ] All folder errors are typed and translatable
- [ ] `npx tsc --noEmit` passes in backend and frontend
- [ ] Existing driver tests pass
