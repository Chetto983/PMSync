# Sprint 12 — Checkpoint

## Status

- **Sprint:** 12 — Google Driver Hardening
- **Last Task Completed:** T-1206 — Draft thread validation before creation
- **Next Task:** Sprint 12 COMPLETE. Next: S13 (Microsoft Driver Hardening)
- **Tasks Done:** 6/6
- **SP Completed:** 13/13
- **Last Updated:** 2026-03-27 10:45

## Audit Findings Addressed

- G-C1: Token refresh fails mid-operation — ✅ T-1201 (onTokenRefresh callback in withRetry)
- G-C2: Batch API partial failures silently ignored — ✅ T-1202 (chunking + structured logging)
- G-C3: Rate limit 429 retries amplify load — ✅ T-1203 (rate limiter + consecutive 429 pause)
- G-C4: pageToken passed without validation — ✅ T-1204 (pageToken/messageId/labelId validation)
- G-H1: Attachment size validated after download — ✅ T-1205 (metadata check before download)
- G-H2: Error responses not categorized — ✅ already handled by withRetry (isRetryableError)
- G-H3: createDraft accepts unvalidated threadId — ✅ T-1206 (threads.get validation)
- G-H6: Search query allows operator injection — ✅ T-1204 (sanitizeUserQuery)

## Last Modified Files

- backend/src/common/utils/retry.utils.ts (T-1201: onTokenRefresh callback)
- backend/src/modules/email-sync/drivers/google/google.driver.ts (T-1201/T-1203: token refresh + rate limiting)
- backend/src/modules/email-sync/drivers/google/services/gmail-message.service.ts (T-1202/T-1204/T-1205)
- backend/src/modules/email-sync/drivers/google/services/gmail-send.service.ts (T-1202/T-1206)
- backend/src/modules/email-sync/drivers/google/services/gmail-sync.service.ts (T-1201: token refresh)
- backend/src/modules/email-sync/services/gmail/google-sync.service.ts (T-1201: sync context for refresher)
- backend/src/modules/email-sync/drivers/interfaces/email-driver.interface.ts (T-1202: BatchOperationResult)

## Key Decisions Made

- T-1201: Token refresh via callback pattern (not direct ProviderTokenService injection) to avoid circular deps
- T-1201: onTokenRefresh called at most once per withRetry invocation to prevent refresh loops
- T-1201: Sub-services share same oauth2Client — token update propagates automatically
- T-1202: Gmail batchModify is all-or-nothing per chunk — chunked at 1000 IDs, not per-message
- T-1203: Global rate limiter (100 req/100s) + per-driver consecutive 429 pause (3 strikes → 60s)
- T-1204: Search sanitization wraps user queries in quotes when Gmail operators detected
- T-1205: Metadata fetch before download — trades 1 extra API call for bandwidth savings on large files
- T-1206: Thread validation uses format=minimal (cheapest call), non-404 errors allowed through

## Patterns Established

- `onTokenRefresh` callback in RetryOptions — reusable for Microsoft driver (S13)
- `executeBatchChunked()` pattern — reusable for any Gmail batch operation
- Rate limit guard (consecutive 429 tracking) — reusable for all drivers
- Input validation at service boundary — validators as private methods on service class

## Blockers / Notes

- None. Sprint 12 complete.
- gmail-message.service.ts is 825 lines (exceeds 500-line limit) — pre-existing, needs future split
- Phase 5 continues with S13 (Microsoft Driver Hardening)

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: not affected (backend-only sprint)
