# Sprint 02 — Checkpoint

## Status

- **Sprint:** 02 — Sync Processor & Race Condition Fixes
- **Last Task Completed:** T-0205 — Data migration for existing inconsistencies
- **Next Task:** Sprint 03 — Label Schema & aiPrompt Column
- **Tasks Done:** 5/5
- **SP Completed:** 11/11
- **Last Updated:** 2026-03-25 18:10

## Audit Findings Addressed

- C1: Stale Gmail label IDs — ✅ fixed in S01 (T-0102, T-0103)
- C2: Custom-label-only emails default to INBOX — ✅ fixed in S01 (T-0101)
- C3: Dual folder count query paths — ✅ fixed (T-0203, OR unification)
- H5: Atomic label array overwrite during sync — ✅ fixed (T-0202, merge logic)
- M1: DRAFT vs DRAFTS inconsistency — ✅ verified false alarm (S01)
- M6: No GIN index on Email.labels[] — ✅ fixed (T-0201)
- M7: CATEGORY_PERSONAL excluded from sync — ✅ verified handled correctly (S01)

## Last Modified Files

- backend/prisma/schema.prisma (GIN index)
- backend/prisma/migrations/20260325180000_gin_index_email_labels/migration.sql
- backend/src/modules/email-sync/services/sync-message-processor.service.ts (label merge)
- backend/src/modules/email/services/email-folder.service.ts (unified counts)
- backend/src/modules/email/services/email-crud.service.ts (folder/labels sync)
- scripts/audit/fix-email-folder-drift.mjs (data migration)

## Key Decisions Made

- Label merge: system labels trust Gmail, custom labels (Label_*) preserved in DB
- SYSTEM_LABELS static set in sync processor for O(1) lookup
- Google folder counts now use OR(labels, folder) matching buildEmailWhere
- Folder change in updateEmail also updates labels[] via updateLabelsForFolderChange()
- Data migration skips manually trashed/spammed emails (user intent > stale labels)
- CRM import-export tsc errors fixed as side-effect (excel-export JsonValue cast)

## Patterns Established

- mergeLabels() / isSystemLabel() in sync-message-processor.service.ts
- updateLabelsForFolderChange() in email-crud.service.ts with folderToLabel map
- Audit fix scripts in scripts/audit/ with --dry-run support and idempotency

## Data Migration Results (T-0205)

- 11,456 Google emails checked
- 21 mismatches detected (7 real INBOX→ARCHIVE, 14 stale TRASH labels)
- 7 fixed, 14 skipped (manually trashed, user intent preserved)
- Re-run: 0 mismatches (idempotent)

## Blockers / Notes

- sync-message-processor.service.ts is 697 lines (over 500 limit) — needs extraction if more code added
- Pre-commit hook sometimes stages unrelated files during commit (CRM WIP files)
- scripts/audit/ is in .gitignore — need `git add -f` for audit scripts

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: N/A (no frontend changes)
- Existing tests: ✅ 31 passing in sync-message-processor.service.spec.ts
- Data consistency: ✅ 0 mismatches after migration
