# Sprint 04 — Contacts Sync, Import & Encoding

| Key | Value |
|-----|-------|
| Phase | 2 — Contacts Backend Verification |
| Sprint | 04 |
| SP | 14 |
| Objective | Harden contacts sync token handling, fix vCard encoding, enforce sequential writes |
| Addresses | CON-C1, CON-C2, CON-C3, CON-M1 |

## Sprint Backlog

### T-0401: Handle Google People API sync token expiry [3 SP] ✅ DONE (N/A)
- [x] Read `google-contacts-sync.service.ts` — traced sync flow
- [x] FINDING: Contacts sync does NOT use sync tokens — always full fetch via `fetchAllContacts()`
- [x] `syncToken` field exists in GoogleContactsWebhookService metadata but is always `null`
- [x] CON-C1 is a FALSE POSITIVE — no sync token means no expiry issue
- [x] Calendar sync (separate module) DOES use sync tokens and was already fixed in S02

### T-0402: Enforce etag on Google contact updates [3 SP] ✅ DONE
- [x] Read update flow: ContactCrudService → GoogleContactsSyncService.updateContact
- [x] Store etag from extractContactData (person.etag) into ProviderContact.eTag during sync
- [x] updateContact now fetches stored etag (or fetches from Google API) before update
- [x] Passes etag in requestBody to prevent concurrent modification
- [x] Handles 409 Conflict: re-fetches fresh etag → retries once
- [x] Stores updated etag after successful update for future operations

### T-0403: Enforce sequential writes per user [2 SP] ✅ DONE
- [x] Added RedisLockService to ContactCrudService
- [x] All provider mutations wrapped with `redisLock.withLock()`
- [x] Lock key pattern: `contact-write:{tenantId}:{providerId}` — 30s TTL
- [x] Covers: createContact, updateContact, deleteContact, bulkDeleteContacts
- [x] Serializes: manual CRUD + sync-triggered writes per provider

### T-0404: Fix vCard encoding handling [3 SP] ✅ DONE
- [x] Read `contacts-import.service.ts` — vCard parsing uses `vcf` library (supports 3.0/4.0)
- [x] Added `normalizeVCardEncoding()` preprocessing step before `vCard.parse()`
- [x] UTF-8 BOM stripping (charCode 0xFEFF)
- [x] vCard 2.1 quoted-printable decoding (=XX sequences, soft line breaks)
- [x] CHARSET parameter removal (vcf library doesn't understand it)
- [x] Latin-1 bytes decoded via `String.fromCharCode()` which handles ISO-8859-1 natively
- [x] Backend tsc passes clean. Addresses CON-M1.

### T-0405: Verify contacts sync on production [3 SP]
- [ ] POST /contacts/sync/:providerId — trigger Google sync
- [ ] POST /contacts/sync-all — trigger all providers
- [ ] Verify contacts appear in DB with correct fields
- [ ] Verify incremental sync (only changes fetched)
- [ ] Test POST /contacts/extract-from-emails — creates contacts from threads
- [ ] Check Railway logs for sync errors
- [ ] Document sync flow in CHECKPOINT.md

## Dependencies
- S03 (contacts API verified)

## Risks
- R1: Etag enforcement may break existing sync flow
- Mitigation: Test thoroughly on staging before production
- R2: Sequential write mutex may cause timeouts on large imports
- Mitigation: Set generous TTL (30s), add queue-based processing for bulk

## Definition of Done
- [ ] Google sync token expiry → full sync (graceful)
- [ ] Etag checked on all Google contact updates
- [ ] Per-user write mutex prevents parallel mutations
- [ ] vCard import handles UTF-8, Latin-1, quoted-printable
- [ ] Contacts sync verified on production (Railway)
- [ ] `npx tsc --noEmit` passes
- [ ] Tests pass: `npx jest --testPathPattern=contacts`
