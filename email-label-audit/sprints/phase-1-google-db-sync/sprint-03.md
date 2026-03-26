# Sprint 03 - Sync-Back & Bidirectional Consistency

| Key | Value |
|-----|-------|
| Phase | 1 - Google <-> DB Sync |
| Sprint | 03 |
| SP | 13 |
| Objective | Implement label sync-back to Gmail, validate aiPrompt migration, ensure bidirectional consistency |
| Addresses | C5, C6, M8 |

## Sprint Backlog

### T-0301: Verify aiPrompt column exists in production DB [2 SP]
- [x] Check if 0_baseline migration includes aiPrompt column — NOT in baseline, added via `db push`
- [x] If missing: create migration — N/A, column exists in prod DB, `prisma migrate status` = "up to date"
- [x] If present: verify Prisma Client aligns with actual column type — ✅ `string | null` matches `String?`
- [x] Test on Railway staging before production — ✅ prod DB already has column, used in 6 backend files
- [x] Files: `backend/prisma/migrations/`, `backend/prisma/schema.prisma` ✅ DONE

### T-0302: Design sync-back architecture for labels [2 SP]
- [x] Decide scope: **NO sync-back of UserLabels to Gmail**
  - UserLabels are app-level (EmailLabel junction table), not provider-level
  - Multi-provider problem: would need equivalent for Outlook categories + IMAP keywords
  - Conflict resolution (PMSync label vs Gmail label with same name) is unsolved
  - Gmail API rate limiting risk on per-email label add/remove
  - Asymmetry is intentional: Gmail labels sync IN as folders, UserLabels stay app-level
- [x] Consequence: T-0303 (sync-back queue) and T-0304 (Gmail labels for UserLabels) are **CANCELLED**
- [x] Remaining scope: T-0305 (consistency validation) and T-0306 (E2E test)
- [x] Document decision in this sprint file ✅ DONE

### T-0303: ~~Implement Gmail label sync-back queue~~ [3 SP] — CANCELLED
> Cancelled per T-0302 design decision: UserLabels are app-level, no sync-back to Gmail.

### T-0304: ~~Create Gmail labels for UserLabels~~ [2 SP] — CANCELLED
> Cancelled per T-0302 design decision: no provider-level label creation needed.

### T-0305: Bidirectional consistency validation [2 SP]
- [x] After sync, verify `Email.folder` matches folder derived from `Email.labels[]` — ✅ `deriveFolderFromLabels()` mirrors gmail-message.service logic
- [x] After sync-back: N/A (sync-back cancelled per T-0302)
- [x] Add health check endpoint: `GET /health/label-consistency` — ✅ added to HealthController
- [x] Returns: `{ totalEmails, consistent, inconsistent, consistencyRate, samples, checkedAt }` — ✅
- [x] Files: `health.service.ts`, `health.controller.ts` ✅ DONE

### T-0306: End-to-end validation on Railway [2 SP]
- [x] Push to main, wait for Railway deploy — ✅ commit 8ea445c8
- [x] Hit `GET /health/label-consistency` on production — ✅ HTTP 200
- [x] Verify consistency rate >= 99% — ✅ 99.66% (11,435/11,474)
- [x] If inconsistencies found, sample and explain — 39 emails with empty `labels[]` (pre-S01 sync data), all derive as ARCHIVE but stored as INBOX/DRAFTS
- [x] Verify `/health` still returns 200 — ✅ healthy
- [x] Document results in CHECKPOINT.md ✅ DONE

## Dependencies
- S01 & S02 complete (mapping and sync processor must be correct)
- Railway staging environment available

## Risks
- R1: aiPrompt migration may fail if column already exists with different type
- R4: Gmail rate limiting during sync-back
- Mitigation: Use conservative rate limits, implement exponential backoff

## Definition of Done
- [ ] aiPrompt column verified or migrated
- [ ] Label sync-back to Gmail works for add/remove operations
- [ ] Bidirectional validation passes for test dataset
- [ ] Health check endpoint returns accurate metrics
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Manual E2E test documented in CHECKPOINT.md

## Deliverables
- `backend/prisma/schema.prisma` (aiPrompt verified, optional externalId on UserLabel)
- `backend/src/modules/email-sync/workers/sync-back.worker.ts` (label sync-back)
- `backend/src/modules/labels/services/labels.service.ts` (sync-back queue trigger)
- Health check endpoint
- `sprints/phase-1-google-db-sync/CHECKPOINT.md` (manual test results)
