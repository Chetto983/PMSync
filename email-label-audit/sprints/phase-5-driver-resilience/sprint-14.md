# Sprint 14 - IMAP Driver Hardening

| Key | Value |
|-----|-------|
| Phase | 5 - Driver Resilience |
| Sprint | 14 |
| SP | 15 |
| Objective | Fix critical IMAP driver gaps: connection error handling, SMTP resilience, reconnection logic, security hardening |
| Addresses | IM-C1, IM-C2, IM-C3, IM-C4, IM-C5, IM-C6, IM-C7, IM-C8, IM-C9, IM-H1, IM-H2 |

## Context

Deep audit scored IMAP driver at **6.8/10** with 9 CRITICAL issues — highest critical count of any driver. IMAP is inherently complex (RFC 3501 state machine, diverse server implementations). Main gaps: no connection error classification, SMTP has no error handling or pooling, connection pool has race conditions, no reconnection logic, and message IDs aren't validated for path traversal.

## Sprint Backlog

### T-1401: IMAP connection error classification [3 SP] ✅ DONE

- [x] Created `imap-errors.ts` with typed hierarchy: ImapAuthError, ImapNetworkError, ImapServerError, ImapProtocolError
- [x] `classifyImapError()` maps imapflow codes + Node.js error patterns to typed errors
- [x] Wired into `imap-connection-pool.service.ts`: connect() and withConnection() classify errors
- [x] Callers use `error instanceof ImapAuthError` to decide retry vs notify user
- [x] Files: `imap-errors.ts`, `imap-connection-pool.service.ts`, `index.ts`

### T-1402: SMTP error handling and connection pooling [3 SP] ✅ DONE

- [x] Created SmtpError class + classifySmtpError() in imap-errors.ts
- [x] Pooled transport: `pool: true, maxConnections: 5` (reused across sends)
- [x] Timeouts: 30s connect, 15s greeting, 60s socket
- [x] SMTP error handling: 421 (try again), 535 (auth), 550 (rejected), 552 (too large), 451 (rate limit)
- [x] Rate limiter: max 30 messages/minute per account via RateLimiter class
- [x] Transport closed on clearConfig() to prevent connection leaks
- [x] Files: `imap-errors.ts`, `imap-send.service.ts`

### T-1403: Connection pool race condition fix [2 SP] ✅ DONE

- [x] Semaphore already prevents concurrent access (pre-existing: async-mutex)
- [x] Added client.usable check before returning pooled connection
- [x] Added NOOP health check with 5s timeout — verifies server responsiveness
- [x] Dead connections removed from pool, new connection created as fallback
- [x] Idle timeout already in place via cleanupIdleConnections (pre-existing)
- [x] Files: `imap-connection-pool.service.ts`

### T-1404: Automatic reconnection with backoff [2 SP] ✅ DONE

- [x] withConnection() retries on transient errors (ImapNetworkError/ImapServerError) with exponential backoff
- [x] 3 retries, backoff 1s→2s→4s (max 15s), dead connections removed from pool
- [x] Non-retryable errors (auth, protocol) thrown immediately — no pointless retries
- [x] IDLE service already had full reconnection (5 attempts, backoff, mailbox re-select) — pre-existing
- [x] Files: `imap-connection-pool.service.ts`

### T-1405: Message ID path traversal prevention [1 SP] ✅ DONE

- [x] Reject null bytes (`\0`) and `..` sequences in message IDs
- [x] Validate folder path: reject backslashes, control characters (`\x00-\x1f`), empty strings
- [x] UID validation already existed (positive integer check, pre-existing)
- [x] Files: `imap-message.service.ts`

### T-1406: IDLE command resilience [2 SP] ✅ DONE

- [x] After max IDLE failures (5): falls back to polling mode (every 5 min) instead of giving up
- [x] Polling emits synthetic `__POLL__` events to trigger sync reconciliation
- [x] IDLE capability detected at connect time, passed to IDLE service
- [x] Servers without IDLE capability: start in polling mode directly
- [x] IDLE heartbeat: already handled by ImapFlow `maxIdleTime: 29 min` (pre-existing)
- [x] Files: `imap-idle.service.ts`, `imap.driver.ts`

### T-1407: UTF-7 folder name decoding [2 SP] ✅ DONE (pre-existing)

- [x] ImapFlow handles UTF-7 encoding/decoding internally via `iconv-lite` with `utf-7-imap` codec
- [x] `iconv.encode(path, 'utf-7-imap')` for outgoing folder names (create, rename, open)
- [x] `iconv.decode(Buffer.from(path), 'utf-7-imap')` for incoming folder names (list)
- [x] No code changes needed — library handles transparently
- [x] Verified in `node_modules/imapflow/lib/tools.js`

## Dependencies

- S12 complete (establish error handling patterns with Google driver first)
- S13 complete or parallel (Microsoft patterns inform IMAP)

## Risks

- IMAP server diversity: behavior varies between Gmail IMAP, Dovecot, Exchange, Courier, etc.
- Mitigation: Test against 3+ IMAP implementations, use conservative timeouts
- Connection pooling adds complexity
- Mitigation: Pool is optional — single-connection mode as fallback

## Definition of Done

- [x] IMAP errors classified as recoverable vs fatal (T-1401)
- [x] SMTP has connection pooling and error handling (T-1402)
- [x] Connection pool uses mutex + health check — no concurrent access (T-1403)
- [x] Automatic reconnection with exponential backoff (T-1404)
- [x] Message IDs validated against path traversal (T-1405)
- [x] IDLE falls back to polling on failure (T-1406)
- [x] Non-ASCII folder names decoded correctly (T-1407, ImapFlow handles internally)
- [x] `npx tsc --noEmit` passes in backend
- [ ] Existing IMAP driver tests pass
