# Sprint 03 — Checkpoint

## Status

- **Sprint:** 03 — Sync-Back & Bidirectional Consistency
- **Last Task Completed:** T-0306 — End-to-end validation on Railway
- **Next Task:** Sprint 04 — EmailLabel Includes & Type Safety (Phase 2)
- **Tasks Done:** 4/4 (T-0303, T-0304 cancelled)
- **SP Completed:** 8/8 (5 SP cancelled with T-0303/T-0304)
- **Last Updated:** 2026-03-26 09:51

## Audit Findings Addressed

- C1: Stale Gmail label IDs — ✅ fixed in S01 (T-0102, T-0103)
- C2: Custom-label-only emails default to INBOX — ✅ fixed in S01 (T-0101)
- C3: Dual folder count query paths — ✅ fixed in S02 (T-0203)
- C5: aiPrompt column missing — ✅ verified exists in prod (added via db push, not migration)
- C6: No sync-back for label changes — ✅ resolved by design decision: UserLabels are app-level, no sync-back
- H5: Atomic label array overwrite during sync — ✅ fixed in S02 (T-0202)
- M1: DRAFT vs DRAFTS inconsistency — ✅ verified false alarm (S01)
- M6: No GIN index on Email.labels[] — ✅ fixed in S02 (T-0201)
- M7: CATEGORY_PERSONAL excluded from sync — ✅ verified handled correctly (S01)

## Last Modified Files

- backend/src/modules/health/services/health.service.ts (label consistency check)
- backend/src/modules/health/controllers/health.controller.ts (GET /health/label-consistency)
- email-label-audit/sprints/phase-1-google-db-sync/sprint-03.md

## Key Decisions Made

- **No sync-back of UserLabels to Gmail** (T-0302 design decision):
  - UserLabels are app-level (EmailLabel junction table), not provider-level
  - Multi-provider problem: would need equivalent for Outlook categories + IMAP keywords
  - Conflict resolution between PMSync labels and Gmail labels is unsolved
  - Gmail API rate limiting risk on per-email label operations
  - Asymmetry is intentional: Gmail labels sync IN, UserLabels stay app-level
- T-0303 (sync-back queue) and T-0304 (Gmail labels for UserLabels) cancelled as consequence
- Sprint rescoped from 13 SP to 8 SP

## Production Validation Results (T-0306)

- **Railway:** ✅ /health → 200, healthy
- **Label consistency:** ✅ 99.66% (11,435/11,474 consistent)
- **39 inconsistencies:** All have empty `labels[]` — pre-S01 sync data where labels weren't populated
  - 38 stored as INBOX but derived as ARCHIVE (empty labels = no INBOX label)
  - 1 stored as DRAFTS but derived as ARCHIVE (HITL test draft with no Gmail labels)
  - These are harmless stale data from before the S01/S02 fixes
  - Next full sync will repopulate labels and resolve them

## Patterns Established

- `deriveFolderFromLabels()` in HealthService mirrors `determineFolderFromLabels()` in gmail-message.service — must be kept in sync
- Health endpoint pattern: diagnostic queries in HealthService, exposed via /health/* routes

## Phase 1 Go/No-Go Assessment

- [x] All C1-C6 findings addressed or explicitly deferred with rationale
- [x] `npx tsc --noEmit` passes in backend
- [x] Existing email sync tests pass (31 in sync-message-processor.service.spec.ts)
- [x] Production validation: 99.66% consistency rate
- **Phase 1 COMPLETE — ready for Phase 2 (DB <-> Frontend)**

## Blockers / Notes

- sync-message-processor.service.ts is 697 lines (over 500 limit) — needs extraction if more code added
- 39 stale-data inconsistencies will self-heal on next full Gmail sync

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: N/A (no frontend changes)
- Production: ✅ deployed and validated on Railway
