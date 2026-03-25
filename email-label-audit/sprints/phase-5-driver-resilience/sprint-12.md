# Sprint 12 - Google Driver Hardening

| Key | Value |
|-----|-------|
| Phase | 5 - Driver Resilience |
| Sprint | 12 |
| SP | 13 |
| Objective | Fix all critical and high-severity gaps in Google driver: token lifecycle, batch error handling, rate limiting, input validation |
| Addresses | G-C1, G-C2, G-C3, G-C4, G-H1, G-H2, G-H3 |

## Context

Deep audit scored Google driver at **7.5/10**. Main gaps: token refresh can fail mid-operation with no recovery, batch API calls silently drop partial failures, rate limit errors trigger retry amplification, and several input validation gaps exist.

## Sprint Backlog

### T-1201: Token refresh mid-operation recovery [3 SP]

- [ ] `GoogleDriver.executeWithRetry()` catches 401 but doesn't refresh token before retry
- [ ] Add token refresh check before each retry attempt in `executeWithRetry()`
- [ ] If `oauth2Client.getAccessToken()` returns expired, call `oauth2Client.refreshAccessToken()` first
- [ ] Handle concurrent token refresh: use per-account mutex to prevent multiple simultaneous refreshes
- [ ] Add `tokenRefreshCount` metric for monitoring
- [ ] Files: `google.driver.ts`, `google-auth.service.ts`

### T-1202: Batch API partial failure handling [3 SP]

- [ ] `gmail-message.service.ts` batch calls (`batchGet`, `batchModify`) treat entire batch as success/fail
- [ ] Parse individual response status codes in batch response body
- [ ] Extract failed message IDs from partial failures (HTTP 404, 403 within batch)
- [ ] Return `{ succeeded: string[], failed: { id: string, error: string }[] }` from batch methods
- [ ] Callers must handle partial failures: log failed IDs, retry individually or skip
- [ ] Add structured logging: `{ batchSize, succeeded, failed, retried }`
- [ ] Files: `gmail-message.service.ts`, `gmail-sync-back.service.ts`

### T-1203: Rate limit handling without amplification [2 SP]

- [ ] Current retry on 429 uses fixed delay — can amplify load during rate limit windows
- [ ] Implement exponential backoff with jitter for 429 responses: `delay = min(baseDelay * 2^attempt + random(0, 1000), 60000)`
- [ ] Read `Retry-After` header from Gmail API 429 responses and use as minimum delay
- [ ] Add per-user rate limit budget: max 25 requests/second (Gmail quota)
- [ ] If 3 consecutive 429s, pause all operations for that account for 60 seconds
- [ ] Files: `google.driver.ts`, `gmail-message.service.ts`

### T-1204: Input validation and sanitization [2 SP]

- [ ] `pageToken` from Gmail pagination responses is passed directly to next request — validate format
- [ ] Add `pageToken` format validation: must be base64-encoded string, max 500 chars
- [ ] Validate `messageId` format before API calls: must match `^[a-f0-9]+$` (hex string)
- [ ] Validate `labelId` format: system labels are uppercase alpha, custom are `Label_[a-zA-Z0-9]+`
- [ ] Sanitize search query in `searchEmails()`: escape special Gmail search operators in user input
- [ ] Files: `gmail-message.service.ts`, `gmail-folder.service.ts`

### T-1205: Attachment size validation timing [1 SP]

- [ ] Size validation currently happens AFTER download starts — wasted bandwidth on large files
- [ ] Check `Content-Length` header before streaming attachment download
- [ ] Reject attachments > 25MB (Gmail limit) before download
- [ ] Add early exit for inline images > 5MB (configurable via env var)
- [ ] Files: `gmail-message.service.ts`

### T-1206: Draft thread validation [2 SP]

- [ ] `createDraft()` accepts `threadId` without validating thread exists or belongs to user
- [ ] Add `threadId` existence check before draft creation
- [ ] Validate thread belongs to same account (multi-tenant isolation)
- [ ] Handle case: thread exists in Google but not yet synced to DB — allow draft, log warning
- [ ] Files: `gmail-message.service.ts`, `email-crud.service.ts`

## Dependencies

- S11 complete (embedding quality changes must be stable)
- No dependency on S09 (can start independently)

## Risks

- Token refresh mutex may slow down concurrent operations for same account
- Mitigation: Mutex is per-account, not global. Short critical section (~200ms)
- Batch partial failure handling changes return types
- Mitigation: Use backward-compatible union type, existing callers treat all as success until migrated

## Definition of Done

- [ ] Token refresh triggers automatically on 401 mid-operation
- [ ] Batch API calls report per-message success/failure
- [ ] 429 responses use exponential backoff with jitter
- [ ] All external IDs validated before API calls
- [ ] Attachment size checked before download
- [ ] Draft thread ownership validated
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Existing Google driver tests pass
