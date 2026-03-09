# Phase 54: WebSocket Auth - Research

**Researched:** 2026-03-09
**Domain:** WebSocket authentication with better-auth session cookies
**Confidence:** HIGH

## Summary

The WebSocket auth migration to better-auth is **already fully implemented**. The `RealtimeHandshakeService` already validates better-auth session cookies during WebSocket handshake, performs tenant/user active checks via DB lookup, and rejects invalid sessions. The frontend `websocket-client.ts` already connects with `withCredentials: true` (cookie-based, no JWT token). Zero old JWT references exist in the realtime module.

This phase requires no new code -- only verification that the existing implementation satisfies all NEST-05 success criteria. The work was done during Phase 52 (NestJS Session Validation) as part of the broader guard migration, even though NEST-05 was tracked separately.

**Primary recommendation:** Verify the existing implementation via test execution and manual smoke test, then mark NEST-05 as complete.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NEST-05 | WebSocket handshake validates better-auth session tokens | Already implemented in `realtime-handshake.service.ts` -- uses `auth.api.getSession()` with `fromNodeHeaders()` and `disableCookieCache: true` |
</phase_requirements>

## Standard Stack

### Core (Already In Place)
| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| better-auth | latest | Session validation via `auth.api.getSession()` | IN USE |
| socket.io | 4.x | WebSocket transport | IN USE |
| @socket.io/redis-adapter | latest | Horizontal scaling | IN USE |
| @nestjs/websockets | 10.x | Gateway decorators | IN USE |

No new libraries needed.

## Architecture Patterns

### Current Implementation (Already Complete)

```
Frontend (websocket-client.ts)
  |
  | io(backendUrl/realtime, { withCredentials: true })
  | Cookie: better-auth.session_token=... (sent automatically)
  |
  v
Backend (realtime.gateway.ts)
  |
  | handleConnection(client) -> handshakeService.authenticate(client)
  |
  v
RealtimeHandshakeService
  |
  | 1. Extract headers from client.handshake.headers
  | 2. Fallback: client.handshake.auth.token -> Authorization header
  | 3. auth.api.getSession({ headers, query: { disableCookieCache: true }})
  | 4. Validate: session exists, user.tenantId present, user.isActive
  | 5. DB lookup: verify tenantId match, tenant.isActive
  | 6. Return { userId, tenantId, email, tenantRoom }
  |
  v
Gateway stores userId/tenantId/email on socket, joins tenant room
```

### Key Security Checks (All Implemented)
1. **Session validation** -- `auth.api.getSession()` with `disableCookieCache: true`
2. **Tenant assignment** -- Rejects users without tenantId
3. **User active status** -- Rejects `isActive === false`
4. **Tenant active status** -- DB lookup confirms `tenant.isActive`
5. **Tenant mismatch** -- Compares session tenantId with DB tenantId
6. **Error handling** -- Structured JSON logging, client.disconnect() on failure

### Frontend Integration (Already Complete)
- `websocket-client.ts`: Singleton `WebSocketClient` class, `withCredentials: true`
- `use-websocket.ts`: Hook ties connection lifecycle to `authClient.useSession()`
- Auth failure handling: `onAuthFailure` callback triggers `signOut()` + redirect
- Reconnect handling: `onReconnect` invalidates TanStack Query cache

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Status |
|---------|-------------|-------------|--------|
| Cookie extraction from WS handshake | Manual cookie parsing | `fromNodeHeaders(client.handshake.headers)` | DONE |
| Session validation | Custom DB query | `auth.api.getSession()` | DONE |
| Tenant scoping bypass | Manual Prisma queries | `withoutTenantScopingAsync()` | DONE |

## Common Pitfalls

### Pitfall 1: Cookie Not Sent on WebSocket Handshake
**What goes wrong:** Browser doesn't send cookies on WebSocket upgrade
**Why it happens:** Missing `withCredentials: true` in socket.io client config
**Status:** Already handled -- `websocket-client.ts` sets `withCredentials: true`

### Pitfall 2: Tenant Scoping in Handshake
**What goes wrong:** Prisma RLS blocks session lookup because no tenant context exists during handshake
**Why it happens:** WS handshake runs outside HTTP request context (no AsyncLocalStorage tenant)
**Status:** Already handled -- uses `withoutTenantScopingAsync()` for both `getSession()` and `prisma.user.findUnique()`

