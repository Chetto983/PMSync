# Sprint 02 — Calendar Sync, Webhooks & Token Management

| Key | Value |
|-----|-------|
| Phase | 1 — Calendar Backend Verification |
| Sprint | 02 |
| SP | 15 |
| Objective | Harden calendar sync token handling, implement webhook renewal, add DLQ monitoring |
| Addresses | CAL-C1, CAL-C2, CAL-C3, CAL-M3 |

## Sprint Backlog

### T-0201: Implement webhook subscription auto-renewal [4 SP]
- [x] Read `google-calendar-webhook.service.ts` — find subscription TTL ✅ 7 days configurable
- [x] Read `microsoft-calendar-webhook.service.ts` — find subscription TTL ✅ 3 days
- [x] Add cron job (BullMQ repeatable) to renew before expiry (80% of TTL) ✅ Already in abstract base (every 6h)
- [x] Track subscription expiry in DB or Redis with TTL key ✅ DB expiresAt field
- [x] Log renewal success/failure with structured logging ✅ Already implemented
- [x] Add health check for webhook subscription freshness ✅ GET /webhooks/calendar/health
- [x] Test: subscription renewal fires before expiry ✅ 5 tests in calendar-webhook-renewal.spec.ts

### T-0202: Handle Google sync token expiration [3 SP]
- [x] Read `abstract-calendar-sync.service.ts` — trace sync token usage ✅
- [x] Read `google-calendar-sync.service.ts` — find token storage ✅
- [x] Add try/catch around sync token usage ✅ Already in abstract base (lines 285-313)
- [x] On sync token error → clear token → trigger full sync ✅ Fixed: now checks response.status, statusCode, and error codes
- [x] Log the token expiry event for monitoring ✅ Logs status + error code
- [x] Test: expired token triggers graceful full resync (not crash) ✅ 2 tests in calendar-sync-token-expiry.unit.spec.ts

### T-0203: Handle Microsoft delta token HTTP 410 [3 SP]
- [x] Read `microsoft-calendar-sync.service.ts` — trace delta token usage ✅
- [x] Add HTTP 410 detection in MS Graph response handling ✅ Fixed: now checks GraphError.statusCode
- [x] On 410 → clear delta link → trigger full resync ✅
- [x] Also handle `syncStateNotFound` error code ✅ Added syncStateNotFound + resyncRequired
- [x] Log the resync event with reason ✅
- [x] Test: 410 response triggers full resync ✅ 3 tests in calendar-sync-token-expiry.unit.spec.ts

### T-0204: Add sync queue DLQ monitoring [2 SP]
- [x] Read `calendar-sync-queue.service.ts` — check DLQ configuration ✅ 3 retries, exponential backoff (5s/10s/20s)
- [x] Add failed job count to health endpoint ✅ Wired CalendarSyncQueueService to /health
- [x] Alert when DLQ depth > threshold (configurable, default 10) ✅ CALENDAR_SYNC_DLQ_THRESHOLD env var + OpsAlert
- [x] Add retry-with-backoff for transient failures ✅ Already configured via QUEUE_PRESETS.CALENDAR_SYNC
- [x] Test: failed sync job lands in DLQ, health reports it ✅ Health tests pass (6/6)

### T-0205: Verify calendar sync on production [3 SP]
- [ ] POST /calendar/sync/:providerId — trigger Google sync
- [ ] Verify events appear in DB after sync
- [ ] Verify incremental sync (only new events fetched)
- [ ] Check Railway logs for sync errors
- [ ] Verify webhook notifications arrive and process correctly
- [ ] Document sync flow in CHECKPOINT.md

## Dependencies
- T-0101 (S01) — endpoints must be verified first

## Risks
- R1: Webhook renewal may require re-authentication with provider
- Mitigation: Verify OAuth token is valid before renewal attempt
- R2: Full resync on large calendars may hit rate limits
- Mitigation: Add rate limiter with exponential backoff

## Definition of Done
- [ ] Webhook auto-renewal cron running, tested
- [ ] Google sync token expiry → full sync (graceful)
- [ ] Microsoft delta 410 → full resync (graceful)
- [ ] DLQ monitoring in health endpoint
- [ ] Sync verified on production (Railway)
- [ ] `npx tsc --noEmit` passes
- [ ] Tests pass: `npx jest --testPathPattern=calendar`
