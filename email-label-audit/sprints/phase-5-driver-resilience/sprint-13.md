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

### T-1302: Tenant isolation in folder service [3 SP]

- [ ] `microsoft-folder.service.ts` uses class-level `folderIdCache` and `folderPathCache`
- [ ] These caches are shared across ALL tenants — tenant A can see tenant B's folder IDs
- [ ] Change to `Map<string, Map<string, string>>` keyed by `tenantId` (or `providerId`)
- [ ] Add `tenantId` parameter to all cache read/write methods
- [ ] Clear only the relevant tenant's cache on invalidation
- [ ] Add unit test: two tenants with same folder name get independent cache entries
- [ ] Files: `microsoft-folder.service.ts`

### T-1303: Batch request 401 handling [2 SP]

- [ ] Microsoft Graph `$batch` endpoint can return 200 overall but 401 on individual requests
- [ ] Parse individual response status codes in batch response
- [ ] On 401 within batch: refresh token, retry ONLY the failed requests (not entire batch)
- [ ] Add retry budget: max 1 retry per batch request (prevent infinite loops)
- [ ] Log: `{ batchId, totalRequests, succeeded, failed401, retriedSuccessfully }`
- [ ] Files: `microsoft.driver.ts`, `microsoft-batch.service.ts` (if exists)

### T-1304: Delta token age validation [2 SP]

- [ ] Delta tokens (deltaLink from Graph API) are stored without timestamp
- [ ] Old delta tokens can cause Graph API to return `410 Gone` or silently skip changes
- [ ] Store `deltaTokenCreatedAt` alongside `deltaToken` in provider/folder metadata
- [ ] If delta token older than 7 days, discard and do full sync instead
- [ ] Handle `410 Gone` response: clear delta token, trigger full resync
- [ ] Files: `microsoft-sync.service.ts`, `microsoft-folder.service.ts`

### T-1305: Rate limiter activation [1 SP]

- [ ] Rate limiter is defined in Microsoft driver but NOT applied to actual API calls
- [ ] Wire rate limiter to `executeGraphRequest()` or equivalent central method
- [ ] Configure: max 4 requests/second per user (Graph API per-user throttling)
- [ ] Add 429 response handling with `Retry-After` header respect
- [ ] Files: `microsoft.driver.ts`

### T-1306: Attachment and inline image handling [2 SP]

- [ ] No size validation on attachment download from Graph API
- [ ] Add `Content-Length` pre-check before download (max 150MB per Graph API)
- [ ] Inline images (`contentId` present) not distinguished from regular attachments
- [ ] Mark inline attachments with `isInline: true` in canonical message
- [ ] Skip embedding generation for inline images (they're decorative, not content)
- [ ] Files: `microsoft-message.service.ts`

## Dependencies

- S12 complete (Google driver patterns should be established first for consistency)
- No dependency on S10/S11

## Risks

- MSAL token refresh may require user re-consent for some scopes
- Mitigation: Graceful degradation — mark account as "needs re-auth", continue with cached data
- Delta token age check may trigger unnecessary full syncs
- Mitigation: 7-day threshold is conservative; Graph API typically invalidates after 30 days

## Definition of Done

- [ ] Token refresh works proactively and on 401 errors
- [ ] Folder cache is tenant-isolated (no cross-tenant data leaks)
- [ ] Batch 401s handled with targeted retry
- [ ] Delta tokens validated for age, stale tokens trigger full resync
- [ ] Rate limiter actively throttles Graph API calls
- [ ] Attachment size validated before download
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Existing Microsoft driver tests pass
