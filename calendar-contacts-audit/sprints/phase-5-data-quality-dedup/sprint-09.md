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
- [x] Create `contact-dedup.service.ts` in `backend/src/modules/contacts/services/` ✅ DONE
- [x] Duplicate detection algorithm: email exact + name fuzzy (similarity >= 0.6) + phone normalized ✅ DONE
- [x] Method: `findDuplicates(tenantId, contact) → DuplicateCandidate[]` ✅ DONE
- [x] Method: `mergeContacts(tenantId, primaryId, secondaryId, fieldSelections) → Contact` ✅ DONE
- [x] Merge transfers: provider links, deal/account associations, embeddings ✅ DONE
- [x] Soft-delete secondary contact after merge with mergedInto metadata ✅ DONE
- [ ] Test: exact email duplicate found, fuzzy name match found, merge preserves relations

### T-0902: Fix extract-from-emails deduplication [2 SP]
- [x] Read `contacts-import.service.ts` — find extract-from-emails flow ✅ DONE
- [x] Before creating contact: check if email already exists in tenant ✅ (was already done)
- [x] Batch fuzzy name check via pg_trgm similarity >= 0.6 ✅ DONE
- [x] If exact match: skip ✅ (was already done)
- [x] If fuzzy match: flag for review, don't auto-create ✅ DONE
- [ ] Test: extract from emails with known contacts → no duplicates created

### T-0903: Trigger relationship score recalculation on email sync [2 SP]
- [x] Read `relationship-score.service.ts` — find recalculation trigger ✅ DONE
- [x] After email sync completes: listen to EmailSyncedEvent ✅ DONE
- [x] Use BullMQ job (RELATIONSHIP_SCORE queue) with hourly dedup ✅ DONE
- [x] Recalculate: recency (40%), frequency (30%), reciprocity (20%), trend (10%) ✅ DONE
- [x] Update Contact.relationshipScore and Contact.lastInteractedAt via recalculateAndPersist() ✅ DONE
- [ ] Test: new email synced → contact score updated within 5 minutes

### T-0904: Data hygiene validation script [2 SP]
- [x] Create `scripts/audit/validate-calendar-contacts.mjs` ✅ DONE
- [x] Check 1: Contacts with duplicate emails within same tenant ✅ DONE
- [x] Check 2: Contacts without any provider link (orphan local contacts) ✅ DONE
- [x] Check 3: Calendar events with missing or invalid timezone ✅ DONE
- [x] Check 4: CalendarSyncState with expired sync tokens ✅ DONE
- [x] Check 5: Contacts with stale relationship scores (>30 days old) ✅ DONE
- [x] Output: summary table with counts and sample IDs ✅ DONE

### T-0905: Bulk delete soft-delete with undo window [2 SP]
- [x] Read `contacts.controller.ts` — bulk delete already uses soft-delete ✅
- [x] Add undo endpoint: POST /contacts/bulk/restore ✅ DONE
- [x] Auto-purge soft-deleted contacts after 30 days (CONTACT_PURGE cron, daily 4 AM) ✅ DONE
- [x] Frontend: Undo Snackbar for 10 seconds after bulk delete ✅ DONE
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
