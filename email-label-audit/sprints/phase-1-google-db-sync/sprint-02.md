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

### T-0202: Implement label merge logic in sync processor [3 SP]
- [ ] Replace atomic `labels: canonicalMsg.labels || []` overwrite with merge
- [ ] Preserve user-added labels not present in Gmail response
- [ ] Remove labels that Gmail removed (diff-based update)
- [ ] Logic: `newLabels = gmailLabels UNION userAddedLabels MINUS gmailRemovedLabels`
- [ ] Files: `sync-message-processor.service.ts:249-262`

### T-0203: Unify folder count query for Google/non-Google [3 SP]
- [ ] Audit both count paths (labels has vs folder groupBy)
- [ ] Ensure both paths return identical counts for the same dataset
- [ ] Add consistency check: when `labels: { has: externalId }` count != `folder` count, log warning
- [ ] Consider using `folder` field as single source of truth for counts (simpler)
- [ ] Files: `email-folder.service.ts:500-600`

### T-0204: Fix folder/labels drift after manual operations [2 SP]
- [ ] When `Email.folder` is updated (move/archive), ensure `Email.labels[]` is updated too
- [ ] When `Email.labels[]` is updated (sync), ensure `Email.folder` is re-derived
- [ ] Add utility: `deriveAndUpdateFolder(email)` that recalculates folder from labels
- [ ] Files: `sync-message-processor.service.ts`, `gmail-sync-back.service.ts`

### T-0205: Data migration for existing inconsistencies [1 SP]
- [ ] Run validation script from S01
- [ ] Apply folder re-derivation to inconsistent emails
- [ ] Create migration script (idempotent, can be re-run)
- [ ] Files: `scripts/audit/fix-email-folder-drift.ts`

## Dependencies
- S01 complete (label mapping and folder determination must be correct first)

## Risks
- R3: GIN index creation locks table on large datasets
- Mitigation: Use `CREATE INDEX CONCURRENTLY` via raw SQL if needed

## Definition of Done
- [ ] GIN index on labels[] exists and is used by Prisma queries
- [ ] Label merge logic preserves user modifications during sync
- [ ] Folder counts match between Google and non-Google paths
- [ ] folder <-> labels drift prevented by dual-update utility
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Existing sync tests pass

## Deliverables
- `backend/prisma/schema.prisma` (GIN index added)
- `backend/prisma/migrations/YYYYMMDD_gin_index_email_labels/` (new)
- `sync-message-processor.service.ts` (merge logic)
- `email-folder.service.ts` (unified counts)
- `scripts/audit/fix-email-folder-drift.ts` (new)
