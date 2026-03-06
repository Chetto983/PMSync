# Phase 47: Infrastructure & Cleanup - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

WebSocket scales horizontally via Redis adapter; CSRF errors are visible and auto-retried; dead code and unused dependencies removed with CI bundle budget; all CBC-encrypted records re-encrypted to GCM with legacy CBC code removed.

Requirements: INFRA-01, INFRA-02, INFRA-03, CLN-01, CLN-02, CLN-03, CLN-04, CLN-05, CLN-06, TEST-10, TEST-11, TEST-12, TEST-13

</domain>

<decisions>
## Implementation Decisions

### CSRF Error Handling (CLN-01, CLN-02, TEST-11)
- Backend returns structured JSON error in API envelope format: `{"error": "CSRF_TOKEN_INVALID", "message": "Security token expired. Please retry."}` with HTTP 403
- Frontend uses silent auto-retry: intercepts CSRF error, fetches fresh token from /auth/csrf-token, retries original request automatically
- 1 retry max — if retry also fails, surface error to user
- CSRF token pre-fetched on app load (during initialization), so first mutation never fails due to missing token
- Error flows through existing ApiExceptionFilter for consistent response shape

### CBC-to-GCM Re-encryption (CLN-06, TEST-13)
- Standalone CLI script (`scripts/re-encrypt-cbc-to-gcm.ts`) — not a Prisma migration
- Batch processing: 100 records per transaction with progress logging
- Script is idempotent — safe to re-run if interrupted (checks for `gcm:` prefix before re-encrypting)
- Supports dry-run mode to preview affected records without writing
- After verified migration (zero CBC records), remove CBC fallback code from `crypto.service.ts`
- Industry best practice (2025/2026): remove legacy cipher code after verified migration — "crypto ossification" is an anti-pattern per TLS 1.3 precedent and Microsoft/NIST guidance

### Bundle Budget & Dependency Cleanup (CLN-04, CLN-05, TEST-12)
- CI bundle budget: 10MB total JS ceiling (current ~8.1MB, ~25% headroom)
- Enforced via CI step that checks `.next/static/chunks/` total size after `next build`
- Dependency audit: use Knip (not depcheck — depcheck is stale, misses modern tooling)
- Knip understands Next.js, TypeScript, and config-only deps natively
- Manual verification of each flagged package before removal
- Dead filter files (all-exceptions, http-exception, throttler-exception): already deleted — CLN-03 is pre-satisfied, just verify absence

### WebSocket Redis Adapter (INFRA-01, INFRA-02, INFRA-03, TEST-10)
- Use `@socket.io/redis-adapter` with `createShardedAdapter()` or standard adapter
- Transport: WebSocket only — remove `'polling'` from `transports` array in gateway decorator. PMSync is a dashboard app, no need for long-polling fallback
- No sticky sessions needed (WebSocket-only transport eliminates the requirement per Socket.IO docs)
- Same Redis instance as BullMQ/rate limiter, but dedicated pub/sub connection pair (`pubClient.duplicate()`)
- Replace in-memory `activeTenantConnections` Map with Redis INCR/DECR counters per tenant — accurate across instances
- Cookie-based auth on WebSocket handshake (same httpOnly cookie strategy as HTTP — already partially implemented in handshake service)
- Pub/sub channels scoped per tenant (INFRA-02) — room names already tenant-prefixed via `buildTenantScopedRoom()`

### Claude's Discretion
- Exact Redis key naming for tenant connection counters
- Socket.IO adapter version selection (standard vs sharded)
- CSRF retry implementation details (axios interceptor vs fetch wrapper)
- Knip configuration file contents
- CI script implementation (shell script vs Node.js)
- Re-encryption script error handling and logging format
- Bundle budget CI step placement in workflow

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `realtime.gateway.ts`: Socket.IO gateway with tenant-scoped rooms, JWT handshake auth, room validation — extend with Redis adapter
- `csrf.middleware.ts`: Double submit cookie via `csrf-csrf` lib, `__Host-csrf` in production, excluded paths defined — extend error handling
- `crypto.service.ts`: GCM encryption active with `gcm:` prefix detection, CBC fallback decryption — target for migration + cleanup
- `api-exception.filter.ts`: Unified error response format — CSRF errors should flow through this
- `RealtimeHandshakeService`: Already handles JWT auth on WebSocket connect via cookies
- `buildTenantScopedRoom()`: Tenant-prefixed room names already implemented
- `@next/bundle-analyzer`: Already installed in frontend, just needs CI enforcement

### Established Patterns
- `@Global()` module pattern (MetricsModule, StorageModule) — reusable if WebSocket adapter needs a shared module
- Redis connection via ioredis throughout backend (BullMQ, rate limiter, locks)
- Axios interceptors in frontend for auth token refresh — same pattern for CSRF retry
- `cookie.helper.ts`: Centralized cookie config for auth cookies

### Integration Points
- `realtime.gateway.ts:60-67`: Gateway decorator — remove `'polling'` from transports, add adapter
- `main.ts`: NestJS bootstrap — configure Redis adapter on IoAdapter
- `csrf.middleware.ts:91-96`: `csrfMiddleware` function — enhance error response before calling `doubleCsrfProtection`
- `crypto.service.ts:50+`: CBC decrypt fallback code — remove after migration
- `frontend/next.config.js`: Bundle analyzer config — extend for CI budget
- `.github/workflows/ci.yml`: Add bundle size check step

</code_context>

<specifics>
## Specific Ideas

- WebSocket transport change (drop polling) should be a separate commit before Redis adapter wiring — easier to verify independently
- CSRF pre-fetch should use the same axios instance as API calls to inherit base URL config
- Re-encryption script should output a summary: total records, CBC found, re-encrypted, errors
- Bundle budget should be a warning at 9MB and a failure at 10MB for early visibility

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 47-infrastructure-cleanup*
*Context gathered: 2026-03-06*
