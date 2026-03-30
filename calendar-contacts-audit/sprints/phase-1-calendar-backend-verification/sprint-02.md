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
- [ ] Read `google-calendar-webhook.service.ts` — find subscription TTL
- [ ] Read `microsoft-calendar-webhook.service.ts` — find subscription TTL
- [ ] Add cron job (BullMQ repeatable) to renew before expiry (80% of TTL)
- [ ] Track subscription expiry in DB or Redis with TTL key
- [ ] Log renewal success/failure with structured logging
- [ ] Add health check for webhook subscription freshness
- [ ] Test: subscription renewal fires before expiry

### T-0202: Handle Google sync token expiration [3 SP]
- [ ] Read `abstract-calendar-sync.service.ts` — trace sync token usage
- [ ] Read `google-calendar-sync.service.ts` — find token storage
- [ ] Add try/catch around sync token usage
- [ ] On sync token error → clear token → trigger full sync
- [ ] Log the token expiry event for monitoring
- [ ] Test: expired token triggers graceful full resync (not crash)

### T-0203: Handle Microsoft delta token HTTP 410 [3 SP]
- [ ] Read `microsoft-calendar-sync.service.ts` — trace delta token usage
- [ ] Add HTTP 410 detection in MS Graph response handling
- [ ] On 410 → clear delta link → trigger full resync
- [ ] Also handle `syncStateNotFound` error code
- [ ] Log the resync event with reason
- [ ] Test: 410 response triggers full resync

### T-0204: Add sync queue DLQ monitoring [2 SP]
- [ ] Read `calendar-sync-queue.service.ts` — check DLQ configuration
- [ ] Add failed job count to health endpoint
- [ ] Alert when DLQ depth > threshold (configurable, default 10)
- [ ] Add retry-with-backoff for transient failures
- [ ] Test: failed sync job lands in DLQ, health reports it

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
