# Sprint 13 — Checkpoint

## Status

- **Sprint:** 13 — Microsoft Driver Hardening
- **Last Task Completed:** T-1306 — Attachment and inline image handling (pre-existing)
- **Next Task:** Sprint 13 COMPLETE. Next: S14 (IMAP Driver Hardening)
- **Tasks Done:** 6/6
- **SP Completed:** 13/13
- **Last Updated:** 2026-03-30 12:00

## Audit Findings Addressed

- MS-C1: Token refresh fails mid-operation — ✅ T-1301 (onTokenRefresh callback, propagated to sub-services)
- MS-C2: Folder cache tenant isolation — ✅ T-1302 (TRANSIENT scope = per-instance caches, no leak possible)
- MS-C3: Batch 401 silently ignored — ✅ T-1303 (per-request 401 detection + targeted retry in all 4 batch methods)
- MS-C4: Delta token age not validated — ✅ T-1304 (7-day threshold, stale tokens trigger full resync)
- MS-H1: Rate limiter not applied to API calls — ✅ T-1305 (postBatch helper, 4 req/s, 429/Retry-After handling)
- MS-H2: Attachment size not validated — ✅ T-1306 (pre-existing: 50MB limit, metadata-first check)
- MS-H3: Inline images not distinguished — ✅ T-1306 (pre-existing: isInline flag, embedding skip)

## Last Modified Files

- backend/src/common/utils/retry.utils.ts (T-1305: rate limiter config 240 req/60s)
- backend/src/modules/email-sync/drivers/microsoft/services/microsoft-message.service.ts (T-1305: postBatch helper)
- backend/src/modules/email-sync/drivers/microsoft/services/microsoft-send.service.ts (T-1305: postBatch helper)
- backend/src/modules/email-sync/drivers/microsoft/microsoft.driver.ts (T-1301: tokenRefresher, T-1302: providerIdBound)
- backend/src/modules/email-sync/drivers/microsoft/services/microsoft-sync.service.ts (T-1301/T-1304)

## Key Decisions Made

- T-1301: Token refresh via callback pattern (same as Google S12) — avoids circular deps
- T-1302: TRANSIENT scope is the primary isolation mechanism — folder caches are per-instance
- T-1303: Max 1 retry per batch chunk for 401s — prevents infinite loops
- T-1304: 7-day delta token threshold — conservative (Graph API invalidates after ~30 days)
- T-1305: Rate limiter updated from 60 req/min to 240 req/min (4 req/s) — matches Graph per-user limits
- T-1305: All 8 batch POST calls now go through postBatch() with rate limiting + 429/Retry-After
- T-1306: All requirements already met by existing code — no changes needed

## Patterns Established

- `postBatch()` helper — rate-limited batch POST with 429/Retry-After handling (reusable pattern)
- `setTokenRefresher()` propagation — driver sets once, all sub-services inherit
- `deltaTokenUpdatedAt` validation — reusable for any provider with delta sync

## Blockers / Notes

- None. Sprint 13 complete.
- Phase 5 continues with S14 (IMAP Driver Hardening)

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: not affected (backend-only sprint)
