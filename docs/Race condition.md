# Email and Email-Sync Audit Findings

Status: Critical (7 bugs, 6 race conditions, 5 duplicate clusters)
Date: 2025-12-24 (updated)
Scope: backend/src/modules/email, backend/src/modules/email-sync

Summary
- Data correctness risks in IMAP external IDs and sync-back credentials can cause failed deletes and wrong-folder operations.
- Outbound send path diverges from driver implementations, dropping attachments and Gmail Bcc.
- Multiple concurrency races exist in scheduled send, token refresh, attachment fetch, cleanup, sync-back ordering, and draft IDs.
- Duplicate logic across drivers, workers, and queue services increases drift and inconsistency.

Findings

## Bugs and Data Consistency (Email-Sync)

ES-1: IMAP external ID mismatch
- Severity: High
- Symptom: Delete events use uid only, while stored externalId is folder:uid, so deletes and updates miss rows. Sync-back parseInt drops folder and can act on the wrong folder.
- Root cause: Inconsistent externalId format across driver, change events, and sync-back worker.
- Affected: `backend/src/modules/email-sync/drivers/imap/imap.driver.ts`, `backend/src/modules/email-sync/services/base-email-sync.service.ts`, `backend/src/modules/email-sync/workers/sync-back.worker.ts`
- Fix: Standardize externalId to include folder in all paths and parse consistently, or split folder and uid into separate fields.

ES-2: IMAP sync-back uses wrong credentials and folder
- Severity: High
- Symptom: IMAP sync-back decrypts accessToken instead of imapPassword and always opens INBOX.
- Root cause: Sync-back worker assumes OAuth tokens and does not branch for IMAP credentials or folder selection.
- Affected: `backend/src/modules/email-sync/workers/sync-back.worker.ts`, `backend/src/modules/email-sync/services/provider-token.service.ts`
- Fix: Use imapPassword for IMAP, include host/port from provider settings, and open the folder derived from externalId.

ES-3: Outbound Gmail and Microsoft send drops attachments and Gmail Bcc
- Severity: High
- Symptom: EmailSendWorker builds its own payload and omits attachments and Gmail Bcc handling used by driver send methods.
- Root cause: Worker bypasses driver send implementations.
- Affected: `backend/src/modules/email-sync/workers/email-send.worker.ts`, `backend/src/modules/email-sync/drivers/google/google.driver.ts`, `backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts`
- Fix: Route send logic through driver APIs or reuse a shared send builder with attachments and Bcc parity.

ES-4: Email send idempotency ineffective
- Severity: Medium
- Symptom: idempotency key uses Date.now so retries always get a new key and duplicate sends.
- Root cause: Non-deterministic idempotency key.
- Affected: `backend/src/modules/email-sync/services/email-send-queue.service.ts`
- Fix: Use a stable key derived from tenantId, provider, and draft/external message identifiers.

ES-5: Microsoft nested folder cache broken
- Severity: Medium
- Symptom: Nested folders fall back to INBOX because the cache does not resolve parentFolderId for nested paths.
- Root cause: Folder cache does not track parent relationships or full paths.
- Affected: `backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts`
- Fix: Cache by id, build a tree with parentFolderId, and resolve full paths deterministically.

ES-6: IMAP incremental sync only tracks INBOX
- Severity: Medium
- Symptom: Other folders do full sync each run, increasing load and latency.
- Root cause: UID validity and last UID are tracked only for INBOX.
- Affected: `backend/src/modules/email-sync/drivers/imap/imap.driver.ts`
- Fix: Track per-folder UID validity and last UID for every synced folder.

ES-7: Sync worker trusts jobData providerType
- Severity: Low
- Symptom: Malformed job data can dispatch the wrong driver.
- Root cause: No provider record validation.
- Affected: `backend/src/modules/email-sync/workers/sync.worker.ts`
- Fix: Load provider from DB and validate providerType before dispatch.

## Race Conditions (Email and Email-Sync)

RC-1: Scheduled email duplicate sends
- Severity: High
- Symptom: Multiple instances can select the same pending rows and send twice before status flips.
- Root cause: No atomic claim of scheduled_email rows before processing.
- Affected: `backend/src/modules/email/services/scheduled-email.service.ts`
- Fix: Atomically claim work (UPDATE ... WHERE status='pending' AND scheduledAt<=now returning ids, or SELECT ... FOR UPDATE SKIP LOCKED) and add idempotency key per scheduled email.

RC-2: Token refresh race in sync-back
- Severity: High
- Symptom: Concurrent sync-back operations can refresh tokens in parallel and overwrite rotated refresh tokens.
- Root cause: EmailSyncBackService manages refresh without distributed locking.
- Affected: `backend/src/modules/email/services/email-sync-back.service.ts`
- Fix: Route token fetch and refresh through ProviderTokenService (Redis lock) or add a lock in EmailSyncBackService.

