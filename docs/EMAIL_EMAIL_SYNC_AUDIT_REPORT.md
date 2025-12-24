# Email + Email-Sync Audit Report

Date: 2025-12-24 (Updated)
Scope: backend/src/modules/email, backend/src/modules/email-sync
Method: static code review only (no tests executed)

## Summary

- ✅ B-1: Attachments now use base64 content in driver-based send - FIXED
- ✅ B-2: IMAP SMTP auth now uses smtpPassword field - FIXED
- ✅ B-3: bulkAddLabels no longer includes invalid tenantId field - FIXED
- ✅ B-4: Bulk label mutations now validate tenant ownership - FIXED
- ✅ B-5: Full sync preserves user flags using userModifiedAt guard - FIXED
- ✅ B-6: Sync-back service now validates tenant scope - FIXED
- ✅ B-7: IMAP SMTP username now uses smtpUsername field - FIXED
- ✅ R-1, R-2: Already fixed in Race condition.md (RC-5, RC-2)
- ⚠️ D-1 to D-5: Duplicate code clusters pending refactor

## Bugs / Data Correctness

### B-1 (High) Attachments corrupted in driver-based send ✅ FIXED

- Evidence: backend/src/modules/email/services/email-send.service.ts:210 sets ComposeMessage.attachments.content to storagePath
- Evidence: backend/src/modules/email-sync/drivers/interfaces/canonical.types.ts:224 defines AttachmentData.content as base64
- Impact: Gmail/Microsoft drivers treat storage path as base64, producing invalid attachments or provider errors.
- Fix Applied: Changed to use original Buffer content converted to base64:
  - `content: att.content.toString('base64')` instead of `content: att.storagePath`
  - Uses data.attachments (original Buffers) instead of uploadedAttachments (storage metadata)

### B-2 (High) IMAP SMTP auth uses provider.accessToken instead of smtp/imap password ✅ FIXED

- Evidence: backend/src/modules/email-sync/workers/email-send.worker.ts:299
- Impact: IMAP send fails when accessToken is empty or unrelated; ignores smtpPassword/imapPassword fields.
- Fix Applied: Now uses proper schema fields:
  - `provider.smtpHost`, `provider.smtpPort`, `provider.smtpUseTls` from ProviderConfig
  - `provider.smtpPassword` + `provider.smtpEncryptionIv` for credentials
  - Validates smtpPassword and smtpEncryptionIv exist before send

### B-3 (High) bulkAddLabels writes invalid field and can throw at runtime ✅ FIXED

- Evidence: backend/src/modules/email/services/emails.service.ts:1766
- Evidence: backend/src/modules/email/services/emails.service.ts:1776
- Evidence: backend/prisma/schema.prisma:472 (EmailLabel has no tenantId)
- Impact: Prisma rejects createMany with "Unknown arg tenantId", breaking label add flow.
- Fix Applied: Removed tenantId from emailLabelPairs createMany payload. Tenant safety ensured by prior email.findMany query that filters by tenantId.

### B-4 (High) bulk label mutations are not tenant-safe ✅ FIXED

- Evidence: backend/src/modules/email/services/emails.service.ts:1766 uses unfiltered emailIds for createMany
- Evidence: backend/src/modules/email/services/emails.service.ts:1817 deleteMany filters only by emailId/labelId
- Impact: cross-tenant label add/remove possible if a caller supplies foreign emailIds.
- Fix Applied:
  - Added `id: true` to email.findMany select
  - Created `validatedEmailIds = emails.map(e => e.id)` from tenant-scoped query
  - Use validatedEmailIds for all label operations instead of original emailIds
  - Applied to both bulkAddLabels and bulkRemoveLabels

### B-5 (Medium) Full sync overwrites user flags without userModifiedAt guard ✅ FIXED

- Evidence: backend/src/modules/email-sync/services/base-email-sync.service.ts:438 sets isRead/isStarred/isFlagged/labels in batch upsert
- Impact: full sync can revert recent user changes (read/star/flag) unlike incremental path.
- Fix Applied: Added userModifiedAt preservation logic to processMessagesBatch:
  - Query existing emails to get userModifiedAt timestamps
  - Build lookup map of `externalId:folder` -> userModifiedAt
  - Check if user modified within last 5 minutes
  - If recently modified, only update content fields (subject, body, etc.), not state fields (isRead, isStarred, isFlagged, labels)

### B-6 (Medium) Sync-back service is not tenant-scoped ✅ FIXED

- Evidence: backend/src/modules/email/services/email-sync-back.service.ts:138 providerConfig.findUnique by id only
- Evidence: backend/src/modules/email/services/email-sync-back.service.ts:620 email.findUnique by id only
- Impact: multi-tenant isolation is not enforced inside sync-back operations.
- Fix Applied:
  - Changed `findUnique({ where: { id } })` to `findFirst({ where: { id, tenantId } })`
  - Added `operation.tenantId` validation to provider lookup
  - Added `operation.tenantId` validation to email folder lookup

