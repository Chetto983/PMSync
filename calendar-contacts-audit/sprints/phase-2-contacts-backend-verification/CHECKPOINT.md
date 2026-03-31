# Sprint 04 — Checkpoint

## Status

- **Sprint:** 04 — Contacts Sync, Import & Encoding
- **Last Task Completed:** T-0405 — Verify contacts sync on production
- **Next Task:** Sprint 05 (Provider Hardening)
- **Tasks Done:** 5/5
- **SP Completed:** 14/14
- **Last Updated:** 2026-03-31 16:00

## Audit Findings Addressed

- CON-C1: Google sync token 7-day expiry — ✅ FALSE POSITIVE (contacts always does full fetch, no sync tokens)
- CON-C2: Contact etag not checked on updates — ✅ fixed: etag stored during sync, passed in updates, 409 retry
- CON-C3: Parallel contact mutations per user — ✅ fixed: Redis write mutex on all provider mutations
- CON-H2: Contact history endpoint stub — ✅ wired to real Email + CalendarEvent data
- CON-M1: vCard encoding handling — ✅ fixed: QP decoding, BOM strip, CHARSET removal
- CON-M4: Bulk delete lacks undo — ⚠️ confirmed: uses soft-delete (isDeleted=true), acceptable
- CON-M5: Contact search GIN trigram index — ✅ verified
- REM-M1: No reminder controller tests — ✅ added 10 tests

## Last Modified Files

- backend/src/modules/contacts/services/contact-crud.service.ts (Redis lock on all provider mutations)
- backend/src/modules/contacts/services/google-contacts-sync.service.ts (etag enforcement + 409 retry)
- backend/src/modules/contacts/services/base-contacts-sync.service.ts (etag in ExtractedContactData)
- backend/src/modules/contacts/services/contacts-import.service.ts (vCard encoding normalization)
- backend/src/modules/contacts/services/contact-provider-ops.service.ts (getContactHistory)
- backend/src/modules/contacts/controllers/contacts.controller.ts (history endpoint wired)
- backend/src/modules/contacts/contacts.types.ts (ContactInteraction type)
- backend/src/modules/reminder/controllers/reminder.controller.spec.ts (NEW)

## Key Decisions Made

- CON-C1 is N/A: contacts sync always does full fetch via fetchAllContacts(), no sync tokens used
- Etag fetched from stored ProviderContact.eTag first, falls back to Google API fetch
- Redis lock key: `contact-write:{tenantId}:{providerId}` with 30s TTL
- Contact history queries Email.from with `contains` (handles "Name email" format)
- vCard QP decoding interprets bytes as Latin-1 codepoints via String.fromCharCode()

## Blockers / Notes

- None

## Validation Status

- Backend tsc: ✅ passing
- Reminder controller tests: ✅ 10/10 passing
- Contacts webhook tests: ✅ passing (unchanged)
