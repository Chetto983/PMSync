# Sprint 13 - Microsoft Driver Hardening

| Key | Value |
|-----|-------|
| Phase | 5 - Driver Resilience |
| Sprint | 13 |
| SP | 13 |
| Objective | Fix critical gaps in Microsoft driver: token refresh, tenant isolation, batch error handling, delta sync validation |
| Addresses | MS-C1, MS-C2, MS-C3, MS-C4, MS-H1, MS-H2, MS-H3, MS-H4 |

## Context

Deep audit scored Microsoft driver at **6.5/10** — lowest of the three. Main gaps: no active token refresh (relies on library auto-refresh that can fail silently), folder service shares state across tenants, batch operations don't handle 401 within batches, and delta tokens are accepted without age validation.

## Sprint Backlog

### T-1301: Active token refresh with error recovery [3 SP] ✅ DONE

- [x] Wired `onTokenRefresh` callback pattern (from S12) into Microsoft driver
- [x] `setTokenRefresher()` on MicrosoftDriver, propagates to all 3 sub-services
- [x] On 401, withRetry invokes callback → refreshes token via ProviderTokenService → updates axios header
- [x] Token expiry pre-check already handled by ProviderTokenService.getMicrosoftToken (5-min buffer)
- [x] Added `tokenRefreshCount` metric on driver instance
- [x] MicrosoftSyncService overrides syncProvider to capture context for token refresh wiring

### T-1302: Tenant isolation in folder service [3 SP] ✅ DONE

- [x] Verified: caches are on MicrosoftDriver (Scope.TRANSIENT) — each sync creates fresh instance
- [x] The singleton microsoft-folder.service.ts has NO in-memory caches — queries DB with providerId each time
- [x] Added providerIdBound tracking and documentation comments as defense-in-depth
- [x] No cross-tenant data leak possible with TRANSIENT scope

### T-1303: Batch request 401 handling [2 SP] ✅ DONE

- [x] Microsoft Graph `$batch` per-request 401 detection
- [x] Parse individual response status codes in all batch responses
- [x] On 401 within batch: refresh token via onTokenRefresh, retry ONLY failed requests
- [x] Max 1 retry per batch chunk (prevents infinite loops)
- [x] Structured logging of 401 counts and retry outcomes
- [x] Applied to: batchGetMessages, batchSetReadStatus, batchMoveMessages, batchDeleteMessages

### T-1304: Delta token age validation [2 SP] ✅ DONE

- [x] Store `deltaTokenUpdatedAt` alongside `lastSyncToken` in provider metadata
- [x] Validate age before incremental sync — tokens >7 days cleared to force full sync
- [x] 410 Gone handling already present in driver sync service (getChangesSince)
- [x] Files: `microsoft-sync.service.ts` (orchestrator)

### T-1305: Rate limiter activation [1 SP] ✅ DONE

- [x] Rate limiter was already wired to executeWithRetry but NOT to batch POST calls
- [x] Added postBatch() helper to message and send services — all 8 batch POSTs now rate-limited
- [x] Updated config: 240 req/60s (4 req/s per user, up from 60 req/60s)
- [x] 429 response handling with Retry-After header respect in postBatch (1 retry with backoff)
- [x] Files: `retry.utils.ts`, `microsoft-message.service.ts`, `microsoft-send.service.ts`

### T-1306: Attachment and inline image handling [2 SP] ✅ DONE (pre-existing)

- [x] Size validation on download: 50MB limit with metadata-first check in `getAttachment()`
- [x] Content-Length pre-check: metadata fetched with `$select` before binary download
- [x] Inline images distinguished: `isInline: att.isInline || false` in `graphMessageToCanonical()`
- [x] `isInline: true` propagated through AttachmentMeta → base-attachment-handler → DB
- [x] Embedding skip: embedding-composer filters `isInline: false`, `getProcessingStrategy()` returns `metadata-only` for inline images
- [x] All requirements already met by prior work — no code changes needed

## Dependencies

- S12 complete (Google driver patterns should be established first for consistency)
- No dependency on S10/S11

## Risks

- MSAL token refresh may require user re-consent for some scopes
- Mitigation: Graceful degradation — mark account as "needs re-auth", continue with cached data
- Delta token age check may trigger unnecessary full syncs
- Mitigation: 7-day threshold is conservative; Graph API typically invalidates after 30 days

## Definition of Done

- [x] Token refresh works proactively and on 401 errors (T-1301)
- [x] Folder cache is tenant-isolated (no cross-tenant data leaks) (T-1302)
- [x] Batch 401s handled with targeted retry (T-1303)
- [x] Delta tokens validated for age, stale tokens trigger full resync (T-1304)
- [x] Rate limiter actively throttles Graph API calls (T-1305)
- [x] Attachment size validated before download (T-1306, pre-existing)
- [x] `npx tsc --noEmit` passes in backend
- [ ] Existing Microsoft driver tests pass
