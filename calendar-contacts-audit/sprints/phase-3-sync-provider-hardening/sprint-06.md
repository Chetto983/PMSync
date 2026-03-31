# Sprint 06 — Microsoft Calendar+Contacts Provider Hardening

| Key | Value |
|-----|-------|
| Phase | 3 — Sync & Provider Hardening |
| Sprint | 06 |
| SP | 14 |
| Objective | Harden Microsoft provider for calendar and contacts: delta query error handling, webhook reliability, DST |
| Addresses | CAL-C3, CON-H4, CAL-H3 |

## Sprint Backlog

### T-0601: Microsoft MSAL token refresh resilience [3 SP] ✅ DONE
- [x] Read `microsoft-oauth.service.ts` — traced MSAL token flow
- [x] Verify silent token refresh works when access token expires
- [x] Handle consent revocation (user removed app in Azure AD)
- [x] Handle interaction_required error (re-auth needed)
- [x] Add structured error for: token_expired, consent_revoked, interaction_required
- [x] Test: expired token → silent refresh → operation succeeds

### T-0602: Microsoft delta query error handling [3 SP]
- [ ] Read `microsoft-calendar-sync.service.ts` — trace delta token usage
- [ ] Read `microsoft-contacts-sync.service.ts` — trace delta token usage
- [ ] Handle HTTP 410 → clear delta link → full resync
- [ ] Handle syncStateNotFound error code
- [ ] Handle token cache overflow (older tokens deleted by MS)
- [ ] Don't assume ordering in delta response — merge logic must be idempotent
- [ ] Test: 410 on calendar sync → full resync
- [ ] Test: 410 on contacts sync → full resync

### T-0603: Microsoft contacts webhook fallback polling [3 SP]
- [ ] Read `microsoft-contacts-webhook.service.ts` — verify reliability
- [ ] MS Graph webhooks for contacts have known delivery gaps
- [ ] Implement fallback: periodic delta poll (every 15 min if no webhook in 30 min)
- [ ] Track last webhook received timestamp in Redis
- [ ] If no webhook for 30 min → trigger delta sync
- [ ] Test: webhook silence triggers fallback poll

### T-0604: DST/timezone edge cases in calendar events [3 SP]
- [ ] Read `calendar-events.service.ts` — find timezone handling
- [ ] Test event creation across DST boundary (spring forward, fall back)
- [ ] Test recurring event that spans DST transition
- [ ] Verify all-day events stored without timezone offset
- [ ] Verify non-UTC timezones stored correctly in CalendarEvent.timeZone
- [ ] Add tests for: US/Eastern, Europe/Rome, Asia/Tokyo across DST
- [ ] Test: event at 2AM during spring-forward shows correct time

### T-0605: Microsoft folder cache tenant isolation (CON-H4 / MS-C2) [2 SP]
- [ ] Read `microsoft-folder.service.ts` — verify cache key includes tenantId
- [ ] Verify Redis cache keys: `ms-folder:{tenantId}:{userId}` (not just userId)
- [ ] Test: two tenants with same user email see different folder caches
- [ ] Fix if tenant isolation is missing — critical security issue

## Dependencies
- S05 (Google hardened)

## Risks
- R1: MS Graph API behavior may differ between /v1.0 and /beta
- Mitigation: Use v1.0 for contacts/calendar, only beta for features not in v1.0
- R2: DST tests require specific timezone awareness in test environment
- Mitigation: Use fixed dates known to cross DST boundaries (e.g., 2026-03-08 US, 2026-03-29 EU)

## Definition of Done
- [ ] MSAL token refresh handles expiry and revocation
- [ ] Delta 410 triggers full resync for both calendar and contacts
- [ ] Contacts webhook fallback polling operational
- [ ] DST edge cases handled in event creation and recurring events
- [ ] Folder cache tenant-isolated (security verified)
- [ ] `npx tsc --noEmit` passes
- [ ] Tests pass: `npx jest --testPathPattern="microsoft.*calendar|microsoft.*contacts"`