RC-3: Attachment on-demand TOCTTOU
- Severity: Medium
- Symptom: Multiple downloads for the same pending attachment can trigger duplicate provider fetches and redundant uploads.
- Root cause: Check-then-act on storageType and non-atomic putObjectIfAbsent (HEAD then PUT).
- Affected: `backend/src/modules/email/services/attachment-on-demand.service.ts`, `backend/src/modules/email/services/attachment.storage.ts`, `backend/src/modules/email/services/storage.service.ts`
- Fix: Add per-attachment lock (db update with where storageType='pending') and use conditional upload (If-None-Match) or a Redis lock around S3 writes.

RC-4: Cleanup overlap double delete
- Severity: Medium
- Symptom: Two cleanup paths can delete the same email and attachments concurrently and one path fails with NotFound or FK errors.
- Root cause: runTenantMaintenance executes duplicate and purge in parallel; permanentlyDeleteEmail is not idempotent.
- Affected: `backend/src/modules/email/services/email-cleanup.service.ts`
- Fix: Serialize per-tenant cleanup runs, make permanentlyDeleteEmail tolerant of already-deleted records, and guard deletes with updateMany or deleteMany counts.

RC-5: Sync-back ordering races
- Severity: Medium
- Symptom: Rapid user toggles (read/unread, flag/unflag) can be applied out of order at providers.
- Root cause: Async sync-back dispatch without per-email ordering or state collapse.
- Affected: `backend/src/modules/email/services/emails.service.ts`, `backend/src/modules/email/services/email-sync-back.service.ts`
- Fix: Debounce and collapse operations per email (last-write-wins) or route through the sync-back queue with ordering keys.

RC-6: Draft autosave collisions
- Severity: Low
- Symptom: Two new drafts created in the same millisecond can share externalId and violate unique constraint.
- Root cause: Draft externalId uses `draft-${Date.now()}` without randomness or uuid.
- Affected: `backend/src/modules/email/services/emails.service.ts`
- Fix: Use a uuid for draft externalId (and or rely on the created id).

## Duplicate Code (Email-Sync)

DC-1: Attachment processing duplicated in Gmail and Microsoft sync services
- Affected: `backend/src/modules/email-sync/services/gmail/google-sync.service.ts`, `backend/src/modules/email-sync/services/microsoft/microsoft-sync.service.ts`, `backend/src/modules/email-sync/services/base-attachment-handler.ts`
- Risk: Divergent behavior for attachment normalization and storage.

DC-2: EmailSendWorker duplicates driver send logic
- Affected: `backend/src/modules/email-sync/workers/email-send.worker.ts`, `backend/src/modules/email-sync/drivers/google/google.driver.ts`, `backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts`
- Risk: Feature drift (attachments, Bcc, headers) across send paths.

DC-3: Batch processors overlap driver-based sync
- Affected: `backend/src/modules/email-sync/services/gmail/gmail-batch-processor.ts`, `backend/src/modules/email-sync/services/microsoft/microsoft-batch-processor.ts`
- Risk: Two implementations of the same sync flow increase maintenance and bugs.

DC-4: Message parsing duplicated between parser services and drivers
- Affected: `backend/src/modules/email-sync/services/gmail/gmail-message-parser.ts`, `backend/src/modules/email-sync/drivers/google/google.driver.ts`, `backend/src/modules/email-sync/services/microsoft/microsoft-message-parser.ts`, `backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts`
- Risk: Canonical mapping differences and inconsistent flags.

DC-5: Queue services repeat boilerplate patterns
- Affected: `backend/src/modules/email-sync/services/email-send-queue.service.ts`, `backend/src/modules/email-sync/services/bulk-operations-queue.service.ts`, `backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts`, `backend/src/modules/email-sync/services/folder-operations-queue.service.ts`
- Risk: Repeated queue configuration and error handling logic.

Roadmap
- Phase 1: Fix IMAP externalId consistency and sync-back credentials and folder selection (ES-1, ES-2).
- Phase 2: Normalize outbound send path with attachments and Bcc parity, and replace idempotency key with stable values (ES-3, ES-4).
- Phase 3: Validate job data against provider records and fix provider folder coverage (ES-5, ES-6, ES-7).
- Phase 4: Close top concurrency issues with scheduled email claiming and token refresh locking (RC-1, RC-2).
- Phase 5: Harden attachment and cleanup flows with locks, conditional uploads, and idempotent deletes (RC-3, RC-4).
- Phase 6: Enforce per-email sync-back ordering and randomize draft externalId (RC-5, RC-6).
- Phase 7: Consolidate duplicate parsing, send, and queue logic into shared helpers and driver APIs (DC-1 to DC-5).
- Phase 8: Validate with real providers and add regression tests and metrics for sync-back and send flows.

Notes
- No tests executed in this audit.