### B-7 (Medium) IMAP SMTP username ignores smtpUsername ✅ FIXED

- Evidence: backend/src/modules/email/services/email-send.service.ts:174 sets username to provider.email
- Impact: IMAP providers that require smtpUsername will fail to send.
- Fix Applied: Now uses `provider.smtpUsername || provider.email` for SMTP auth username.

## Race Conditions

### R-1 (Medium) Sync-back operations can apply out of order ✅ FIXED

- Reference: Race condition.md RC-5
- Fix: Per-email Redis lock serialization in syncOperationToProvider

### R-2 (Medium) Token refresh races in EmailSyncBackService ✅ FIXED

- Reference: Race condition.md RC-2
- Fix: Redis lock with double-check pattern in getValidAccessToken

## Error Handling Gaps

### E-1 (Low) IMAP sync-back silently ignores folder errors

- Evidence: backend/src/modules/email-sync/workers/sync-back.worker.ts:618 logs errors and continues
- Impact: job can report success with partial failures.
- Status: Low priority, deferred

### E-2 (Low) Batch sync hides failures for otherOps

- Evidence: backend/src/modules/email/services/email-sync-back.service.ts:829 uses Promise.allSettled without inspection
- Impact: failed operations are not surfaced to callers or metrics.
- Status: Low priority, deferred

## Duplicate Code / Design Drift ⚠️ PENDING

### D-1 Email send logic duplicated (driver vs worker)

- Files: backend/src/modules/email/services/email-send.service.ts, backend/src/modules/email-sync/workers/email-send.worker.ts, backend/src/modules/email-sync/drivers/google/google.driver.ts, backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts
- Status: Code quality improvement, deferred

### D-2 Sync-back has two implementations

- Files: backend/src/modules/email/services/email-sync-back.service.ts, backend/src/modules/email-sync/workers/sync-back.worker.ts, backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts
- Status: Code quality improvement, deferred

### D-3 Token refresh logic duplicated

- Files: backend/src/modules/email/services/email-sync-back.service.ts, backend/src/modules/email-sync/services/provider-token.service.ts
- Status: Code quality improvement, deferred

### D-4 Legacy batch processors vs driver-based sync

- Files: backend/src/modules/email-sync/services/gmail/gmail-batch-processor.ts, backend/src/modules/email-sync/services/microsoft/microsoft-batch-processor.ts, backend/src/modules/email-sync/services/gmail/gmail-message-parser.ts, backend/src/modules/email-sync/services/microsoft/microsoft-message-parser.ts
- Status: Code quality improvement, deferred

### D-5 Queue service boilerplate repeated across queues

- Files: backend/src/modules/email-sync/services/email-send-queue.service.ts, backend/src/modules/email-sync/services/bulk-operations-queue.service.ts, backend/src/modules/email-sync/services/provider-sync-back-queue.service.ts, backend/src/modules/email-sync/services/folder-operations-queue.service.ts
- Status: Code quality improvement, deferred

## Dead / Unused Code

### U-1 Example token service

- File: backend/src/modules/email-sync/services/provider-token-cached.service.example.ts (no references)
- Status: Can be removed

### U-2 Gmail/Microsoft batch processors and parsers appear unused

- Files: backend/src/modules/email-sync/services/gmail/gmail-batch-processor.ts, backend/src/modules/email-sync/services/microsoft/microsoft-batch-processor.ts, backend/src/modules/email-sync/services/gmail/gmail-message-parser.ts, backend/src/modules/email-sync/services/microsoft/microsoft-message-parser.ts
- Status: Needs verification before removal

### U-3 BatchProcessorService unused

- File: backend/src/modules/email/services/batch-processor.service.ts (registered in module, no consumers)
- Status: Can be removed

### U-4 Resilient driver wrapper entrypoints unused

- Files: backend/src/modules/email-sync/drivers/driver.factory.ts (createResilientDriver/wrapWithResilience not referenced)
- Status: Needs verification before removal

## Progress Summary

| Category | Total | Fixed | Pending |

|----------|-------|-------|---------|
| Bugs (B-1 to B-7) | 7 | 7 | 0 |
| Race Conditions | 2 | 2 | 0 |
| Error Handling | 2 | 0 | 2 |
| Duplicate Code | 5 | 0 | 5 |
| Unused Code | 4 | 0 | 4 |

## Notes

- All HIGH and MEDIUM priority bugs have been fixed.
- TypeScript compilation verified with `npx tsc --noEmit` - no errors.
- Race conditions R-1 and R-2 were already fixed in Race condition.md (RC-5, RC-2).
- Duplicate code clusters and unused code are non-critical and can be addressed in future refactoring.
- Ready for testing with real providers.