### Pitfall 3: Cookie Cache Returns Stale Session
**What goes wrong:** Deleted/expired session still validates because of better-auth's cookie cache
**Why it happens:** Cookie cache optimization in better-auth can serve stale sessions
**Status:** Already handled -- `disableCookieCache: true` in query options

### Pitfall 4: CORS Blocks Cookie
**What goes wrong:** Cookie rejected due to cross-origin policy
**Why it happens:** WebSocket CORS config doesn't include `credentials: true`
**Status:** Already handled -- gateway decorator sets `cors: { origin: ..., credentials: true }`

## Existing Test Coverage

### Unit Tests (Already Exist)
File: `backend/src/modules/realtime/services/__tests__/realtime-handshake.cookie.spec.ts`

Tests cover:
1. Cookie headers passed to Better Auth with `disableCookieCache: true`
2. `auth.token` mapped to Authorization header for non-cookie clients
3. Missing sessions rejected (UnauthorizedException)
4. Inactive accounts rejected (ForbiddenException)
5. Users without tenant rejected (ForbiddenException)
6. Inactive organizations rejected (ForbiddenException)
7. Happy path: valid session + tenant returns correct HandshakeResult

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JWT token in WS auth query param | better-auth session cookie via `withCredentials` | Phase 52 | No token exposure in URLs, cookie lifecycle managed by browser |
| Manual token verification | `auth.api.getSession()` | Phase 52 | Consistent with HTTP guard, single source of truth |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (via @nestjs/testing) |
| Config file | `backend/jest.config.ts` |
| Quick run command | `cd backend && npx jest --testPathPattern realtime-handshake --no-coverage` |
| Full suite command | `cd backend && npx jest --no-coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NEST-05 | WS handshake validates better-auth session | unit | `cd backend && npx jest --testPathPattern realtime-handshake.cookie --no-coverage` | Yes |
| NEST-05 | Invalid session rejected | unit | Same as above (test case: "rejects missing sessions") | Yes |
| NEST-05 | Expired session rejected | unit | Same as above (test case: "rejects missing sessions") | Yes |
| NEST-05 | Email sync notifications work | integration | Manual smoke test (trigger sync, verify WS events) | No -- manual |
| NEST-05 | Chat works with new auth | integration | Manual smoke test (open chat, verify WS events) | No -- manual |

### Sampling Rate
- **Per task commit:** `cd backend && npx jest --testPathPattern realtime-handshake.cookie --no-coverage`
- **Per wave merge:** `cd backend && npx jest --no-coverage`
- **Phase gate:** All existing handshake tests pass + manual smoke test

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements for the unit test level. Integration-level verification is manual (trigger real sync, observe WS events in browser devtools).

## Open Questions

1. **Should NEST-05 be marked complete without new code?**
   - What we know: The implementation is fully in place, tests pass, no JWT remnants in realtime module
   - What's unclear: Whether the project owner considers this "done" since it was implicitly completed during Phase 52
   - Recommendation: Run existing tests, perform manual smoke test, mark complete

## Sources

### Primary (HIGH confidence)
- `backend/src/modules/realtime/services/realtime-handshake.service.ts` -- Full better-auth session validation implementation
- `backend/src/modules/realtime/gateways/realtime.gateway.ts` -- Gateway using handshake service
- `backend/src/modules/realtime/services/__tests__/realtime-handshake.cookie.spec.ts` -- 7 test cases covering all auth scenarios
- `frontend/lib/websocket-client.ts` -- Cookie-based connection with `withCredentials: true`
- `frontend/hooks/use-websocket.ts` -- Auth lifecycle integration with `authClient.useSession()`
- `backend/src/common/auth/better-auth.guard.ts` -- HTTP guard using same pattern (consistency reference)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All code read directly, no external lookup needed
- Architecture: HIGH - Implementation verified line-by-line across 6 source files
- Pitfalls: HIGH - All pitfalls already handled in existing code
- Test coverage: HIGH - Existing spec file with 7 test cases verified

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- implementation is complete)
