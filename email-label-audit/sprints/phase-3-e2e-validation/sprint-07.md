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
- [ ] Test `determineFolderFromLabels()` with all label combinations:
  - System labels only, custom labels only, mixed, empty, multiple categories
- [ ] Test `labelIdToFolderPath()` with all label types
- [ ] Test label merge logic from S02 (union/diff scenarios)
- [ ] Files: `backend/src/modules/email-sync/drivers/google/services/__tests__/gmail-message.service.spec.ts`

### T-0702: Sync processor integration tests [3 SP]
- [ ] Test upsert with various label combinations
- [ ] Test RC-2 label merge (user modified recently vs not)
- [ ] Test folder/labels consistency after upsert
- [ ] Test stale label ID detection and refresh
- [ ] Mock Gmail API responses with realistic label payloads
- [ ] Files: `backend/src/modules/email-sync/services/__tests__/sync-message-processor.service.spec.ts`

### T-0703: Label API endpoint tests [2 SP]
- [ ] Test: create label -> add emails -> list emails by label -> verify emailLabels in response
- [ ] Test: delete label -> verify EmailLabel junction records cleaned
- [ ] Test: bulk add/remove labels -> verify counts
- [ ] Test: label with invalid color -> 400 response
- [ ] Test: aiPrompt max length -> 400 response
- [ ] Files: `backend/src/modules/labels/services/__tests__/labels.service.spec.ts`

### T-0704: Data validation CLI script [2 SP]
- [ ] Script: `scripts/audit/validate-email-label-consistency.ts`
- [ ] Checks:
  - Email.folder matches derivation from Email.labels[]
  - No stale Gmail label IDs (cross-ref with Folder.externalId)
  - No ghost EmailLabel records (soft-deleted UserLabels)
  - Email count per label matches _count.emailLabels
  - All UserLabel colors are valid JSON with hex colors
- [ ] Output: JSON report with totals, inconsistencies, and suggested fixes
- [ ] Can be run: `npx ts-node scripts/audit/validate-email-label-consistency.ts`

### T-0705: Frontend component test for label display [1 SP]
- [ ] Test ThreadListItem renders max 2 labels correctly
- [ ] Test label color fallback when color is null/invalid
- [ ] Test ExpandedMessage shows labels and remove buttons
- [ ] Files: component test files

## Dependencies
- S04-S06 complete (all fixes must be in place to test)

## Risks
- Mocking Gmail API realistically is complex
- Mitigation: Use captured real responses as fixtures

## Definition of Done
- [ ] All unit tests pass
- [ ] Integration tests cover the critical sync flow
- [ ] Validation script runs and reports 0 inconsistencies on test data
- [ ] Component tests verify label rendering
- [ ] `npx tsc --noEmit` passes everywhere

## Deliverables
- Unit test files (updated and new)
- `scripts/audit/validate-email-label-consistency.ts` (new)
- Component test files (new/updated)
