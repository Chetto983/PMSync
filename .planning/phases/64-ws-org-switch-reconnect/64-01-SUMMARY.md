---
phase: 64-ws-org-switch-reconnect
plan: 01
subsystem: ui
tags: [websocket, socket.io, organization, realtime, reconnect]

requires:
  - phase: 56-organizations
    provides: org switching via useSetActiveOrg
  - phase: 54-websocket-auth
    provides: WebSocket session-cookie auth

provides:
  - reconnectForOrgSwitch() method on WebSocketClient
  - WS reconnect trigger in useSetActiveOrg.onSuccess

affects: []

tech-stack:
  added: []
  patterns: [socket-preserve-rooms-on-reconnect, non-fatal-ws-reconnect-guard]

key-files:
  created: []
  modified:
    - frontend/lib/websocket-client.ts
    - frontend/hooks/queries/use-organizations.ts

key-decisions:
  - "Manual socket.disconnect() instead of this.disconnect() to preserve joinedRooms across org switch"
  - "WS reconnect wrapped in try/catch -- non-fatal, HTTP data still correct on failure"
  - "Reconnect before invalidateQueries to ensure WS and cache are consistent"

patterns-established:
  - "Org-switch reconnect: preserve rooms, destroy socket, connect fresh, rejoin rooms"

requirements-completed: [ORG-04, P62-04]

duration: 2min
completed: 2026-03-10
---

# Phase 64 Plan 01: WebSocket Org-Switch Reconnect Summary

**reconnectForOrgSwitch() method on WebSocketClient preserving room subscriptions, wired into org-switch onSuccess**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-10T15:01:46Z
- **Completed:** 2026-03-10T15:03:46Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added reconnectForOrgSwitch() to WebSocketClient that preserves joined rooms, destroys the stale socket, creates a fresh connection with new auth token, and re-joins rooms
- Wired reconnect into useSetActiveOrg.onSuccess with isConnected() guard and try/catch for non-fatal failure
- Frontend type-check passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reconnectForOrgSwitch() and wire into useSetActiveOrg** - `9572853f` (feat)

## Files Created/Modified
- `frontend/lib/websocket-client.ts` - Added reconnectForOrgSwitch() public method to WebSocketClient class
- `frontend/hooks/queries/use-organizations.ts` - Added websocketClient import and reconnect call in useSetActiveOrg.onSuccess

## Decisions Made
- Manual socket.disconnect() instead of this.disconnect() to preserve joinedRooms set across the org switch cycle
- WS reconnect is non-fatal (try/catch) -- HTTP data remains correct even if WS fails to reconnect
- Reconnect placed before invalidateQueries() so WS subscription and cache are consistent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- WebSocket org-switch reconnect is complete
- Real-time events will follow the active organization after switching

---
*Phase: 64-ws-org-switch-reconnect*
*Completed: 2026-03-10*
