# Sprint 04 — Contacts Sync, Import & Encoding

| Key | Value |
|-----|-------|
| Phase | 2 — Contacts Backend Verification |
| Sprint | 04 |
| SP | 14 |
| Objective | Harden contacts sync token handling, fix vCard encoding, enforce sequential writes |
| Addresses | CON-C1, CON-C2, CON-C3, CON-M1 |

## Sprint Backlog

### T-0401: Handle Google People API sync token expiry [3 SP]
- [ ] Read `google-contacts-sync.service.ts` — trace sync token usage
- [ ] Google sync tokens expire after 7 days of inactivity
- [ ] Add EXPIRED_SYNC_TOKEN error detection
- [ ] On expired token → clear stored token → trigger full sync
- [ ] Log the expiry event with last sync timestamp
- [ ] Test: simulate expired token → verify full sync triggered

### T-0402: Enforce etag on Google contact updates [3 SP]
- [ ] Read `contact-crud.service.ts` — find update flow
- [ ] Read `google-contacts-sync.service.ts` — find push-to-provider flow
- [ ] Store contact etag from Google People API responses
- [ ] Include etag in update requests to prevent concurrent modification
- [ ] Handle 409 Conflict response → re-fetch → retry with new etag
- [ ] Test: concurrent update scenario handled gracefully

### T-0403: Enforce sequential writes per user [2 SP]
- [ ] Read `contacts.service.ts` and `contacts-import.service.ts`
- [ ] Add per-user mutex (Redis lock) for contact mutations to Google
- [ ] Prevent parallel: bulk import + manual sync + webhook-triggered sync
- [ ] Lock key pattern: `contact-write:{tenantId}:{providerId}`
- [ ] Lock TTL: 30 seconds with auto-extend
- [ ] Test: concurrent writes are serialized, not rejected

### T-0404: Fix vCard encoding handling [3 SP]
- [ ] Read `contacts-import.service.ts` — find vCard parsing logic
- [ ] Test import with UTF-8 encoded vCard (should work)
- [ ] Test import with Latin-1/ISO-8859-1 encoded vCard
- [ ] Test import with vCard 2.1 quoted-printable encoding
- [ ] Add charset detection (check BOM, Content-Type, CHARSET param)
- [ ] Convert all inputs to UTF-8 before parsing
- [ ] Test: non-Latin characters (Japanese, Arabic, accented) preserved correctly

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
