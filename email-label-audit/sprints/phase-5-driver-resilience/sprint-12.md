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

### T-1201: Token refresh mid-operation recovery [3 SP] ✅ DONE

- [x] `GoogleDriver.executeWithRetry()` catches 401 but doesn't refresh token before retry
- [x] Add `onTokenRefresh` callback to `withRetry` — on 401, invokes callback then retries (once)
- [x] GoogleDriver stores oauth2Client, accepts TokenRefresherFn, propagates to sub-services
- [x] Handle concurrent token refresh: uses ProviderTokenService (Redis distributed lock)
- [x] Add `tokenRefreshCount` metric for monitoring
- [x] Files: `retry.utils.ts`, `google.driver.ts`, `gmail-message/send/sync.service.ts`, `google-sync.service.ts`

### T-1202: Batch API partial failure handling [3 SP] ✅ DONE

- [x] Added `BatchOperationResult` type to `email-driver.interface.ts`
- [x] `gmail-send.service.ts`: `batchMoveMessages`/`batchDeleteMessages` use `executeBatchChunked()` (max 1000 IDs/chunk)
- [x] `gmail-message.service.ts`: `batchSetReadStatus` uses `executeBatchModify()` with same chunking pattern
- [x] Per-chunk failures tracked with `{ ids, error, code }` and structured warn logging
- [x] `batchGetMessages` already had CRIT-1 per-message failure handling (auth/rate-limit/failure-rate detection)
- [x] Files: `email-driver.interface.ts`, `gmail-message.service.ts`, `gmail-send.service.ts`, `google.driver.ts`

### T-1203: Rate limit handling without amplification [2 SP] ✅ DONE

- [x] Existing `withRetry` already had exponential backoff with jitter + `Retry-After` header support
- [x] Wired `googleApiRateLimiter.acquire()` (100 req/100s) before every API call in GoogleDriver
- [x] Added consecutive 429 tracking — after 3 in a row, pauses ALL ops for 60s (account-level cooldown)
- [x] Success resets consecutive 429 counter
- [x] Files: `google.driver.ts`

### T-1204: Input validation and sanitization [2 SP] ✅ DONE

- [x] `pageToken` validated: max 500 chars, base64url charset only
- [x] `messageId` validated: hex string format (`^[a-f0-9]+$/i`)
- [x] `labelId` validated: system labels (`^[A-Z][A-Z_]*$`) or custom (`^Label_[a-zA-Z0-9]+$`)
- [x] Search queries sanitized: Gmail operators (`from:`, `in:`, `label:`, etc.) quoted to prevent injection
- [x] Validation wired into 10 methods: listMessages, getMessage, getMessageRaw, set*Status, addLabels, removeLabels, getAttachment
- [x] Files: `gmail-message.service.ts`

### T-1205: Attachment size validation timing [1 SP] ✅ DONE

- [x] Fetch message metadata FIRST (lightweight) to extract attachment size from MIME part tree
- [x] Reject attachments > 25MB (Gmail limit) before download
- [x] Reject inline images > 5MB (configurable via `GMAIL_MAX_INLINE_SIZE_MB`)
- [x] Only then call `attachments.get()` to download actual content
- [x] Files: `gmail-message.service.ts`

### T-1206: Draft thread validation [2 SP] ✅ DONE

- [x] `saveDraft()` validates threadId exists via `threads.get` (format=minimal) before creation
- [x] 404 → throws error (prevents orphaned drafts referencing non-existent threads)
- [x] Non-404 errors → logs warning, allows draft (thread likely exists but can't verify)
- [x] Thread exists in Google but not synced to DB → allowed (no DB check, only Gmail API)
- [x] Files: `gmail-send.service.ts`

## Dependencies

- S11 complete (embedding quality changes must be stable)
- No dependency on S09 (can start independently)

## Risks

- Token refresh mutex may slow down concurrent operations for same account
- Mitigation: Mutex is per-account, not global. Short critical section (~200ms)
- Batch partial failure handling changes return types
- Mitigation: Use backward-compatible union type, existing callers treat all as success until migrated

## Definition of Done

- [x] Token refresh triggers automatically on 401 mid-operation
- [x] Batch API calls report per-message success/failure
- [x] 429 responses use exponential backoff with jitter
- [x] All external IDs validated before API calls
- [x] Attachment size checked before download
- [x] Draft thread ownership validated
- [x] `npx tsc --noEmit` passes in backend
- [ ] Existing Google driver tests pass (no test suite exists yet — deferred to S17)
