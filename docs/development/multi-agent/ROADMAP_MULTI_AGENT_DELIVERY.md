# Multi-Agent Delivery Roadmap (Backend + Frontend)

Goal: align implementation with the multi-agent specs, close security gaps, and ship a production-ready UX for HITL and learning. Timeline assumes a 4-week sprint cadence; adjust if capacity changes.

---

## Progress Log
- Security: HITL endpoints now enforce ownership/role checks when fetching, approving, or rejecting pending actions. Added tests to cover the new approval signature (Week 1 P0 item).
- Testing: Added dedicated `hitl.service` security specs to verify owner-only access and admin override paths.
- API guardrails: `forceAgent` now validates/normalizes names and rejects unknown agents; controller now issues/validates chat sessions server-side instead of trusting client-provided IDs.
- RAG: Added KnowledgeAgent with structured `knowledgeHits` in responses; frontend renders RAG cards and handles 400/403/429 errors.

## Week 1 — Foundations & Contract Alignment
- [x] **Security hardening (P0)**: enforce tenant + user ownership on pending actions, approval, and execution; admin override only.
- [x] **Session handling**: controller now issues/validates session IDs server-side; forged IDs are rejected (403).
- [x] **forceAgent guardrails**: normalize names, reject unknown agents (400).
- [x] **API contract freeze**: ADR published (`docs/development/multi-agent/API_CONTRACT_ADR.md`) defining the canonical surface and behaviors.
- [x] **Telemetry & rate limits**: rate limits now bound to env (`AI_RATE_LIMIT_RPM`, `RATE_LIMIT_MAX`, `RATE_LIMIT_TTL_MS`); controller logs session authz failures.

## Week 2 — Backend Feature Completeness
- **Knowledge agent**: implemented and tested (`KnowledgeAgent`, structured hits).
- **Force-agent routing**: normalize `forceAgent` to registered names; 400 on unknown agents.
- **Feedback APIs**: added aggregate feedback stats endpoint; docs now describe history + aggregate stats, to be used for approval/success trend charts (no extra endpoints required).
- **Docs & OpenAPI**: encoding fixed; API reference refreshed with knowledge hits and feedback stats. *(Swagger regeneration pending)*

## Week 3 — Frontend Integration & UX
- **API client fixes**: align `multiAgentApi` response parsing with backend shapes (pending actions, feedback lists, stats).
- **HITL UI**: surface action ownership, severity, and confidence; block approve/reject if not authorized; show error toasts on 403/401.
- **Knowledge results UX**: render RAG snippets when `KnowledgeAgent` responds; add source pills and copy action.
- **Scheduling drawer**: use correct `forceAgent` value (`CalendarAgent`), and display agent/intent metadata in chat.

## Week 4 — Quality, Observability, Ops
- **Testing**: expand unit/integration coverage for HITL authz, KnowledgeAgent flows, and auto-approve policy. Add frontend cypress (or Playwright) happy-path for approve/reject and knowledge response rendering.
- **Monitoring**: add metrics for classification latency, action creation/approval/execution, and rejection reasons; emit structured logs for audit trails.
- **Migrations & data cleanup**: add RLS/migration updates for new models (if KnowledgeAgent adds tables) and run cleanup scripts for orphaned sessions/pending actions.
- **Release checklist**: finalize changelog, run load test on multi-agent endpoints with rate limits enabled, and cut a tagged release.

## Dependencies & Risks
- **Blocking**: MISTRAL_API_KEY and embedding/vector DB availability; Redis/pgvector performance for RAG.
- **Risks**: authz regressions on HITL endpoints; API contract drift if docs are not frozen; latency spikes from added KnowledgeAgent if not cached.

## Success Criteria
- All documented endpoints present in Swagger, passing contract tests.
- HITL approvals restricted to authorized roles/users; unauthorized attempts logged and denied.
- KnowledgeAgent responses visible in UI with sources; no “No agent found” for `KNOWLEDGE` intents.
- Frontend pending-actions/history panels show real data (parsed responses) with working approve/reject.
