# Sprint 01 - Label Mapping & Folder Determination

| Key | Value |
|-----|-------|
| Phase | 1 - Google <-> DB Sync |
| Sprint | 01 |
| SP | 13 |
| Objective | Fix label ID mapping and folder determination so every email lands in the correct folder |
| Addresses | C1, C2, M1, M7 |

## Sprint Backlog

### T-0101: Audit determineFolderFromLabels edge cases [3 SP] ✅ DONE
- [x] Map all possible Gmail labelIds combinations to expected folders
- [x] Handle case: only custom labels (no system labels) -> returns ARCHIVE (not INBOX)
- [x] Handle case: `["CATEGORY_PERSONAL"]` only -> maps to INBOX correctly (verified)
- [x] Handle case: `["STARRED", "Label_xyz"]` only (archived but starred) -> returns ARCHIVE
- [x] `'ARCHIVE'` already exists in CanonicalFolderType — no changes needed
- [x] Fixed both determineFolderFromLabels: gmail-message.service.ts:556 and gmail-folder.service.ts:90
- [x] Added 4 new edge case tests, fixed test setup (missing RealtimeEventsService mock)

### T-0102: Track Gmail label ID -> name mapping [3 SP] ✅ DONE
- [x] syncGmailFolders() returns Map<labelId, labelName> from Gmail API response
- [x] Added getLabelMapping() — queries Folder records (DB as source of truth, no Redis needed)
- [x] Added findStaleLabels() — compares Email.labels[] against valid label IDs
- [x] syncFolders() updated to pass through return value

### T-0103: Refresh stale label IDs during sync [3 SP] ✅ DONE
- [x] cleanStaleLabels() runs after folder sync, finds stale label IDs
- [x] Removes stale IDs from Email.labels[] via batch SQL (PostgreSQL <@ operator)
- [x] Preserves Email.folder — only cleans the raw labels array
- [x] Uses SYSTEM_LABEL_IDS whitelist so system labels are never considered stale
- [x] Batch SQL update (not per-email) — handles up to 5000 emails per sync

### T-0104: Fix labelIdToFolderPath for edge cases [2 SP] ✅ DONE
- [x] Verified DRAFT -> DRAFTS consistent across all 3 functions (M1 = false alarm)
- [x] Label_/label_ prefix already handled correctly
- [x] Added 9 tests covering all system labels + categories (66 total now)

### T-0105: Validate existing data consistency [2 SP] ✅ DONE
- [x] Script finds emails where `folder` doesn't match `labels[]` derivation
- [x] Counts emails with stale/unknown label IDs (0 stale found)
- [x] Findings: 16 mismatches (0.2%) — 1 C2 bug, 15 stale TRASH labels
- [x] Files: `scripts/audit/validate-email-labels.mjs`

## Dependencies
- None (first sprint)

## Risks
- R2: Changing folder determination may reclassify existing emails
- Mitigation: Script validates BEFORE applying changes. Apply to new emails first, then backfill.

## Definition of Done
- [x] `determineFolderFromLabels()` handles all edge cases (unit tests) — T-0101
- [x] `labelIdToFolderPath()` consistent with `determineFolderFromLabels()` — T-0104
- [x] Stale label detection logic implemented — T-0102, T-0103
- [x] Data validation script runs and produces report — T-0105
- [x] `npx tsc --noEmit` passes in backend
- [x] No existing tests broken (66 tests passing)

## Deliverables
- `backend/src/modules/email-sync/drivers/google/services/gmail-message.service.ts` (updated)
- `backend/src/modules/email-sync/services/gmail/gmail-folder.service.ts` (updated)
- `backend/src/modules/email-sync/services/gmail/__tests__/gmail-folder.service.spec.ts` (updated)
- `scripts/audit/validate-email-labels.mjs` (new)
