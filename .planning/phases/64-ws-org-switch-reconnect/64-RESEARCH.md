# Phase 64: WebSocket Org-Switch Reconnect - Research

**Researched:** 2026-03-10
**Domain:** Frontend WebSocket lifecycle / Socket.IO reconnection
**Confidence:** HIGH

## Summary

This phase wires the org-switch mutation (`useSetActiveOrg`) to trigger a WebSocket disconnect/reconnect cycle, so real-time events arrive from the newly active organization. The entire auth pipeline already supports `activeOrganizationId` -- the backend guard (line 89), the realtime handshake service (line 149), and the auth-token endpoint all resolve tenantId from `session.activeOrganizationId || user.tenantId`. The only missing piece is the frontend: after `authClient.organization.setActive()` updates the session, the existing WebSocket connection still holds a stale token pointing to the old tenant room.

The implementation is purely frontend. The `WebSocketClient` singleton needs a method that disconnects the current socket (destroying the old tenant room subscription), then creates a fresh connection (which fetches a new auth token reflecting the updated `activeOrganizationId`). The `joinedRooms` Set must be preserved across this cycle so `rejoinRooms()` re-subscribes to the same logical rooms under the new tenant scope.

**Primary recommendation:** Add a `reconnectForOrgSwitch()` method to `WebSocketClient` that preserves `joinedRooms`, destroys the socket, creates a new one, and re-joins. Call it from `useSetActiveOrg.onSuccess`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Add WS disconnect + reconnect in `useSetActiveOrg.onSuccess` callback (use-organizations.ts)
- Disconnect first, await connect, then let existing `rejoinRooms()` handle room re-subscription
- Auth token fetch at `/api/v1/realtime/auth-token` will pick up new activeOrganizationId from the updated session cookie

