# AI Multi-Agent Delivery Pipeline

End-to-end pipeline for executing the roadmap across the multi-agent backend (and impacted frontend/ops). Structured to move fast on P0/P1 items while keeping safety and observability gates.

## Phases & Gates
1) **Intake & Scoping (Day 0-1)**
   - Confirm goals, environments, owners, and feature flags.
   - Gate: scope signed off; env/config audit (queue, Redis, Mistral keys) completed.

2) **WS1: Messaging, Locale, Summaries (Day 1-3)**
   - Implement shared locale map + `ActionExecutionResult` contract (summary/locale required).
   - Add executor summaries (email/calendar/contacts/folder/knowledge) and remove placeholder successes.
   - Orchestrator merges summaries, adds pending/auto/failure messages, and exposes `executedSummaries`.
   - Tests: locale/summary contract, pending vs executed messaging.
   - Gate: 0% executed actions without summary in tests.

3) **WS2: Safety, Idempotency, Capability Checks (Day 3-5)**
   - Add action hash on pending/exec; skip duplicates; fail fast on missing provider/capability; permission hooks per action.
   - HITL marks FAILED with user-facing summary on exec errors; realtime events carry summary/error.
   - Tests: duplicate suppression, missing provider failure, HITL failure propagation.
   - Gate: duplicate rate <0.5% in tests; failures surface to HITL/response.

4) **WS3: Resilience, Queue, Telemetry (Day 5-8)**
   - Wrap Router/Email/Calendar/General/Knowledge LLM calls with `AIQueueService` (timeouts/retries, per-tenant rate limits) and `LlmTelemetryService.trackCall`.
   - Circuit breakers + fallbacks; structured logs with correlation IDs; metrics export (queue depth, job success/fail, p95/p99).
   - Tests: LLM timeout/failure fallback, queue retry success.
   - Gate: queue job success >98% with retries; telemetry logs per call.

5) **WS4: Memory, Cost, Context Control (Day 8-10)**
   - Rolling summarization when token budget exceeded; cron eviction of stale sessions.
   - Cap enriched context sizes; log token estimates; intent cache for short windows; model selection per op with cost caps.
   - Tests: budget enforcement, summarization, intent cache hit path.
   - Gate: token budget respected in tests; cron jobs configured.

6) **WS5: Abuse Controls & Content Safety (Day 10-12)**
   - Per-tenant/user action ceilings (sends/min, deletes/min, folder ops/min); per-action-type ceilings.
   - Sanitize email bodies/attachments (size/type limits, strip remote content); sanitize LLM outputs pre-exec.
   - Tests: rate limit blocks, content sanitization.
   - Gate: abuse limits enforced; sanitized payloads verified.

7) **WS6: Ops Tooling & Admin UX (Day 12-14)**
   - Admin endpoints to purge/replay stuck actions, reset queues, view per-tenant learning/telemetry snapshots.
   - Metrics exporters/dashboards for queue depth, HITL distribution, LLM cost/latency/tokens; alerts for backlog/error spikes.
   - Gate: dashboards live; alert rules enabled.

8) **WS7: Testing & Frontend Contract (ongoing)**
   - Contract/integration/load/chaos tests; UI resilience when summaries missing; versioned `MultiAgentResponse` with `executedSummaries` + metadata; aligned realtime payloads.
   - Gate: green tests; schema version communicated to frontend.

9) **Coordinator/Planner (Optional, post-core)**
   - Introduce Planner/Coordinator for multi-step flows with per-step HITL/idempotency/timeouts; Router routes MULTI to planner.
   - Gate: planner traces and per-step summaries; failure/rollback strategy tested.

## Roles & Ownership (suggested)
- Backend: WS1-6 implementation, schema changes, queue/telemetry integration, cron/ops endpoints.
- Frontend: handle `executedSummaries`, localized pending/failed messages, realtime payloads, UI resilience.
- DevOps/SRE: Redis/queue config, dashboards/alerts, cron scheduling, secrets management.
- QA: contract/integration/load/chaos tests; locale verification.

## Success Metrics (tracked each milestone)
- Messaging coverage: 0% executed actions without summary; >99% localized paths on happy flows.
- Safety: duplicate actions <0.5%; failed execs surface to HITL with summary.
- Reliability: queue job success >98% with retries; circuit fallback success >95%.
- Performance: p95 process <3s (direct); queue backlog alert thresholds defined.
- Cost: LLM cost per 1k requests tracked; intent cache hit rate >30% on common prompts.

## Risks & Mitigations
- LLM variability: strict JSON parsing, circuit breakers, prompt linting, model defaults.
- Provider gaps: preflight capability checks; clear user-facing errors; feature flags per tenant.
- Telemetry volume: sampling/aggregation; retention policies.
- Token/latency bloat: summarization and budget enforcement; step/time caps for planner.
