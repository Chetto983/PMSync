# Sprint 09 — Checkpoint

## Status

- **Sprint:** 09 — Data Quality, Dedup Engine & Hygiene
- **Last Task Completed:** T-0905 — Bulk delete soft-delete with undo window
- **Next Task:** Sprint 10 (Dashboard Audit)
- **Tasks Done:** 5/5
- **SP Completed:** 12/12
- **Last Updated:** 2026-03-31 19:30

## Audit Findings Addressed

- CON-H3: No duplicate detection on import — ✅ ContactDedupService + fuzzy check in extractContactsFromEmails
- CON-L1: No contact merge UI — ✅ (frontend done in S08, backend mergeContacts() added in T-0901)
- CON-L2: Extract-from-emails dedup — ✅ Batch pg_trgm fuzzy check, flaggedForReview field
- CON-M2: Relationship score not recalculated on email sync — ✅ BullMQ RELATIONSHIP_SCORE queue, hourly dedup
- CON-M4: Bulk delete lacks undo / soft-delete — ✅ POST /contacts/bulk/restore, 10s undo Snackbar, 30-day auto-purge

## Last Modified Files

- backend/src/modules/contacts/services/contact-dedup.service.ts (new — dedup engine)
- backend/src/modules/contacts/services/contacts-import.service.ts (fuzzy dedup in extract)
- backend/src/modules/contacts/services/relationship-score.service.ts (recalculateAndPersist)
- backend/src/modules/contacts/services/provider-event-handler.service.ts (EmailSynced listener + purge cron)
- backend/src/modules/contacts/services/contact-crud.service.ts (bulkRestore + purgeDeleted)
- backend/src/modules/contacts/services/contacts.service.ts (facade methods)
- backend/src/modules/contacts/controllers/contacts.controller.ts (bulk/restore endpoint)
- backend/src/modules/contacts/dto/contact.dto.ts (BulkRestoreContactsDto)
- backend/src/modules/contacts/contacts.module.ts (ContactDedupService registered)
- backend/src/modules/contacts/contacts.types.ts (flaggedForReview field)
- backend/src/common/config/queue.config.ts (RELATIONSHIP_SCORE + CONTACT_PURGE queues)
- backend/src/common/services/scheduled-jobs.queue.ts (CONTACT_PURGE enum + cron)
- frontend/lib/api/contacts.ts (bulkRestoreContacts, flaggedForReview, contactIds return)
- frontend/components/dashboard/Contacts.tsx (undo Snackbar)
- frontend/components/dashboard/contacts-page/useContactsPageHandlers.ts (undo handlers)
- scripts/audit/validate-calendar-contacts.mjs (new — 5-check hygiene script)

## Key Decisions Made

- Dedup uses 3 layers: email exact (confidence 1.0), name fuzzy (similarity >= 0.6), phone normalized (confidence 0.9)
- Merge transfers: providerContacts, accountContacts, dealContacts, embeddings; sums interaction stats
- Extract-from-emails fuzzy check uses batch SQL (unnest + EXISTS + similarity) for performance
- Relationship score recalc debounced via BullMQ jobId = `score-{tenantId}-{hourSlot}` (max 1/hour/tenant)
- Auto-purge runs daily at 4 AM, iterates all active tenants
- Undo window: 10s Snackbar in frontend, 30-day restore window on backend

## Blockers / Notes

- Some T-0901/T-0902/T-0903 commits absorbed by concurrent CRM worktree (same pattern as S08)
- T-0904 script in .gitignore'd `scripts/audit/` — used `git add -f`
- Pre-existing tsc error in portal pages excluded from validation

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
