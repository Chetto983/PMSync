# Sprint 09 — Checkpoint

## Status

- **Sprint:** 09 — Microsoft/IMAP Label Parity
- **Last Task Completed:** T-0905 — Unified folder operation error handling
- **Next Task:** Sprint 09 COMPLETE. Next: S10 (Embedding Lifecycle Hardening)
- **Tasks Done:** 5/5
- **SP Completed:** 13/13
- **Last Updated:** 2026-03-26 18:30

## Audit Findings Addressed

- MP1: UserLabel sync-back for Microsoft (Outlook categories) — ✅ T-0901
- MP2: IMAP label operations graceful handling — ✅ T-0902
- MP3: Microsoft folder cache invalidation with TTL — ✅ T-0903
- MP4: IMAP deleteFolder timeout + circuit breaker — ✅ T-0904
- Cross-driver: Unified FolderOperationError hierarchy — ✅ T-0905

## Last Modified Files

- backend/src/modules/email-sync/drivers/interfaces/folder-errors.ts (T-0905 new)
- backend/src/modules/email-sync/drivers/interfaces/index.ts (T-0905 export)
- backend/src/modules/email-sync/drivers/interfaces/email-driver.interface.ts (T-0902)
- backend/src/modules/email-sync/drivers/google/google.driver.ts (T-0902, T-0905)
- backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts (T-0902, T-0903, T-0905)
- backend/src/modules/email-sync/drivers/imap/services/imap-folder.service.ts (T-0904, T-0905)
- backend/src/modules/email-sync/workers/sync-back.worker.ts (T-0901 pre-existing)
- backend/src/modules/labels/services/labels.service.ts (T-0901/T-0902)
- backend/src/modules/email/controllers/folders.controller.ts (T-0905)
- frontend/components/email/folders/folder-error-utils.ts (T-0905 new)
- frontend/components/email/folders/FolderDialog.tsx (T-0905)
- frontend/components/email/folders/FolderDeleteDialog.tsx (T-0905)
- frontend/components/email/labels/LabelPickerDialog.tsx (T-0902)
- frontend/locales/en.ts (T-0902, T-0905)
- frontend/locales/it.ts (T-0902, T-0905)
- frontend/locales/index.ts (T-0905)

## Key Decisions Made

- T-0901: Microsoft category sync uses GET-then-PATCH (read-modify-write) since Graph API has no atomic "add one category" endpoint
- T-0901: Rate limited to 250ms between messages (~4 req/s per Graph API guidance)
- T-0902: LABEL_CAPABLE_PROVIDERS = Set(['google', 'microsoft']); IMAP skipped entirely
- T-0902: LabelPickerDialog shows info banner for IMAP accounts
- T-0903: TtlMap class with 5-min TTL replaces plain Map for folder caches
- T-0903: resolveFolderId retries once with cache refresh on miss
- T-0904: 30s per-step timeout (150s total max) for 5-step RFC 3501 delete
- T-0904: Circuit breaker trips after 2 failures, 5-min cooldown per folder
- T-0905: FolderOperationError in shared folder-errors.ts (not canonical.types.ts — too large)
- T-0905: classifyFolderError helper does keyword-based error classification
- T-0905: Controller passes structured JSON via BadRequestException(error.toJSON())
- T-0905: Frontend extracts error code from multiple response shapes (axios, fetch, TanStack)

## Patterns Established

- FolderOperationError: code/driver/operation/recoverable — reusable for S12-S14 driver hardening
- classifyFolderError: centralized error classification by message keywords
- folder-error-utils.ts: frontend error code extraction from API responses
- TtlMap: generic TTL cache used in Microsoft driver, reusable elsewhere

## Blockers / Notes

- None. Sprint 09 complete.
- S10 (Embedding Lifecycle Hardening) can start immediately.

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing (pre-existing CRM errors unrelated)
- Existing tests: not run (no test changes in this sprint)
