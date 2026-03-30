# Sprint 09 — Data Quality, Dedup Engine & Hygiene

| Key | Value |
|-----|-------|
| Phase | 5 — Data Quality & Deduplication |
| Sprint | 09 |
| SP | 12 |
| Objective | Build backend dedup engine, fix extract-from-emails dedup, recalculate relationship scores |
| Addresses | CON-H3, CON-L1, CON-L2, CON-M2 |

## Sprint Backlog

### T-0901: Backend duplicate detection service [4 SP]
- [ ] Create `contact-dedup.service.ts` in `backend/src/modules/contacts/services/`
- [ ] Duplicate detection algorithm:
  1. Exact email match (primary key for dedup)
  2. Fuzzy name match using PostgreSQL `similarity()` with threshold 0.6
  3. Phone number normalization + exact match
- [ ] Method: `findDuplicates(tenantId, contact) → DuplicateCandidate[]`
- [ ] Method: `mergeContacts(tenantId, primaryId, secondaryId, fieldSelections) → Contact`
- [ ] Merge transfers: provider links, email-label associations, deal/account links
- [ ] Soft-delete secondary contact after merge
- [ ] Test: exact email duplicate found, fuzzy name match found, merge preserves relations

### T-0902: Fix extract-from-emails deduplication [2 SP]
- [ ] Read `contacts-import.service.ts` — find extract-from-emails flow
- [ ] Before creating contact: check if email already exists in tenant
- [ ] Use `findDuplicates()` from T-0901
- [ ] If exact match: skip (or update interaction count)
- [ ] If fuzzy match: flag for review, don't auto-create
- [ ] Test: extract from emails with known contacts → no duplicates created

### T-0903: Trigger relationship score recalculation on email sync [2 SP]
- [ ] Read `relationship-score.service.ts` — find recalculation trigger
- [ ] After email sync completes: emit event to recalculate scores for affected contacts
- [ ] Use BullMQ job (not inline) to avoid slowing sync
- [ ] Recalculate: recency (40%), frequency (30%), reciprocity (20%), trend (10%)
- [ ] Update Contact.relationshipScore and Contact.lastInteractedAt
- [ ] Test: new email synced → contact score updated within 5 minutes

### T-0904: Data hygiene validation script [2 SP]
- [ ] Create `scripts/audit/validate-calendar-contacts.mjs`
- [ ] Check 1: Contacts with duplicate emails within same tenant
- [ ] Check 2: Contacts without any provider link (orphan local contacts)
- [ ] Check 3: Calendar events with missing or invalid timezone
- [ ] Check 4: CalendarSyncState with expired sync tokens
- [ ] Check 5: Contacts with stale relationship scores (>30 days old)
- [ ] Output: summary table with counts and sample IDs

### T-0905: Bulk delete soft-delete with undo window [2 SP]
- [ ] Read `contacts.controller.ts` — find DELETE /contacts/bulk
- [ ] Change bulk delete to soft-delete (set isDeleted=true, deletedAt=now)
- [ ] Add undo endpoint: POST /contacts/bulk/restore
- [ ] Auto-purge soft-deleted contacts after 30 days (BullMQ cron)
- [ ] Frontend: show "Undo" toast for 10 seconds after bulk delete
- [ ] Test: bulk delete → undo within 10s → contacts restored

## Dependencies
- S08 (contacts frontend gaps closed)

## Risks
- R1: Merge operation must handle all relation types (deals, accounts, emails)
- Mitigation: Map all Contact FK relations in Prisma schema before implementing
- R2: Score recalculation on every email sync may be too frequent
- Mitigation: Debounce — recalculate max once per hour per contact

## Definition of Done
- [ ] Duplicate detection service operational (email exact + name fuzzy + phone)
- [ ] Extract-from-emails checks for existing contacts
- [ ] Relationship scores recalculated after email sync
- [ ] Data hygiene script reports 0 critical issues
- [ ] Bulk delete uses soft-delete with undo
- [ ] `npx tsc --noEmit` passes
- [ ] Tests pass: `npx jest --testPathPattern=contacts`