### Room management
- `joinedRooms` set must be preserved across disconnect/reconnect (don't call `disconnect()` which clears rooms -- use socket-level disconnect + new socket creation, or clear and re-join)
- Backend room assignment uses tenantId from the auth token -- new token = new tenant rooms

### Claude's Discretion
- Whether to expose a `reconnectForOrgSwitch()` method on WebSocketClient or wire it externally
- Error handling strategy if reconnect fails after org switch
- Whether to add a brief "reconnecting" log or leave it silent

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ORG-04 | User can switch between organizations | WebSocket reconnect ensures real-time events follow the org switch; currently only HTTP queries switch, WS stays on old tenant |
| P62-04 | Integration gap: OrgSwitcher -> WS handshake -> events from new org | `reconnectForOrgSwitch()` in WebSocketClient + call from `useSetActiveOrg.onSuccess` closes this gap |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| socket.io-client | (existing) | WebSocket client | Already used as singleton in `frontend/lib/websocket-client.ts` |
| @tanstack/react-query | (existing) | Mutation hooks | `useSetActiveOrg` already wired with `onSuccess` |
| better-auth | (existing) | Session management | `setActive()` updates `activeOrganizationId` on session |

### Supporting
No new libraries needed. This is pure wiring of existing infrastructure.

## Architecture Patterns

### Auth Token Chain (verified from source)

The complete chain that makes this work without backend changes:

1. **Frontend:** `authClient.organization.setActive({ organizationId })` -- updates `session.activeOrganizationId` in DB
2. **Frontend:** `authClient.getSession()` -- refreshes session cookie with new `activeOrganizationId`
3. **Frontend:** `websocketClient.reconnectForOrgSwitch()` -- destroys old socket, creates new one
4. **Frontend:** New socket's `auth` callback calls `fetchRealtimeAuthToken()` -> `GET /api/v1/realtime/auth-token`
5. **Backend:** `BetterAuthGuard` resolves `tenantId = session.activeOrganizationId || user.tenantId` (line 89 of better-auth.guard.ts)
6. **Backend:** `RealtimeController.getAuthToken()` issues token with the new `tenantId`
7. **Backend:** `RealtimeHandshakeService.authenticate()` resolves `activeTenantId = session.activeOrganizationId || user.tenantId` (line 149)
8. **Backend:** `RealtimeGateway.handleConnection()` joins client to `tenant:{newTenantId}` room

### Key Insight: `disconnect()` Clears `joinedRooms`

The existing `disconnect()` method (line 480-489 of websocket-client.ts) does:
```typescript
disconnect(): void {
  if (this.socket) {
    this.socket.disconnect();
    this.socket = null;
  }
  this.joinedRooms.clear(); // <-- THIS IS THE PROBLEM
  this.reconnectAttempts = 0;
}
```

A naive "call disconnect then connect" would lose all room subscriptions. The solution: create a method that preserves `joinedRooms` before destroying the socket.

### Pattern: `reconnectForOrgSwitch()`

```typescript
// In WebSocketClient class
async reconnectForOrgSwitch(): Promise<void> {
  // 1. Preserve rooms before destroying socket
  const rooms = new Set(this.joinedRooms);

  // 2. Destroy socket without clearing rooms
  if (this.socket) {
    this.socket.disconnect();
    this.socket = null;
  }
  this.reconnectAttempts = 0;
  this.isConnecting = false;

  // 3. Restore rooms so rejoinRooms() will use them
  this.joinedRooms = rooms;

  // 4. Connect with fresh auth token (picks up new activeOrganizationId)
  await this.connect();

  // 5. rejoinRooms is called inside connect() on 'connected' --
  //    but actually it's called on socket.io 'reconnect' event, not initial connect.
  //    We need to manually call rejoinRooms() after initial connect succeeds.
  this.rejoinRooms();
}
```

**Critical detail:** `rejoinRooms()` is only called on the socket.io `reconnect` event (line 443-451), NOT on initial `connect`. Since `reconnectForOrgSwitch()` creates a brand-new socket (not a socket.io reconnection), we must explicitly call `rejoinRooms()` after `connect()` resolves.

### Anti-Patterns to Avoid
- **Calling `disconnect()` then `connect()`:** Loses `joinedRooms` (the Set is cleared in `disconnect()`).
- **Not awaiting `connect()`:** The `onSuccess` callback in `useSetActiveOrg` must `await` the reconnect to ensure WS is ready before other queries fire.
- **Not calling `rejoinRooms()` after fresh connect:** Socket.IO's reconnect event only fires on automatic reconnections, not when we create a brand new socket manually.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Room preservation | Manual room list serialization | Preserve the existing `joinedRooms` Set reference | Already tracked, just don't clear it |
| Auth token refresh | Custom token refresh logic | Existing `fetchRealtimeAuthToken()` + session cookie | Backend already reads `activeOrganizationId` from session |
| Room re-subscription | Custom room management | Existing `rejoinRooms()` private method | Already iterates `joinedRooms` and emits `join_room` |

## Common Pitfalls

### Pitfall 1: `rejoinRooms()` is private
**What goes wrong:** Can't call `rejoinRooms()` from outside the class.
**Why it happens:** It was designed for internal use on reconnect events.
**How to avoid:** The `reconnectForOrgSwitch()` method lives inside the class, so it has access. No visibility change needed.

### Pitfall 2: Race condition with query invalidation
**What goes wrong:** `queryClient.invalidateQueries()` fires in `useSetActiveOrg.onSuccess` BEFORE the WS reconnect completes. Queries return new-org data, but WS is still connected to old org (or disconnected).
**Why it happens:** `invalidateQueries()` is called without awaiting the reconnect.
**How to avoid:** Call `reconnectForOrgSwitch()` first (await it), then let `invalidateQueries()` proceed. Or accept that queries and WS are eventually consistent (queries will be correct, WS catches up in ~1s).

### Pitfall 3: `connect()` early-returns if `isConnecting` is true
**What goes wrong:** If `connect()` is called while a previous connection attempt is in progress, it resolves immediately without actually connecting.
**Why it happens:** The `isConnecting` guard (line 350-354) prevents concurrent connection attempts.
**How to avoid:** The `reconnectForOrgSwitch()` method resets `isConnecting = false` before calling `connect()`.

### Pitfall 4: `connect()` early-returns if socket is already connected
**What goes wrong:** If the old socket hasn't fully disconnected by the time `connect()` runs, it returns without creating a new socket.
**Why it happens:** The `socket?.connected` check (line 344-348).
**How to avoid:** Set `this.socket = null` before calling `connect()`, which we do in `reconnectForOrgSwitch()`.

### Pitfall 5: Redis connection counter drift
**What goes wrong:** Backend tracks tenant connections in Redis (`ws:tenant:{tenantId}:conns`). If client disconnects from old tenant and reconnects to new tenant, the counter should decrement for old tenant and increment for new tenant.
**Why it happens:** This is handled automatically by the gateway's `handleDisconnect` and `handleConnection` -- no special handling needed.
**How to avoid:** Nothing to do. Backend handles it correctly.

## Code Examples

### Integration in `useSetActiveOrg` (use-organizations.ts)

```typescript
import { websocketClient } from '@/lib/websocket-client';

export function useSetActiveOrg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const res = await authClient.organization.setActive({
        organizationId,
      });
      return res.data;
    },
    onSuccess: async () => {
      await authClient.getSession();
      // Reconnect WS to pick up new activeOrganizationId
      if (websocketClient.isConnected()) {
        try {
          await websocketClient.reconnectForOrgSwitch();
        } catch {
          // WS reconnect failure is non-fatal; data still correct via HTTP
        }
      }
      // Full cache invalidation -- switching org changes all data context
      queryClient.invalidateQueries();
    },
  });
}
```

### `reconnectForOrgSwitch()` method (websocket-client.ts)

```typescript
/**
 * Reconnect WebSocket for organization switch.
 * Preserves joined rooms, destroys current socket, creates new connection
 * with fresh auth token reflecting the new activeOrganizationId.
 */
async reconnectForOrgSwitch(): Promise<void> {
  logger.debug('[WebSocket] Reconnecting for org switch...');

  // Preserve room subscriptions
  const rooms = new Set(this.joinedRooms);

  // Destroy current socket without clearing rooms
  if (this.socket) {
    this.socket.disconnect();
    this.socket = null;
  }
  this.reconnectAttempts = 0;
  this.isConnecting = false;

  // Restore preserved rooms
  this.joinedRooms = rooms;

  // Create new connection (fetches fresh auth token with new tenantId)
  await this.connect();

  // Manually rejoin rooms -- connect() doesn't trigger socket.io 'reconnect' event
  this.rejoinRooms();

  logger.debug('[WebSocket] Org switch reconnect complete', {
    roomCount: this.joinedRooms.size,
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No org switching | `setActive()` updates session | Phase 56 | HTTP queries switch correctly |
| WS ignores org switch | WS reconnect on org switch | Phase 64 (this) | Real-time events follow org switch |

## Open Questions

None. The implementation path is fully clear from source code analysis.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (frontend) |
| Config file | `frontend/jest.config.ts` |
| Quick run command | `cd frontend && npx jest --passWithNoTests` |
| Full suite command | `cd frontend && npx jest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORG-04 | `reconnectForOrgSwitch()` preserves rooms, destroys socket, reconnects | unit | `cd frontend && npx jest --testPathPattern websocket-client` | No - Wave 0 |
| P62-04 | `useSetActiveOrg.onSuccess` calls `reconnectForOrgSwitch()` | manual-only | Manual: switch org in UI, verify WS events arrive from new org | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit` (type-check)
- **Per wave merge:** `cd frontend && npx jest --passWithNoTests`
- **Phase gate:** Type-check green + manual org switch verification

### Wave 0 Gaps
- [ ] No existing unit test for `WebSocketClient` -- but adding one is optional given the method is ~15 lines of straightforward socket lifecycle code. Type-check is the primary gate.

## Sources

### Primary (HIGH confidence)
- `frontend/lib/websocket-client.ts` -- Full WebSocketClient source, `disconnect()` clears `joinedRooms` (line 487), `rejoinRooms()` iterates Set (line 468-475), `connect()` guards (lines 344-354)
- `frontend/hooks/queries/use-organizations.ts` -- `useSetActiveOrg` mutation with `onSuccess` (line 107-112)
- `backend/src/common/auth/better-auth.guard.ts` -- `tenantId = session.activeOrganizationId || user.tenantId` (line 89)
- `backend/src/modules/realtime/services/realtime-handshake.service.ts` -- `activeTenantId = session.activeOrganizationId || user.tenantId` (line 149)
- `backend/src/modules/realtime/gateways/realtime.gateway.ts` -- `handleConnection` joins tenant room, Redis counter tracks connections
- `backend/src/modules/realtime/controllers/realtime.controller.ts` -- `getAuthToken` reads `request.user.tenantId` (set by guard with activeOrg)
- `backend/src/common/auth/__tests__/active-org-guard.spec.ts` -- Tests confirming `activeOrganizationId` flows to `tenantId`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, pure wiring
- Architecture: HIGH - full chain verified from source code
- Pitfalls: HIGH - all edge cases identified from reading actual `disconnect()` and `connect()` implementations

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- internal code, no external dependency changes)
