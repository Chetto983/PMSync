# Sprint 14 — Checkpoint

## Status

- **Sprint:** 14 — IMAP Driver Hardening
- **Last Task Completed:** T-1407 — UTF-7 folder name decoding (pre-existing)
- **Next Task:** Sprint 14 COMPLETE. Phase 5 COMPLETE. Next: Phase 6 S15 (Worker & Queue Hardening)
- **Tasks Done:** 7/7
- **SP Completed:** 15/15
- **Last Updated:** 2026-03-30 13:00

## Audit Findings Addressed

- IM-C1: No connection error classification — ✅ T-1401 (ImapAuthError, ImapNetworkError, ImapServerError, ImapProtocolError)
- IM-C2: SMTP no error handling/pooling — ✅ T-1402 (SmtpError hierarchy, pooled transport, rate limiter)
- IM-C3: Connection pool race condition — ✅ T-1403 (pre-existing semaphore + NOOP health check)
- IM-C4: No reconnection logic — ✅ T-1404 (withConnection retries, IDLE had reconnection pre-existing)
- IM-C5: Message ID path traversal — ✅ T-1405 (null byte, .., control char, backslash rejection)
- IM-C6: IDLE silently stops after max attempts — ✅ T-1406 (falls back to polling mode)
- IM-C7: No IDLE capability detection — ✅ T-1406 (capability passed from driver, polling if unsupported)
- IM-C8: IDLE heartbeat — ✅ pre-existing (ImapFlow maxIdleTime: 29 min)
- IM-C9: UTF-7 folder names — ✅ T-1407 (ImapFlow handles via iconv-lite internally)

## Last Modified Files

- backend/src/modules/email-sync/drivers/imap/imap-errors.ts (T-1401/T-1402: error hierarchies)
- backend/src/modules/email-sync/drivers/imap/index.ts (T-1401: exports)
- backend/src/modules/email-sync/drivers/imap/services/imap-connection-pool.service.ts (T-1401/T-1403/T-1404)
- backend/src/modules/email-sync/drivers/imap/services/imap-send.service.ts (T-1402: pooled transport)
- backend/src/modules/email-sync/drivers/imap/services/imap-message.service.ts (T-1405: path traversal)
- backend/src/modules/email-sync/drivers/imap/services/imap-idle.service.ts (T-1406: polling fallback)
- backend/src/modules/email-sync/drivers/imap/imap.driver.ts (T-1406: pass IDLE capability)

## Key Decisions Made

- T-1401: Error hierarchy follows FolderOperationError pattern (code + retryable flag)
- T-1402: SMTP pooled transport with pool:true, maxConnections:5, 30/min rate limit
- T-1403: NOOP health check with 5s timeout — trades latency for reliability
- T-1404: withConnection retries 3x on transient errors with exponential backoff
- T-1405: Reject null bytes, .., control chars, backslashes in message IDs (not forward slashes — IMAP uses them for folder paths)
- T-1406: Polling mode emits synthetic __POLL__ events every 5 min to trigger sync
- T-1407: No changes needed — ImapFlow handles UTF-7 transparently

## Patterns Established

- `classifyImapError()` + `classifySmtpError()` — reusable error classification for IMAP/SMTP
- `withConnection` auto-retry — transient errors retried transparently, non-retryable thrown
- Polling fallback pattern — when real-time IDLE isn't available, fall back to periodic polling

## Blockers / Notes

- None. Sprint 14 complete. Phase 5 (Driver Resilience) complete.
- Phase 6 starts with S15 (Worker & Queue Hardening)

## Validation Status

- Backend tsc: ✅ passing
- Frontend tsc: not affected (backend-only sprint)
