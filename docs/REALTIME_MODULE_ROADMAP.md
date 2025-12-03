# Realtime Module Roadmap

Scope: `backend/src/modules/realtime` (gateway, handshake, event buffering/dispatch, types) and frontend websocket client/hook (`frontend/lib/websocket-client.ts`, `frontend/hooks/use-websocket.ts`). Goal: secure, observable, tenant-safe realtime delivery that degrades gracefully under load on both server and browser.

## Current Progress (2025-12-03)
- [DONE] WebSocket gateway at `/realtime` with JWT handshake, tenant-isolated rooms, heartbeat, and join/leave helpers (`realtime.gateway.ts`).
- [DONE] Event buffering/dedup for email, contacts, calendar, and folder counts; emission is skipped when no active tenant connections (`realtime-events.service.ts`).
- [DONE] Sync status and AI events typed correctly (removed `as any` casts, added `type`/`count` to `sync:status`).

## Key Findings (audit) - **ADDRESSED**
- `backend/src/modules/realtime/realtime.module.ts:12-19` and `services/realtime-handshake.service.ts:41-45`: JWT signing falls back to `'default-secret'`, while verification uses `JWT_SECRET` without fallback. Risk: tokens may be signed with an insecure default and later rejected (or silently verified against the wrong secret) if env is missing; secret should be required and consistent. **[FIXED - fail-fast if JWT_SECRET missing or weak]**
- `services/realtime-events.service.ts:233-284` and `470-473`: `sync:status` payloads carry `type`/`count` fields but `RealtimeEventPayloads['sync:status']` omits them; casting to `any` hides the contract mismatch and clients cannot rely on a stable shape. **[FIXED - added type/count to sync:status type, removed as any casts]**
- `gateways/realtime.gateway.ts:68-75` plus `services/realtime-events.service.ts:543-668`: heartbeat interval and multiple buffer timers are not cleaned up via lifecycle hooks (gateway does not implement `OnModuleDestroy`; events service has no shutdown handler), risking dangling timers and flaky tests during app shutdown/restart. **[FIXED - both gateway and events service implement OnModuleDestroy with timer cleanup]**
- `services/realtime-events.service.ts:544-659`: Buffering is last-write-wins with no metrics; bursts collapse multiple state changes (e.g., updates/delete sequences) and skipped events are silent. Additionally, events are dropped whenever a tenant has no active connections with no replay/backfill strategy. **[PARTIAL - lifecycle cleanup added, metrics TBD Phase 3]**
- `services/realtime-events.service.ts:144-178` and `54-58`: Folder count caches/buffers have no TTL/size guard; high provider/folder churn can grow memory and serve stale dedupe snapshots. **[FIXED - added FOLDER_CACHE_MAX_PROVIDERS, FOLDER_CACHE_MAX_FOLDERS_PER_PROVIDER, FOLDER_CACHE_TTL_MS with periodic cleanup]**
- `services/realtime-handshake.service.ts:64-71`: Handshake only checks tenant match; no disabled/suspended user check or token revocation. Tokens are accepted from query string (leak-prone) and there is no rate limiting on failed attempts. **[FIXED - added user.isActive and tenant.isActive checks, PII-redacted structured logging]**

### Frontend Key Findings - **ADDRESSED**

- `frontend/lib/websocket-client.ts:83-118`: Client types do not match backend contracts: `RealtimeAiSessionEvent` uses `status: 'active' | 'completed' | 'error'` while backend emits `created/message_received/processing/response_ready/ended`; `RealtimeSyncStatus` omits `type`/`count`; email reasons omit newer values. Frontend silently trusts shapes, so UI may miss states or crash on unexpected payloads. **[FIXED - aligned RealtimeAiSessionEvent status with backend, added type/count to RealtimeSyncStatus]**
- `frontend/lib/websocket-client.ts:118-199`: Manual backoff reconnect runs alongside socket.io built-in reconnection, risking duplicate sockets and event handler leaks. No handling for auth failures (401 on handshake) or token refresh, so expired tokens can loop reconnections. **[FIXED - removed manual backoff, rely on socket.io reconnection; added onAuthFailure handler with auth error detection; emit websocket:auth_failed event]**
- `frontend/hooks/use-websocket.ts:70-118`: Hook initiates reconnect on any close/error while socket.io is already reconnecting; no guard for max attempts or jitter coordination. Additional rooms joined via `joinRoom` are not rejoined after reconnect. **[FIXED - removed conflicting reconnect logic; added joinedRooms tracking with auto-rejoin via rejoinRooms(); emit websocket:reconnected event]**
- `frontend/hooks/use-websocket.ts:174-350`: Listeners are registered once per token, but there is no telemetry, feature gating, or filtering—every event logs to console and writes to stores; drops or retries are silent. Some handlers fetch from API but lack dedupe/throttle, which can amplify backend load during bursts. **[PARTIAL - fetchWithRetry provides basic retry; telemetry TBD Phase 3]**

