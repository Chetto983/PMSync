# AI Rework Roadmap (MailAgent) – 2025-ready

This roadmap consolidates the audit of current AI features, compares them with the Zero-main reference (`esempio/Zero-main`), and defines a phased plan for backend, frontend, localization, safety, and observability. It assumes Mistral is the primary LLM, with optional second providers for resiliency.

## Scope and Goals
- Deliver AI compose and chat-in-compose experiences with style adaptation.
- Harden multi-agent orchestration with guardrails, schema validation, and observability.
- Introduce prompt operations (registry, versioning, locale variants) and model routing.
- Add evaluation loops (offline golden sets + online feedback) and safety controls.
- Keep all features tenant-scoped and localization-ready.

## Current Snapshot (MailAgent)
- Backend: multi-agent orchestrator (router + specialized agents) with HITL, memory FIFO, single-provider Mistral, no prompt registry, limited guardrails, limited telemetry.
- Frontend: Compose dialog with smart replies only; no AI compose/chat pane; translations exist but no new AI strings.
- Docs: `docs/AI_COMPOSE_IMPLEMENTATION.md` already notes missing compose AI.

## Reference Contrast (Zero-main)
- Prompt storage with fallback seeding per connection (`brain.ts` + prompts).
- Style-adaptation system prompt and 52+ writing-style metrics.
- Compose-focused tool invocation with context-aware prompts.
- MailAgent should mirror: prompt registry, style learning, compose endpoints, and UI affordances.

## Target Architecture Principles
- PromptOps: registry with versioning, locale variants, feature flags, and A/B buckets.
- Guardrails: JSON schema enforcement for LLM outputs, PII/safety filters, RBAC on tools, severity-based HITL.
- Model layer: pluggable LLM client abstraction with health, cost/latency-aware routing, and streaming.
- Observability: OpenTelemetry spans, token/cost/latency metrics, redacted structured logs, dashboards/alerts.
- Evaluation: golden tests in CI + periodic eval jobs fed by HITL/feedback data.
- Data boundaries: tenant isolation for memories, prompts, and embeddings; encryption at rest.

## Roadmap – Backend
**Phase 0 – Hygiene and PromptOps**
- Add prompt registry (Prisma models + CRUD + cache) with fields: `name`, `version`, `locale`, `bucket`, `body`, `metadata`, `createdBy`, `updatedAt`.
- Migrate hard-coded prompts from router/agents and Mistral calls to registry; add fallback seeding job.
- Wrap all LLM calls with OpenTelemetry spans and structured logs (latency, tokens, model, prompt id); redact PII before logging.
- Expose registry admin endpoints (protected by role) and read endpoints for services.

**Phase 1 – Safety and Schema Enforcement**
- Introduce response schema validation for tool calls and agent outputs; repair-or-reject strategy.
- Add safety filters: profanity/toxicity check and PII masking before persistence/memory; enforce RBAC on high-impact actions (send/delete).
- Strengthen HITL: severity tiers, SLAs/alerts on pending queue, richer feedback payloads, and audit logging.
- Add provider health probes and graceful degradation paths.

**Phase 2 – Memory, RAG, and Personalization**
- Unify memory service with vector store and metadata filters (tenant, provider, time, folder); cache and dedup embeddings.
- Expand personalization service: compute/store writing-style metrics from sent emails; expose in agent context.
- Retrieval augmentation for intent-specific agents (email/thread/KB) with relevance scoring and guardrails on citations.

**Phase 3 – Agent Architecture Uplift**
- Convert agents to strict tool/function-calling schemas; separate planner (router) and executor with confidence calibration.
- Add cost/latency-aware model routing (primary/secondary models) and backpressure on `ai.worker`; introduce retries + circuit breakers.
- Auto-eval: golden datasets for intents, summaries, smart replies, and action payload validation in CI + nightly jobs.

**Phase 4 – New AI Endpoints**
- `/ai/compose`: context-aware drafting (prompt, recipients, thread/email context, tone, locale, style profile), streaming response.
- `/ai/rewrite`: rewrite body with tone/style constraints and diff output.
- `/ai/search-query-builder`: convert natural language to structured search filters.
- `/ai/style-profile`: fetch style metrics and last-updated metadata.
- Ensure all accept `locale` and map to prompt variants.

## Roadmap – Frontend
**Phase 1 – Compose Assist Button**
- Add AI compose button in `ComposeDialog` toolbar to call `/ai/compose`; insert/replace body with confirmation; pass locale.
- Tone selector + “use my style” toggle wired to style profile.

**Phase 2 – AI Side Panel**
- New `AiComposePanel` with example prompts (from registry), chat-with-tools, streaming replies, and one-click insert into editor.
- Persist panel open state per user; keyboard shortcut; thread-aware context for replies/forwards.

**Phase 3 – Localization and UX Polish**
- Add i18n keys for all new AI UI strings; ensure RTL-safe layout and aria labels.
- Loading/stream states, error toasts, and retry actions; telemetry hooks for latency/errors/insert events.

**Phase 4 – Smart Replies and Search Upgrades**
- Smart reply tone dropdowns, inline diff preview, and “why this reply” explanations.
- AI query builder UI for search filters (chips) using `/ai/search-query-builder`.

**Phase 5 – User Controls**
- Settings surface for AI features: enable/disable compose/smart replies, tone defaults, auto-approve thresholds, data usage disclosure.
- Show transparency/help modals for AI assistance.

## Localization Strategy
- Prompt registry stores locale-specific bodies; fallback chain `requested → user pref → en`.
- All new endpoints accept `locale` and pass through to prompt selection and formatting.
- Frontend strings added to i18n catalogs; no hard-coded text in new components.

## Observability and Quality Gates
- Metrics: latency, tokens, cost, error rate, HITL queue backlog, approval rate, action success rate.
- Alerts: model/provider health, HITL SLA breaches, cost spikes, schema validation failures.
- Testing: contract tests for schemas, golden sets for intents/summaries/replies, UI e2e for compose insert/undo, and load tests for streaming.

## Sequencing and Milestones (suggested)
1. Week 1–2: Phase 0 backend + telemetry; basic `/ai/compose` backend skeleton.
2. Week 3–4: Phase 1 safety + schema; frontend compose button; prompt registry migration of router/agents.
3. Week 5–6: Phase 2 memory/personalization; style metrics ingestion; side panel beta with streaming.
4. Week 7–8: Phase 3 agent uplift + model routing + auto-eval; search-query builder endpoint.
5. Week 9+: Phase 4/5 polish, settings, and expanded eval; dashboarding and alerting.

## Dependencies and Notes
- Requires second LLM provider credentials for redundancy (optional but recommended).
- Ensure Prisma migrations for prompt registry, style profiles, and feedback expansions.
- Keep tenant isolation in memory, prompts, embeddings, and logs.
- Align with existing HITL flows to avoid regressions; avoid breaking current smart replies.
