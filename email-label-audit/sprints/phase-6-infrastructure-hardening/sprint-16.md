# Sprint 16 - Security & Sync Hardening

| Key | Value |
|-----|-------|
| Phase | 6 - Infrastructure Hardening |
| Sprint | 16 |
| SP | 12 |
| Objective | Fix webhook security, scheduler lock serialization, folder recursion limits, token refresh races, and sync token persistence |
| Addresses | IF-C3, IF-C4, IF-C5, IF-H1, IF-H2, IF-H3 |

## Context

Infrastructure audit found security gaps in webhook handling (replay attacks possible), scheduler jobs can run concurrently due to lock serialization issues, folder operations have no recursion depth limit, and OAuth token refresh has race conditions across concurrent requests.

## Sprint Backlog

### T-1601: Webhook replay attack prevention [3 SP]

- [ ] Google/Microsoft push notification webhooks have no replay protection
- [ ] Store processed webhook `messageId` (or equivalent idempotency key) in Redis with 24h TTL
- [ ] Before processing, check if webhook was already processed — skip if duplicate
- [ ] For Google: validate `X-Goog-Channel-Token` against stored channel token
- [ ] For Microsoft: validate webhook subscription ID and client state
- [ ] Add timestamp validation: reject webhooks older than 5 minutes (clock skew tolerance)
- [ ] Log rejected webhooks with reason for security monitoring
- [ ] Files: `webhook.controller.ts`, `google-push-notification.service.ts`, `microsoft-webhook.service.ts`

### T-1602: Scheduler lock serialization [2 SP]

- [ ] Scheduled jobs (embedding cleanup, orphan cleanup, sync triggers) use Redis locks
- [ ] Lock acquisition is not atomic with job execution — window where two instances can both acquire
- [ ] Use Redis `SET key value NX PX ttl` (atomic set-if-not-exists with TTL)
- [ ] Add lock renewal during long-running jobs: extend TTL every `ttl/2` interval
- [ ] Handle lock loss mid-execution: check lock ownership before writing results
- [ ] Files: `scheduled-jobs.queue.ts`, `redis-lock.service.ts`

### T-1603: Folder recursion depth limit [1 SP]

- [ ] Hierarchical folder operations (list, delete, move with children) have no depth limit
- [ ] Add `MAX_FOLDER_DEPTH = 10` constant (no email system supports deeper nesting)
- [ ] Reject folder creation/move that would exceed depth limit
- [ ] Recursive listing: bail after `MAX_FOLDER_DEPTH` levels with warning log
- [ ] Files: `folder.service.ts`, `gmail-folder.service.ts`, `microsoft-folder.service.ts`, `imap-folder.service.ts`

### T-1604: OAuth token refresh race condition [2 SP]

- [ ] Concurrent requests for same account can trigger simultaneous token refresh
- [ ] First refresh succeeds, second may get "token already used" error (single-use refresh tokens)
- [ ] Add per-account refresh mutex using Redis lock: `pmsync:token-refresh:{accountId}`
- [ ] If lock already held, wait up to 5 seconds for new token instead of refreshing independently
- [ ] Store refreshed token in Redis cache with 5-minute TTL for concurrent readers
- [ ] Files: `google-auth.service.ts`, `microsoft-auth.service.ts`

### T-1605: Sync token persistence and recovery [2 SP]

- [ ] Sync tokens (Google historyId, Microsoft deltaLink) stored in provider record
- [ ] If token becomes invalid (API returns 404/410), no automatic recovery — sync stops silently
- [ ] Add sync token validation: on 404/410, clear token and trigger full resync
- [ ] Log sync token invalidation with reason for monitoring
- [ ] Add `lastFullSyncAt` timestamp to provider record — prevent full resync more than once per 24h
- [ ] Files: `sync-message-processor.service.ts`, `google-sync.service.ts`, `microsoft-sync.service.ts`

### T-1606: Webhook expiration monitoring [2 SP]

- [ ] Google push notification channels and Microsoft subscriptions expire
- [ ] No monitoring for approaching expiration — channels silently stop working
- [ ] Add scheduled check: every 6 hours, verify active webhook subscriptions
- [ ] If subscription expires within 24 hours: auto-renew
- [ ] If renewal fails: log error, mark account as "poll-only", notify user
- [ ] Add metric: `{ provider, accountsWithActiveWebhook, accountsPolling, renewalFailures }`
- [ ] Files: `google-push-notification.service.ts`, `microsoft-webhook.service.ts`, `scheduled-jobs.queue.ts`

## Dependencies

- S15 complete (worker hardening establishes patterns)
- S12-S14 (driver error types needed for proper error handling)

## Risks

- Webhook replay prevention adds Redis overhead per webhook
- Mitigation: 24h TTL auto-cleans; Redis SET NX is O(1)
- Auto-renewal of webhook subscriptions may hit API rate limits
- Mitigation: Batch renewals, stagger across accounts

## Definition of Done

- [ ] Duplicate webhooks rejected with idempotency check
- [ ] Scheduler locks are atomic and self-renewing
- [ ] Folder operations capped at 10 levels deep
- [ ] Token refresh serialized per account — no duplicate refresh
- [ ] Sync tokens auto-recover on invalidation
- [ ] Webhook subscriptions monitored and auto-renewed
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Security: no replay, no path traversal, no tenant leaks
