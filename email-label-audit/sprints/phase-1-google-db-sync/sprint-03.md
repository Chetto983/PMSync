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
- [ ] Check if 0_baseline migration includes aiPrompt column
- [ ] If missing: create migration `add_aiPrompt_to_user_labels`
- [ ] If present: verify Prisma Client aligns with actual column type
- [ ] Test on Railway staging before production
- [ ] Files: `backend/prisma/migrations/`, `backend/prisma/schema.prisma`

### T-0302: Design sync-back architecture for labels [2 SP]
- [ ] Decide scope: sync UserLabels to Gmail? Or only track Gmail-native labels?
- [ ] If syncing UserLabels to Gmail:
  - Create corresponding Gmail label via `labels.create()`
  - Store Gmail label ID on UserLabel model (new field: `externalId`)
  - On email.addLabel: call `messages.modify()` with `addLabelIds`
  - On email.removeLabel: call `messages.modify()` with `removeLabelIds`
- [ ] Document decision in this sprint file
- [ ] Files: design doc only

### T-0303: Implement Gmail label sync-back queue [3 SP]
- [ ] Add BullMQ job type: `gmail-label-sync-back`
- [ ] Queue job when `labels.service.addEmailsToLabel()` is called
- [ ] Queue job when `labels.service.removeEmailFromLabel()` is called
- [ ] Worker: batch label changes per email, call `messages.modify()`
- [ ] Rate limiting: max 10 requests/second per user
- [ ] Files: `sync-back.worker.ts`, `labels.service.ts`

### T-0304: Create Gmail labels for UserLabels [2 SP]
- [ ] When creating UserLabel, optionally create corresponding Gmail label
- [ ] Store `externalId` (Gmail label ID) on UserLabel
- [ ] When deleting UserLabel, optionally delete Gmail label
- [ ] Add flag: `syncToProvider: boolean` on UserLabel (default: false for existing)
- [ ] Files: `labels.service.ts`, `schema.prisma`

### T-0305: Bidirectional consistency validation [2 SP]
- [ ] After sync, verify `Email.folder` matches folder derived from `Email.labels[]`
- [ ] After sync-back, verify Gmail labels match `Email.labels[]`
- [ ] Add health check endpoint: `/api/email/health/label-consistency`
- [ ] Returns: `{ totalEmails, consistent, inconsistent, staleLabels }`
- [ ] Files: new health controller

### T-0306: End-to-end manual test on Railway [2 SP]
- [ ] Sync emails from Gmail
- [ ] Create UserLabel in PMSync
- [ ] Add emails to label
- [ ] Verify label appears in Gmail (if sync-back enabled)
- [ ] Rename label in Gmail, re-sync, verify PMSync updates
- [ ] Delete label in Gmail, re-sync, verify PMSync handles gracefully
- [ ] Document results in CHECKPOINT.md

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
