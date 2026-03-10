# Phase 64: WebSocket Org-Switch Reconnect - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

WebSocket reconnects after org switch so real-time events come from the new organization. Closes ORG-04 and P62-04 gaps — OrgSwitcher triggers WS disconnect/reconnect, new handshake uses updated activeOrganizationId from session.

</domain>

<decisions>
## Implementation Decisions

### Reconnect trigger
- Add WS disconnect + reconnect in `useSetActiveOrg.onSuccess` callback (use-organizations.ts)
- Disconnect first, await connect, then let existing `rejoinRooms()` handle room re-subscription
- Auth token fetch at `/api/v1/realtime/auth-token` will pick up new activeOrganizationId from the updated session cookie

### Room management
- `joinedRooms` set must be preserved across disconnect/reconnect (don't call `disconnect()` which clears rooms — use socket-level disconnect + new socket creation, or clear and re-join)
- Backend room assignment uses tenantId from the auth token — new token = new tenant rooms

### Claude's Discretion
- Whether to expose a `reconnectForOrgSwitch()` method on WebSocketClient or wire it externally
- Error handling strategy if reconnect fails after org switch
- Whether to add a brief "reconnecting" log or leave it silent

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `websocketClient` singleton (`frontend/lib/websocket-client.ts`): has `disconnect()`, `connect()`, `rejoinRooms()`, `joinedRooms` tracking
- `useSetActiveOrg` hook (`frontend/hooks/queries/use-organizations.ts`): mutation with `onSuccess` that invalidates all queries
- `onReconnect` handler on websocketClient: already exists for post-reconnect data refresh

### Established Patterns
- WS auth: short-lived token from `/api/v1/realtime/auth-token`, passed in socket.io `auth` callback
- Room tracking: `joinedRooms` Set auto-rejoined on socket.io `reconnect` event
- Singleton pattern: single `websocketClient` instance exported, used across app

### Integration Points
- `useSetActiveOrg.onSuccess` in `use-organizations.ts` — add websocketClient.disconnect() + connect() here
- Backend `RealtimeGateway` — validates token on handshake, assigns rooms by tenantId (no backend changes expected)
- `OrgSwitcher.tsx` — consumes `useSetActiveOrg`, no changes needed (mutation hook handles reconnect)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — pure infrastructure wiring with clear integration points.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 64-ws-org-switch-reconnect*
*Context gathered: 2026-03-10*
