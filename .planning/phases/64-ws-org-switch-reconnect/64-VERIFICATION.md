---
phase: 64-ws-org-switch-reconnect
verified: 2026-03-10T15:30:00Z
status: human_needed
score: 3/3 must-haves verified
re_verification: false
human_verification:
  - test: "Switch active organization in the UI and observe WebSocket reconnect"
    expected: "Browser console shows '[WebSocket] Reconnecting for org switch...' then '[WebSocket] Org switch reconnect complete'. Network tab shows the old WS connection closing and a new one opening. The new connection's handshake sends a fresh auth token that reflects the new activeOrganizationId."
    why_human: "Cannot programmatically drive an org switch through a live browser session. The token content after reconnect requires inspecting the runtime HTTP call to /api/v1/realtime/auth-token and comparing the decoded payload against the switched organization."
  - test: "Verify real-time events arrive from the new organization after switching — not from the old one"
    expected: "After switching org, events scoped to the new tenant (e.g. email:new, sync:status) appear in the UI without a page refresh. Events from the previous org stop arriving."
    why_human: "Requires a live multi-org setup with at least one event triggered per tenant. Cannot be verified statically — depends on backend room assignment using the new auth token's tenantId."
---

# Phase 64: WebSocket Org-Switch Reconnect — Verification Report

**Phase Goal:** WebSocket reconnects after org switch so real-time events come from the new organization
**Verified:** 2026-03-10T15:30:00Z
**Status:** human_needed — all automated checks pass; two runtime behaviors require human testing
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `useSetActiveOrg.onSuccess` triggers WebSocket disconnect and reconnect | VERIFIED | `use-organizations.ts` lines 111-117: `isConnected()` guard + `await websocketClient.reconnectForOrgSwitch()` inside `try/catch`, called before `invalidateQueries()` |
| 2 | After org switch, WS handshake sends new session with updated `activeOrganizationId` | VERIFIED (mechanically) | `reconnectForOrgSwitch()` lines 496-523: nulls the old socket, resets flags, calls `connect()` which invokes `fetchRealtimeAuthToken()` (line 378) — a fresh GET `/api/v1/realtime/auth-token` with `credentials: 'include'` picks up the session already updated by `authClient.getSession()` upstream. Correctness of token content requires human verification at runtime. |
| 3 | Real-time events arrive from the new organization without page refresh | NEEDS HUMAN | Mechanically wired — rooms are preserved and rejoined after connect() resolves (lines 511, 518). Whether the backend assigns the correct tenant rooms from the new token cannot be verified statically. |

**Score:** 3/3 truths mechanically verified; 2 truths require human runtime confirmation.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/lib/websocket-client.ts` | `reconnectForOrgSwitch()` method | VERIFIED | Method present at lines 496-523. Substantive: preserves `joinedRooms` via copy, nulls socket directly (not via `disconnect()`), resets `reconnectAttempts` and `isConnecting`, calls `connect()`, then `rejoinRooms()`. All key implementation requirements from PLAN met. |
| `frontend/hooks/queries/use-organizations.ts` | WS reconnect trigger in `useSetActiveOrg.onSuccess` | VERIFIED | Import at line 11: `import { websocketClient } from '@/lib/websocket-client'`. Trigger at lines 111-117 in `onSuccess`, guarded by `isConnected()`, wrapped in `try/catch`, positioned before `invalidateQueries()`. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `use-organizations.ts` | `websocket-client.ts` | `import websocketClient`, call `reconnectForOrgSwitch` in `onSuccess` | WIRED | Import confirmed line 11; call confirmed lines 113-116 |
| `websocket-client.ts` | `/api/v1/realtime/auth-token` | `fetchRealtimeAuthToken` in `connect()` auth callback | WIRED | `fetchRealtimeAuthToken` defined lines 254-273; called at line 378 inside the `auth` callback of `io()` on every new socket creation, including the one triggered by `reconnectForOrgSwitch()` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| ORG-04 | 64-01-PLAN.md | User can switch between organizations (re-close: WS follows org switch) | SATISFIED | `useSetActiveOrg` already performed the session switch; phase 64 adds WS reconnect so the active org change is reflected in real-time events. Both the mutation trigger and the reconnect logic exist and are wired. |
| P62-04 | 64-01-PLAN.md | Integration gap: OrgSwitcher → WS handshake → events from new org | SATISFIED (mechanically) | The integration chain is now closed: `useSetActiveOrg.onSuccess` → `reconnectForOrgSwitch()` → socket null + `connect()` → `fetchRealtimeAuthToken` → new handshake with updated session → `rejoinRooms()`. Runtime end-to-end confirmation still needed. |

**Orphaned requirements:** None. Both ORG-04 and P62-04 appear in REQUIREMENTS.md mapped to Phase 64 with status Complete.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

Scanned `websocket-client.ts` and `use-organizations.ts` for TODO/FIXME, placeholder returns (`return null`, `return {}`, `return []`), empty handlers (`=> {}`), and console-only implementations. None present in the modified sections.

---

### Critical Implementation Detail: Room Preservation Logic

The reconnect method at lines 499-518 of `websocket-client.ts` handles a subtle correctness requirement: `disconnect()` (line 487) clears `joinedRooms`, which would cause rooms to be lost across an org switch. The method avoids this by:

1. Copying `joinedRooms` to a local `rooms` variable before touching the socket (line 500).
2. Disconnecting the socket directly (`this.socket.disconnect()`) rather than calling `this.disconnect()` (lines 503-506).
3. Restoring `this.joinedRooms = rooms` after reset but before `connect()` (line 511).
4. Calling `rejoinRooms()` explicitly after `connect()` resolves (line 518), because the new socket is not an automatic socket.io reconnect and will not trigger the `reconnect` event handler.

This is correct per the PLAN specification.

---

### Type-Check Result

```
cd frontend && npx tsc --noEmit
(exit 0 — zero errors)
```

---

### Human Verification Required

#### 1. WebSocket reconnect on org switch

**Test:** Log in with a user that belongs to two or more organizations. Open browser DevTools (Console + Network > WS). Switch the active organization via the OrgSwitcher UI.

**Expected:**
- Console: `[WebSocket] Reconnecting for org switch...` then `[WebSocket] Org switch reconnect complete`
- Network WS tab: old connection closes, new connection opens immediately after
- The new connection's first frame includes an auth handshake; the token payload should contain the new `activeOrganizationId`

**Why human:** Requires a live browser session with a real multi-org account. Token content is opaque at the static analysis level.

#### 2. Real-time events scope to new organization after switch

**Test:** After switching org (test 1 above), trigger a tenant-scoped event in the new organization (e.g. trigger an email sync or create a resource). Observe whether the event appears in the UI in real time without refreshing the page. Also confirm events from the previous org do not arrive.

**Expected:** Real-time event from new org appears in UI. No events from previous org appear.

**Why human:** Requires a live backend with distinct data per tenant and the ability to trigger events. The backend room assignment from the new token cannot be validated statically.

---

### Gaps Summary

No automated gaps found. All artifacts exist, are substantive, and are wired correctly. The phase goal is mechanically achieved. The two human verification items are confirmatory — they verify runtime correctness of the auth token content and backend room scoping, not whether the code was written.

---

_Verified: 2026-03-10T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
