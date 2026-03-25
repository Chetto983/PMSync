# Sprint 02 - Sync Processor & Race Condition Fixes

| Key | Value |
|-----|-------|
| Phase | 1 - Google <-> DB Sync |
| Sprint | 02 |
| SP | 11 |
| Objective | Fix sync processor to correctly handle labels during upsert, add GIN index, fix count discrepancies |
| Addresses | C3, H5, M6 |

## Sprint Backlog

### T-0201: Add GIN index on Email.labels[] [2 SP] ✅ DONE
- [x] Add `@@index([labels], type: Gin)` to Email model in schema.prisma
- [x] Generate and apply migration
- [x] Applied directly to Railway DB via CREATE INDEX + migration file for future deploys
- [x] Files: `backend/prisma/schema.prisma`, `backend/prisma/migrations/20260325180000_gin_index_email_labels/migration.sql`

### T-0202: Implement label merge logic in sync processor [3 SP] ✅ DONE
- [x] Replace atomic `labels: canonicalMsg.labels || []` overwrite with merge
- [x] Preserve user-added labels not present in Gmail response
- [x] Remove labels that Gmail removed (diff-based update)
- [x] Logic: `mergeLabels()` — system labels trust Gmail, custom labels preserved
- [x] Files: `sync-message-processor.service.ts` — `mergeLabels()`, `isSystemLabel()`, `SYSTEM_LABELS`
- [x] 31 existing tests passing

### T-0203: Unify folder count query for Google/non-Google [3 SP] ✅ DONE
- [x] Audit both count paths (labels has vs folder groupBy)
- [x] Google count path now uses OR(labels, folder) matching buildEmailWhere
- [x] Counts match email list for same dataset — OR ensures no drift discrepancies
- [x] Files: `email-folder.service.ts:502-546`

### T-0204: Fix folder/labels drift after manual operations [2 SP] ✅ DONE
- [x] When `Email.folder` is updated (move/archive), `Email.labels[]` is now updated too
- [x] Added `updateLabelsForFolderChange()` — maps folder→label, removes old, adds new
- [x] Sync direction (labels→folder) already handled by canonical message derivation
- [x] Files: `email-crud.service.ts` — updateEmail transaction + updateLabelsForFolderChange()

### T-0205: Data migration for existing inconsistencies [1 SP] ✅ DONE
- [x] Ran validation: 21 mismatches found (7 real, 14 stale TRASH labels)
- [x] Created idempotent script with TRASH/SPAM safeguard
- [x] Applied: 7 INBOX→ARCHIVE fixes, re-run confirms 0 remaining
- [x] Files: `scripts/audit/fix-email-folder-drift.mjs`

## Dependencies
- S01 complete (label mapping and folder determination must be correct first)

## Risks
- R3: GIN index creation locks table on large datasets
- Mitigation: Use `CREATE INDEX CONCURRENTLY` via raw SQL if needed

## Definition of Done
- [x] GIN index on labels[] exists and is used by Prisma queries — T-0201
- [x] Label merge logic preserves user modifications during sync — T-0202
- [x] Folder counts match between Google and non-Google paths — T-0203
- [x] folder <-> labels drift prevented by dual-update utility — T-0204
- [x] `npx tsc --noEmit` passes in backend
- [x] Existing sync tests pass (31 tests in sync-message-processor)

## Deliverables
- `backend/prisma/schema.prisma` (GIN index added)
- `backend/prisma/migrations/YYYYMMDD_gin_index_email_labels/` (new)
- `sync-message-processor.service.ts` (merge logic)
- `email-folder.service.ts` (unified counts)
- `scripts/audit/fix-email-folder-drift.ts` (new)
