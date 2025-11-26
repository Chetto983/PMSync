# ADR: Multi-Agent API Contract Freeze (v1)

Status: Accepted  
Date: 2025-11-26  
Context: Single-tenant/single-user deployments with HITL controls enabled.

## Decision
- **Canonical endpoints**
  - `POST /ai/multi-agent/process` (message processing; server-issued `sessionId` returned)
  - `GET /ai/multi-agent/agents`
  - `GET /ai/multi-agent/pending-actions`
  - `GET /ai/multi-agent/pending-actions/:id`
  - `POST /ai/multi-agent/pending-actions/:id/approve`
  - `POST /ai/multi-agent/pending-actions/:id/reject`
  - `GET /ai/multi-agent/stats/action-counts`
  - `GET /ai/multi-agent/stats/learning`
  - `GET /ai/multi-agent/stats/aggregate`
  - `GET /ai/multi-agent/feedback`
  - `GET /ai/multi-agent/feedback/stats`
  - `POST /ai/multi-agent/learning/reset`
- **Session ownership**: controller validates `sessionId` belongs to the caller; otherwise 403. If missing, server creates a session and returns `sessionId`.
- **forceAgent validation**: names are normalized (case-insensitive, optional "Agent" suffix). Unknown agents return 400.
- **Rate limits**: driven by env:
  - `AI_RATE_LIMIT_RPM` for `/process`
  - `RATE_LIMIT_MAX` for HITL/default endpoints
  - `RATE_LIMIT_TTL_MS` for TTL
- **HITL ownership**: pending actions, approve, reject enforce owner or admin/super-admin.
- **Feedback stats**: approval/success rate and agent breakdowns are exposed via `/ai/multi-agent/feedback/stats`; no separate trend endpoint.

## Deferred (future work)
- Legacy docs listing `/ai/multi-agent/session` and `/ai/multi-agent/message` remain out of scope; update or deprecate in next doc revision.
- Per-endpoint telemetry/metrics beyond structured logs.
- Swagger regeneration to reflect the frozen contract and feedback stats response shape.

## Consequences
- Clients must stop sending client-generated session IDs; use the returned `sessionId` from `/process`.
- Forcing a non-existent agent surfaces a 400, preventing silent fallbacks.
- HITL UI must handle 403 when accessing another user's actions (even in single-user tenant, guards stay on).
- Feedback dashboards should rely on `/feedback/stats` (approval/success rates + per-agent breakdown); trends over time can be derived client-side from `/feedback` history if needed.
