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

### T-1401: IMAP connection error classification [3 SP]

- [ ] All IMAP connection errors currently throw generic `Error` — no way to distinguish recoverable vs fatal
- [ ] Create `ImapConnectionError` hierarchy:
  - `ImapAuthError` (wrong credentials, expired password) — NOT retryable
  - `ImapNetworkError` (timeout, DNS, connection reset) — retryable with backoff
  - `ImapServerError` (server-side errors, mailbox locked) — retryable with delay
  - `ImapProtocolError` (malformed response, unsupported command) — NOT retryable
- [ ] Map imapflow error codes to error classes
- [ ] Callers use `error instanceof ImapAuthError` to decide retry vs notify user
- [ ] Files: `imap.driver.ts`, new `imap-errors.ts`

### T-1402: SMTP error handling and connection pooling [3 SP]

- [ ] SMTP operations (send, reply, forward) have no error handling — raw nodemailer errors bubble up
- [ ] Create `SmtpConnectionError` hierarchy matching IMAP pattern
- [ ] Add connection pooling: `nodemailer.createTransport({ pool: true, maxConnections: 5 })`
- [ ] Add connection timeout: 30 seconds for SMTP connect, 60 seconds for send
- [ ] Handle common SMTP errors: 550 (recipient rejected), 552 (message too large), 421 (try again later)
- [ ] Rate limit outgoing messages: max 30/minute per account (common SMTP server limit)
- [ ] Files: `imap.driver.ts`, `imap-send.service.ts`

### T-1403: Connection pool race condition fix [2 SP]

- [ ] Concurrent operations can grab same connection from pool
- [ ] Add mutex/semaphore around connection acquisition
- [ ] Use `async-mutex` (already in dependencies) for connection checkout/checkin
- [ ] Add connection health check before checkout: send NOOP, verify response
- [ ] Timeout idle connections after 5 minutes (matching existing TTL pattern)
- [ ] Files: `imap.driver.ts`, `imap-connection-pool.service.ts` (if exists)

### T-1404: Automatic reconnection with backoff [2 SP]

- [ ] IMAP connections drop silently (server timeout, network change) with no reconnection
- [ ] Add connection state tracking: `connected`, `connecting`, `disconnected`, `error`
- [ ] On unexpected disconnect: attempt reconnection with exponential backoff (1s, 2s, 4s, 8s, max 60s)
- [ ] Max 5 reconnection attempts before marking account as `connectionFailed`
- [ ] Re-select the previously selected mailbox after reconnection
- [ ] Emit `connectionLost` and `connectionRestored` events for monitoring
- [ ] Files: `imap.driver.ts`

### T-1405: Message ID path traversal prevention [1 SP]

- [ ] Message IDs from IMAP are used in file paths and database queries without validation
- [ ] Add message ID validation: must be numeric UID or match `<[^>]+>` Message-ID format
- [ ] Reject IDs containing `/`, `\`, `..`, `\0` (path traversal characters)
- [ ] Sanitize before use in any file operation or database query
- [ ] Files: `imap.driver.ts`, `imap-message.service.ts`

### T-1406: IDLE command resilience [2 SP]

- [ ] IDLE mode has `maxAttempts` but silently stops after exhaustion — no notification, no recovery
- [ ] After max IDLE failures: log warning, switch to polling mode (every 5 minutes)
- [ ] Add IDLE heartbeat check: if no response in 29 minutes (RFC 2177 limit), re-issue IDLE
- [ ] Handle servers that don't support IDLE: detect capability, fall back to polling
- [ ] Files: `imap.driver.ts`, `imap-sync.service.ts`

### T-1407: UTF-7 folder name decoding [2 SP]

- [ ] IMAP uses modified UTF-7 encoding for non-ASCII folder names (RFC 3501 Section 5.1.3)
- [ ] Current code passes folder names through without decoding — garbled names for non-Latin scripts
- [ ] Add `utf7.decode()` for folder names received from server
- [ ] Add `utf7.encode()` for folder names sent to server
- [ ] Use `utf-7` npm package (or `iconv-lite`)
- [ ] Test with common cases: German umlauts, Japanese, Cyrillic, emoji folder names
- [ ] Files: `imap-folder.service.ts`, `imap.driver.ts`

## Dependencies

- S12 complete (establish error handling patterns with Google driver first)
- S13 complete or parallel (Microsoft patterns inform IMAP)

## Risks

- IMAP server diversity: behavior varies between Gmail IMAP, Dovecot, Exchange, Courier, etc.
- Mitigation: Test against 3+ IMAP implementations, use conservative timeouts
- Connection pooling adds complexity
- Mitigation: Pool is optional — single-connection mode as fallback

## Definition of Done

- [ ] IMAP errors classified as recoverable vs fatal
- [ ] SMTP has connection pooling and error handling
- [ ] Connection pool uses mutex — no concurrent access
- [ ] Automatic reconnection with exponential backoff
- [ ] Message IDs validated against path traversal
- [ ] IDLE falls back to polling on failure
- [ ] Non-ASCII folder names decoded correctly
- [ ] `npx tsc --noEmit` passes in backend
- [ ] Existing IMAP driver tests pass
