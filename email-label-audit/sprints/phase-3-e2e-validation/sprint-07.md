# Sprint 07 - Integration Tests & Data Validation Scripts

| Key | Value |
|-----|-------|
| Phase | 3 - E2E Validation |
| Sprint | 07 |
| SP | 10 |
| Objective | Prove all three layers agree through automated tests and validation scripts |
| Addresses | Cross-layer validation, regression prevention |

## Sprint Backlog

### T-0701: Label mapping unit tests [2 SP]
- [x] Test `determineFolderFromLabels()` with all label combinations: ✅ Already covered in gmail-folder.service.spec.ts (20 tests)
- [x] Test `labelIdToFolderPath()` with all label types: ✅ Already covered via getFolderPathForLabel tests (16 tests)
- [x] Test label merge logic from S02 (union/diff scenarios): ✅ 13 new tests in sync-message-processor.service.spec.ts
- [x] Files: `backend/src/modules/email-sync/services/__tests__/sync-message-processor.service.spec.ts` ✅ DONE

### T-0702: Sync processor integration tests [3 SP]
- [x] Test upsert with various label combinations (new email, existing email, empty labels) ✅
- [x] Test RC-2 label merge (user modified recently preserves state, normal path merges) ✅
- [x] Test folder/labels consistency after upsert (folder change INBOX→TRASH with label merge) ✅
- [x] Test RC-6 conflict detection (conditional update returns 0 rows) ✅
- [x] Test deletion-during-sync error propagation through lock wrapper ✅
- [x] 7 new integration tests in sync-message-processor.service.spec.ts ✅ DONE

### T-0703: Label API endpoint tests [2 SP]
- [x] Test: create label -> add emails -> verify EmailLabel junctions in DB ✅
- [x] Test: delete label -> verify label archived, junctions preserved (soft delete) ✅
- [x] Test: add/remove labels -> verify counts and junction cleanup ✅
- [x] Test: skip duplicates on re-add, empty emailIds -> 400, nonexistent emails -> count 0 ✅
- [x] Note: color/aiPrompt validation already covered by DTO decorators (@Matches, @Length) ✅
- [x] 7 new tests in labels.service.spec.ts ✅ DONE

### T-0704: Data validation CLI script [2 SP]
- [x] Script: `scripts/audit/validate-email-label-consistency.ts` ✅
- [x] Checks:
  - Email.folder matches derivation from Email.labels[] ✅
  - No stale Gmail label IDs (cross-ref with Folder.externalId) ✅
  - No ghost EmailLabel records (soft-deleted UserLabels) ✅
  - Email count per label matches _count.emailLabels ✅
  - All UserLabel colors are valid JSON with hex colors ✅
- [x] Output: JSON report to stderr, human-readable to stdout, exit code 0/1 ✅
- [x] Run: `cd backend && npx ts-node -r dotenv/config ../scripts/audit/validate-email-label-consistency.ts` ✅ DONE

### T-0705: Frontend component test for label display [1 SP]
- [x] Test ThreadListItem renders max 2 user labels (truncates overflow) ✅
- [x] Test AI labels render as outlined chips (max 1) ✅
- [x] Test label color applied as bgcolor on Chip ✅
- [x] Test empty/undefined labels don't crash ✅
- [x] 7 tests in ThreadListItem.test.tsx ✅ DONE

## Dependencies
- S04-S06 complete (all fixes must be in place to test)

## Risks
- Mocking Gmail API realistically is complex
- Mitigation: Use captured real responses as fixtures

## Definition of Done
- [x] All unit tests pass ✅ T-0701 (13 tests), T-0703 (7 tests)
- [x] Integration tests cover the critical sync flow ✅ T-0702 (7 tests)
- [x] Validation script runs and reports 0 inconsistencies on test data ✅ T-0704
- [x] Component tests verify label rendering ✅ T-0705 (7 tests)
- [x] `npx tsc --noEmit` passes everywhere ✅ backend + frontend

## Deliverables
- Unit test files (updated and new)
- `scripts/audit/validate-email-label-consistency.ts` (new)
- Component test files (new/updated)
