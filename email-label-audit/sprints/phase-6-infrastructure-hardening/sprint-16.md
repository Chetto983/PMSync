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

### T-1601: Webhook replay attack prevention [3 SP] ✅ DONE

- [x] Google/Microsoft push notification webhooks have no replay protection
- [x] Store processed webhook `messageId` in Redis with 24h TTL (Gmail dedup increased from 1h)
- [x] Before processing, check if webhook was already processed — skip if duplicate
- [x] For Google: validate Pub/Sub JWT + webhook token (already existed)
- [x] For Microsoft: validate subscription ID and client state (already existed)
- [x] Add timestamp validation: reject webhooks older than 5 minutes (clock skew tolerance)
- [x] Log rejected webhooks with reason via structured `[WEBHOOK-REJECTED]` logging
- [x] Files: `webhook.controller.ts`, `gmail-webhook.service.ts`, `microsoft-webhook.service.ts`

### T-1602: Scheduler lock serialization [2 SP] ✅ DONE

- [x] Scheduled jobs use Redis locks — already atomic via SET NX PX
- [x] Add lock renewal during long-running jobs: `withAutoRenewLock()` renews every ttl/2
- [x] Handle lock loss mid-execution: check lock ownership before returning results
- [x] Webhook renewal and deep check now use auto-renewing locks
- [x] Files: `redis-lock.service.ts`, `webhook-lifecycle.service.ts`

### T-1603: Folder recursion depth limit [1 SP] ✅ DONE

- [x] Add `MAX_FOLDER_DEPTH = 10` constant
- [x] Reject folder creation/move that would exceed depth limit
- [x] `wouldCreateCircularReference` capped at MAX_FOLDER_DEPTH iterations
- [x] `updateChildrenLevels` stops recursion at MAX_FOLDER_DEPTH
- [x] `getSubtreeDepth` helper for move validation
- [x] Files: `folder-sync.service.ts`

### T-1604: OAuth token refresh race condition [2 SP] ✅ DONE

- [x] Per-account refresh mutex already existed via Redis lock (`token-refresh:{accountId}`)
- [x] Lock wait with exponential backoff already existed
- [x] Added Redis token cache with 5-minute TTL for concurrent readers
- [x] `cacheGet`/`cacheSet` on RedisLockService for shared Redis access
- [x] Files: `redis-lock.service.ts`, `provider-token.service.ts`

### T-1605: Sync token persistence and recovery [2 SP] ✅ DONE

- [x] Catch 404/410 errors on incremental sync (stale historyId / expired deltaLink)
- [x] Clear sync token and fall back to full sync on next cycle
- [x] `lastFullSyncAt` guard prevents full resync more than once per 24h
- [x] Log sync token invalidation with reason for monitoring
- [x] Files: `sync-orchestration.service.ts`, `base-email-sync.service.ts`

### T-1606: Webhook expiration monitoring [2 SP] ✅ DONE

- [x] 6-hourly renewal already existed via `WEBHOOK_RENEWAL` scheduled job
- [x] Enhanced `getHealthStatus` with monitoring metrics
- [x] Added `accountsWithActiveWebhook`, `accountsPolling`, `renewalFailures` counts
- [x] Structured `[WEBHOOK-MONITOR]` log emitted after every renewal cycle
- [x] Microsoft `failOpenToCron` already marks failed renewals as poll-only
- [x] Files: `webhook-lifecycle.service.ts`

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