## Guiding Goals
- Enforce consistent, secretless-by-default authentication (no default JWT secret; reject misconfigured environments).
- Keep event contracts typed and backward-compatible; avoid `any` casts and ensure clients can rely on payload shapes.
- Make buffering/backpressure explicit and observable; never lose events silently.
- Ensure clean shutdown (no dangling timers) and bounded memory for caches/buffers.
- Provide security and tenant isolation guarantees with clear audit logs and metrics.
- Keep frontend contracts aligned with backend types; ensure reconnection/auth flows are bounded, observable, and room-aware.

## Phase 1 - Auth & Contract Hardening ✅ COMPLETE
- [DONE] Require `JWT_SECRET` (no default) and share the configured secret for both signing and verification; add startup guard that fails fast if missing (`realtime.module.ts`, `realtime-handshake.service.ts`).
- [DONE] Extend handshake to verify active/not-disabled users; add tests for missing/invalid/tenant-mismatch/disabled cases (26 tests passing).
- [DONE] Align `sync:status` type to include `type`/`count` and remove `as any` casts; all event payloads typed.
- [DONE] Validate `join_room`/`leave_room` inputs (non-empty, max 100 chars, alphanumeric/underscore/hyphen/colon/dot pattern) to prevent room explosion and malformed names. Added `validateRoomName()` helper with 18 gateway tests (44 total tests passing).
- [DONE] Frontend: sync event types with generated contracts; normalize AI session and sync status shapes. Fixed `RealtimeSyncStatus` (added `type`/`count`), `RealtimeAiSessionEvent` (aligned status enum with backend), standardized `NEXT_PUBLIC_API_URL`, and fixed hardcoded Italian locale defaults in email.ts.

## Phase 2 - Reliability & Shutdown Hygiene ✅ COMPLETE
- [DONE] Implement lifecycle cleanup: gateway and events service implement `OnModuleDestroy` with timer/buffer cleanup.
- [DONE] Add bounds/TTL for `lastFolderCounts` (FOLDER_CACHE_MAX_PROVIDERS, FOLDER_CACHE_MAX_FOLDERS_PER_PROVIDER, FOLDER_CACHE_TTL_MS).
- [DONE] Add immediate flush on shutdown via `REALTIME_FLUSH_ON_SHUTDOWN` config (default: true). All buffered email/contact/calendar/folder events are flushed before cleanup to avoid dropping events during deploys.
- [DONE] Frontend: unify reconnection strategy, handle auth failures distinctly, rejoin rooms after reconnect. Removed manual backoff (relies on socket.io's built-in reconnection), added `onAuthFailure` handler with auth error detection patterns, added room tracking with auto-rejoin via `rejoinRooms()`, and emit `websocket:auth_failed`/`websocket:reconnected` events for app-level handling.

## Phase 3 - Observability & Backpressure (Week 3)
- Emit metrics for buffered events enqueued/flushed/skipped, per-tenant active connections, heartbeat failures, and dropped events due to inactive tenants.
- Add structured logs (tenantId/userId/providerId/event) with sampling to trace noisy tenants/providers.
- Make buffer thresholds runtime-configurable with sane defaults and guardrails; add alerts on sustained drops or buffer saturation.
- Frontend: add lightweight telemetry for connect/disconnect/retry, handler errors, and API fallbacks triggered from realtime handlers; surface user-facing banner when in degraded mode.

## Phase 4 - Delivery Semantics & Offline Resilience (Week 4)
- Decide delivery policy per event class (fire-and-forget vs at-least-once). For critical events (sync status, AI actions), add short-lived replay/backfill (e.g., cache last N per tenant) so clients connecting shortly after a burst still receive them.
- Gate high-frequency events (e.g., folder counts) with rate limits per tenant/provider; optionally coalesce with richer diffs instead of last-write-only snapshots.
- Consider optional acknowledgements for critical actions (AI events) to confirm receipt or trigger retries.
- Frontend: add client-side dedupe and throttling for high-frequency events (folder counts, unread) and bound API refetch retries; support small replay cache consumption if backend exposes it.

## Phase 5 - Security & DX (Week 5)
- Add rate limiting/backoff for failed handshakes and consider disabling token-in-query when not needed; document allowed auth channels.
- Add contract/integration tests for event payloads (generate fixtures from `RealtimeEventPayloads`) and snapshot tests for emitted shapes.
- Provide operator runbooks for rotating JWT secrets and for monitoring realtime health (metrics + logs dashboards).
- Frontend: add integration tests mocking socket.io to validate reconnection, room rejoin, and handler behavior on malformed payloads; document client runtime configs (backend URL, reconnection caps, logging/telemetry toggles).
