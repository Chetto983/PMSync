# Sprint 01 — Checkpoint

## Status

- **Sprint:** 01 — Label Mapping & Folder Determination
- **Last Task Completed:** T-0105 — Validate existing data consistency
- **Next Task:** Sprint 02 — Sync Processor & Race Conditions
- **Tasks Done:** 5/5
- **SP Completed:** 13/13
- **Last Updated:** 2026-03-25 17:10

## Audit Findings Addressed

- C1: Stale Gmail label IDs — ✅ fixed (T-0102 mapping, T-0103 cleanup)
- C2: Custom-label-only emails default to INBOX — ✅ fixed (T-0101 → ARCHIVE)
- M1: DRAFT vs DRAFTS inconsistency — ✅ verified false alarm (T-0104)
- M7: CATEGORY_PERSONAL excluded from sync — ✅ verified handled correctly

## Last Modified Files

- backend/src/modules/email-sync/drivers/google/services/gmail-message.service.ts
- backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts
- backend/src/modules/email-sync/services/gmail/__tests__/gmail-folder.service.spec.ts
- scripts/audit/validate-email-labels.mjs

## Key Decisions Made

- Used ARCHIVE as folder for custom-label-only emails (C2 fix)
- No Redis cache for label mapping — DB Folder records already store externalId + name
- Stale label cleanup runs inside syncGmailFolders() using PostgreSQL array operators
- SYSTEM_LABEL_IDS whitelist prevents system labels from being flagged as stale
- cleanStaleLabels uses batch SQL (not per-email) with 5000 row limit

## Data Validation Results (T-0105)

- 11,488 total emails across 4 providers
- 16 folder mismatches (0.2%):
  - 1 email: folder=INBOX but labels=["IMPORTANT"] → should be ARCHIVE (C2)
  - 15 emails: folder=TRASH but labels still show old categories (stale after move)
- 0 stale label IDs
- 48 emails with empty labels (non-Google provider)

## Patterns Established

- Audit scripts in: scripts/audit/
- Test mock setup: PrismaService needs $queryRaw, $executeRaw, RealtimeEventsService mock
- determineFolderFromLabels exists in TWO places — both must be kept in sync

## Blockers / Notes

- gmail-folder.service.ts is 585 lines (over 500 limit) — needs extraction if more code added
- Pre-existing tsc errors in CRM stage-automation.worker.ts (unrelated)

## Validation Status

- Backend tsc: ✅ passing (only pre-existing CRM errors)
- Frontend tsc: N/A (no frontend changes)
- Existing tests: ✅ 66 passing in gmail-folder.service.spec.ts
