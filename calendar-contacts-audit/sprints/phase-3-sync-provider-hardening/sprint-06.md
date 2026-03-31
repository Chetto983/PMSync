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

### T-0602: Microsoft delta query error handling [3 SP] ✅ DONE
- [x] Read `microsoft-calendar-sync.service.ts` — traced delta token usage
- [x] Read `microsoft-contacts-sync.service.ts` — no delta sync (full fetch each time)
- [x] Handle HTTP 410 → clear delta link → full resync (typed MicrosoftSyncError)
- [x] Handle syncStateNotFound error code (abstract + typed error)
- [x] Handle token cache overflow (older tokens deleted by MS) — covered by 410 handler
- [x] Don't assume ordering in delta response — verified: existingByExternalId map + skipDuplicates
- [x] Test: 410 on calendar sync → full resync (abstract service handles)
- [x] N/A: contacts sync has no delta — uses full fetch

### T-0603: Microsoft contacts webhook fallback polling [3 SP] ✅ DONE
- [x] Read `microsoft-contacts-webhook.service.ts` — verified webhook flow
- [x] MS Graph webhooks for contacts have known delivery gaps
- [x] Implement fallback: checkWebhookSilenceAndPoll() checks lastNotificationAt > 30min
- [x] Track last webhook received timestamp — uses WebhookSubscription.lastNotificationAt (already tracked)
- [x] If no webhook for 30 min → queues normal-priority contacts sync
- [x] Exposed via POST /webhooks/contacts/microsoft/fallback-poll endpoint

### T-0604: DST/timezone edge cases in calendar events [3 SP] ✅ DONE
- [x] Read `calendar-events.service.ts` — traced timezone handling
- [x] Test event creation across DST boundary (spring forward, fall back)
- [x] Recurring event DST: parseDateTimeInTimeZone 2-pass refinement handles transitions
- [x] Verify all-day events stored without timezone offset (date-only format)
- [x] Verify non-UTC timezones stored correctly in CalendarEvent.timeZone
- [x] Add tests for: US/Eastern, Europe/Rome, Asia/Tokyo across DST
- [x] Test: event at 2AM during spring-forward produces valid date
- [x] Expanded WINDOWS_TIMEZONE_ALIASES from 15 to 46 entries

### T-0605: Microsoft folder cache tenant isolation (CON-H4 / MS-C2) [2 SP] ✅ DONE
- [x] Read `microsoft-folder.service.ts` — verified cache architecture
- [x] In-memory cache: MicrosoftDriver is Scope.TRANSIENT — per-instance, can't leak across tenants
- [x] Redis cache: email-folder.service uses `folder-map:{tenantId}:{providerId}` — tenant-isolated
- [x] Fixed: syncMicrosoftFolders provider lookup now validates tenantId
- [x] Fixed: folder deleteMany now includes tenantId in WHERE clause

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
