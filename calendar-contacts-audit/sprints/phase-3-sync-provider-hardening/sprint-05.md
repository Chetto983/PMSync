# Sprint 05 — Google Calendar+Contacts Provider Hardening

| Key | Value |
|-----|-------|
| Phase | 3 — Sync & Provider Hardening |
| Sprint | 05 |
| SP | 15 |
| Objective | Harden Google provider for both calendar and contacts: token refresh, rate limits, error classification |
| Addresses | CAL-C2, CON-C1, CON-C2, CON-C3, CON-M3 |

## Sprint Backlog

### T-0501: Google OAuth2 token refresh resilience [3 SP]
- [ ] Read `google-auth.service.ts` — trace token refresh flow
- [ ] Verify refresh token is used when access token expires
- [ ] Handle refresh token revocation (user revoked access in Google)
- [ ] Add structured error for: token_expired, token_revoked, insufficient_scope
- [ ] Notify user via WebSocket when provider disconnects
- [ ] Test: expired access token → auto-refresh → operation succeeds

### T-0502: Google Calendar rate limit handling [3 SP]
- [ ] Read `google-calendar.provider.ts` — find API call patterns
- [ ] Add exponential backoff on 429 Too Many Requests
- [ ] Add per-user rate budget (max N calls/minute)
- [ ] Track quota usage in Redis with sliding window
- [ ] Gracefully queue excess requests instead of failing
- [ ] Test: burst of sync requests throttled, none dropped

### T-0503: Google Contacts rate limit and quota handling [3 SP]
- [ ] Read `google-contacts-sync.service.ts` — find API call patterns
- [ ] Google People API: 90 requests/minute per user (read), 60/minute (write)
- [ ] Add rate limiter matching Google quotas
- [ ] Handle 429 with retry-after header parsing
- [ ] Full sync on large contact lists: paginate with backoff
- [ ] Test: rate-limited requests retried successfully

### T-0504: Google contact photo etag optimization [2 SP]
- [ ] Read contact sync flow — find photo download logic
- [ ] Store photo etag from Google response
- [ ] Compare etag before re-downloading photo
- [ ] Skip download if etag matches (304 Not Modified equivalent)
- [ ] Track bandwidth savings in structured logs
- [ ] Test: unchanged photo not re-downloaded

### T-0505: Error classification and typed error hierarchy [4 SP]
- [ ] Create `GoogleProviderError` class hierarchy:
  - `GoogleAuthError` (token expired, revoked, insufficient scope)
  - `GoogleRateLimitError` (429, quota exceeded)
  - `GoogleSyncError` (sync token expired, partial sync failure)
  - `GoogleApiError` (generic API error with code/message)
- [ ] Apply to both calendar and contacts Google providers
- [ ] Map each error type to appropriate recovery action
- [ ] Log with structured fields: errorType, provider, userId, retryable
- [ ] Test: each error type triggers correct recovery

## Dependencies
- S02 (calendar sync hardened), S04 (contacts sync hardened)

## Risks
- R1: Rate limiter may be too aggressive, slowing legitimate operations
- Mitigation: Start with Google's documented limits, tune based on production data
- R2: Error hierarchy changes may require updating existing catch blocks
- Mitigation: Ensure backward compat — new errors extend existing base

## Definition of Done
- [ ] Token refresh handles expiry and revocation
- [ ] Rate limiters enforce Google quotas for calendar + contacts
- [ ] Photo etag prevents redundant downloads
- [ ] Typed error hierarchy applied to all Google API calls
- [ ] `npx tsc --noEmit` passes
- [ ] Tests pass: `npx jest --testPathPattern="google.*calendar|google.*contacts"`
