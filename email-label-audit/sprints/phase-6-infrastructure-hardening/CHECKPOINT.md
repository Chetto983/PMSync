# Sprint 16 — Checkpoint

## Status

- **Sprint:** 16 — Security & Sync Hardening
- **Last Task Completed:** T-1606 — Webhook expiration monitoring
- **Next Task:** Sprint 16 COMPLETE. Phase 6 COMPLETE. Next: Phase 7 Sprint 17 (Production Validation)
- **Tasks Done:** 6/6
- **SP Completed:** 12/12
- **Last Updated:** 2026-03-30 18:00

## Audit Findings Addressed

- IF-C3: Webhooks have no replay protection — ✅ T-1601 (timestamp validation + 24h dedup TTL + structured logging)
- IF-C4: Scheduler lock not atomic with execution — ✅ T-1602 (withAutoRenewLock with ttl/2 renewal)
- IF-C5: Folder operations have no recursion depth limit — ✅ T-1603 (MAX_FOLDER_DEPTH=10, create/move/circular checks)
- IF-H1: OAuth token refresh race across concurrent requests — ✅ T-1604 (Redis token cache with 5-min TTL)
- IF-H2: Sync token invalidation not handled (404/410) — ✅ T-1605 (catch + clear + lastFullSyncAt 24h guard)
- IF-H3: Webhook subscriptions expire with no auto-renewal monitoring — ✅ T-1606 (structured metrics in health check)

## Last Modified Files

- backend/src/modules/email-sync/controllers/webhook.controller.ts (T-1601: timestamp + dedup logging)
- backend/src/modules/email-sync/services/gmail-webhook.service.ts (T-1601: 24h dedup TTL)
- backend/src/modules/email-sync/services/microsoft-webhook.service.ts (T-1601: expired subscription check + structured logging)
- backend/src/common/services/redis-lock.service.ts (T-1602: withAutoRenewLock, T-1604: cacheGet/cacheSet)
- backend/src/modules/email-sync/services/webhook-lifecycle.service.ts (T-1602: auto-renew locks, T-1606: monitoring metrics)
- backend/src/modules/email-sync/services/folder-sync.service.ts (T-1603: MAX_FOLDER_DEPTH + all recursive limits)
- backend/src/modules/email-sync/services/provider-token.service.ts (T-1604: Redis token cache)
- backend/src/modules/email-sync/services/sync-orchestration.service.ts (T-1605: 404/410 recovery)
- backend/src/modules/email-sync/services/base-email-sync.service.ts (T-1605: clearSyncToken callback)

## Key Decisions Made

- T-1601: Gmail dedup TTL increased from 1h to 24h (covers Google's retry window)
- T-1601: Microsoft expired subscription check uses subscriptionExpirationDateTime from notification body
- T-1602: withAutoRenewLock renews at ttl/2 interval, detects lock theft mid-execution
- T-1603: MAX_FOLDER_DEPTH=10 — no email provider supports deeper nesting
- T-1604: Token cache via RedisLockService.cacheGet/cacheSet (avoids new DI injection)
- T-1605: clearSyncToken passed as callback in OrchestrationContext (avoids new PrismaService injection in orchestration service)
- T-1605: lastFullSyncAt 24h guard prevents infinite full sync loops
- T-1606: Monitoring metrics emitted after every renewal cycle via getHealthStatus()

## Patterns Established

- `[WEBHOOK-REJECTED]` — structured log prefix for security monitoring of rejected webhooks
- `[WEBHOOK-MONITOR]` — structured log prefix for webhook health metrics
- `[IF-H2]` — sync token recovery logging prefix
- `withAutoRenewLock()` — self-renewing distributed lock for long-running operations
- `cacheGet/cacheSet` on RedisLockService — simple Redis cache without separate injection
- `clearSyncToken` callback pattern — avoids injecting PrismaService into orchestration service

## Blockers / Notes

- None. Sprint 16 complete. Phase 6 (Infrastructure Hardening) is now fully complete.
- Phase 7 (Production Validation, Sprint 17) is the final phase.

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: not affected (backend-only sprint)
