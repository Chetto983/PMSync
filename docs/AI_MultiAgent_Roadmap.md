# AI Multi-Agent Roadmap (Backend)

Scope: `backend/src/modules/ai` (multi-agent orchestrator, agents, executors, HITL, memory, telemetry) with frontend contract impacts kept in mind.

## Current Snapshot
- Agents: Router + Email/Calendar/Contacts/Knowledge/General registered in `multi-agent.module.ts`; action execution via `ActionExecutorService`.
- Safety: HITL gating with severity checks; auto-approve based on confidence; pending actions/events emitted via `RealtimeEventsService`.
- Infra: BullMQ queue available (`AIQueueService`) but not wired into LLM calls; LLM telemetry service exists but unused in agents.
- Memory/Personalization: FIFO chat memory persisted via `MemoryService`; personalization context fetched optionally.
- Gaps seen: inconsistent locale handling and corrupted strings, executors often return no summaries, optional dependencies return placeholder "success", no timeouts/telemetry on LLM calls, AI queue unused, minimal token-budget control/summarization.

## Key Risks / Pain Points
- User messaging is fragile: many executor paths return `success` with no `summary`, so `MultiAgentService` falls back to generic/no-response; error summaries rarely reach the user.
- Locale inconsistencies: ad-hoc language resolution and malformed strings (e.g., GET_UNREAD/KnowledgeAgent) risk broken UX; no shared string map.
- Safety gaps: optional injections in `ActionExecutorService` report success when the underlying service is absent; provider selection is "first active" without user scoping; no idempotency for action execution.
- Resilience/scale: router/agents call Mistral directly without queueing, timeouts, or telemetry; AI queue exists but unused; no circuit breakers or retry policy at LLM boundaries.
- Memory costs: FIFO only, no summarization when over token budget, and no cache eviction scheduled; execution flow blocks on sequential memory/learning calls.
- Observability: LLM telemetry not hooked; logs are unstructured and lack correlation IDs; no metrics surfaced for queue/HITL/action success rate.
- Testing/QA: Good unit/integration coverage exists, but no contract tests for executor summaries/locales; load and rate-limit behaviors untested.

## Roadmap (Prioritized)
### P0 Hardening (safety + correctness)
- Enforce real failures when dependencies are missing (email/calendar/contacts/folder services); remove "placeholder success" branches and return actionable errors to HITL/UI.
- Standardize `ActionExecutionResult` (`success`, `summary`, `data`, `error`, `executionTimeMs`, `locale`) and require every executor branch to populate `summary`/`error`.
- Fix locale map and corrupted strings; centralize all user-facing strings (pending/executed/empty/error/action summaries) and use `context.preferences.language` with sane fallback to `en`.
- Add idempotency keys on pending actions/executions (tenantId + sessionId + action hash) to avoid duplicate sends on retries/refreshes; ensure failed executions mark HITL status to FAILED with a user-facing error.

### P1 Resilience & Observability
- Route all LLM calls (router + Email/Calendar/General/Knowledge agents) through `AIQueueService` with timeouts, retries, and per-tenant rate limits; add circuit breaker for upstream failures.
- Wrap LLM calls with `LlmTelemetryService.trackCall` to capture latency, tokens, errors, and agent/operation labels; emit structured logs with correlation IDs (tenant/user/session/agent/actionId).
- Parallelize non-dependent IO in `MultiAgentService.process` (memory fetch, personalization, intent classification) and add execution timeout budgets per step; push execution metadata into response `metadata` for UI breadcrumbs.

### P1 User Output & Explainability
- Guarantee messages: merge executor summaries into `MultiAgentResponse.messages`; add localized fallbacks for pending/auto-executed/failure paths; show agentUsed + short reasoning snippet.
- Add summaries for all executors (email send/reply/forward/search/mark/star/folder ops, calendar CRUD, contacts CRUD/merge, knowledge hits) with locale-aware templates and empty-state handling.
- Emit realtime events that include summaries/errors so the Pending Actions panel can show actionable context without fetching execution logs.

### P2 Memory, Personalization, and Context
- Implement summarization when token budget is exceeded (e.g., rolling summary every N messages) and schedule cache eviction via cron; expose token estimates in logs/telemetry.
- Use personalization context to bias prompts (tone, language, working hours) and to adjust auto-approve thresholds per user profile/role.
- Allow agents to request lightweight RAG snippets (recent emails/contacts/events) via a shared enrichment utility before LLM calls, with caps on items/tokens.

### P2 Platform & Cost Control
- Add configurable model selection per operation (fast for routing, higher quality for generation) with cost caps; cache intent classifications for short windows to reduce duplicate LLM hits.
- Validate provider resolution per user (prefer user-linked provider, then tenant default); surface clear errors when capabilities are missing.
- Add backpressure/exported metrics for AI queue and HITL counts; alert on queue backlog, failure rate, and high latency.

### P3 Testing & SRE
- Contract tests: executor summaries per locale/action; HITL approve/reject paths return deterministic user messages; action idempotency under retries.
- Integration tests: multi-agent process happy paths + failures (missing provider, downstream errors) + locale variations; queue-enabled vs direct mode.
- Load/rate-limit tests for controller throttling and AI queue throughput; chaos tests for LLM timeouts to validate circuit breaker/fallback.
- Add dashboards for LLM telemetry (cost, tokens, latency), queue depth, HITL status distribution; schedule cleanup jobs (expired actions, stale sessions, old telemetry).

## Additional Hardening Areas (to fold into roadmap)
- Security: strict tenant/user scoping on provider resolution and action execution; permission checks per action type; sanitize LLM outputs before execution; redact PII in telemetry/logs.
- Rate limiting/abuse: per-tenant/user action caps (e.g., sends per minute), not just API throttle; per-action-type ceilings.
- Recovery: dead-letter handling for queue/HITL execution failures; retry with backoff on transient provider errors; compensating actions for partial failures (e.g., contact merge rollbacks).
- Content safety: validate/sanitize email bodies and attachments; enforce size/type limits; strip remote content in generated emails.
- Capability detection: preflight provider capability checks before proposing/executing actions; graceful degradation when features are off for a user.
- Prompt governance: central prompt templates with versioning/linting; guardrails to avoid tool overreach; consistent model selection per prompt.
- Performance: cache common intent classifications; fast-path trivial queries; batch DB lookups in executors; collect p95/p99 latencies.
- Operational tooling: admin endpoints to purge/replay stuck actions, reset queues, and view per-tenant learning/telemetry dashboards.
- Frontend contract: versioned `MultiAgentResponse` schema (include `executedSummaries` and metadata); consistent realtime event payloads for Pending Actions panel; graceful UI when summaries are missing.

## Execution-Ready Checklist
- Response contract & locale
  - Define a shared `ActionExecutionResult` with required `summary` and `locale`.
  - Centralize localized strings (en/it/es/fr/de/pt) for pending/executed/failure/empty and per-action summaries (send/reply/forward/search/mark/star/folder, calendar CRUD, contacts CRUD/merge, knowledge hits).
  - Resolve language only from `context.preferences.language` (fallback `en`); merge `executedSummaries` into `messages` and always include pending/auto-executed/failure text.
- Executors
  - Remove placeholder “success” when services are missing; return clear errors and mark HITL FAILED on execution failure.
  - Add summaries for every branch:
    - Email: send/reply/forward (to/subject), delete/archive/mark/star, search/unread (top N senders/subjects), categorize/label, folder create/rename/delete.
    - Calendar: create/update/delete/reschedule/check availability (slots found/no slots).
    - Contacts: create/update/delete/merge/get/search with counts/IDs.
  - Validate provider resolution per user (then tenant fallback); error if none; log providerId used.
- HITL & idempotency
  - Compute action hash (tenantId + sessionId + type + payload) on pending actions; skip duplicates on create/execute.
  - On execution failure, mark HITL as FAILED with user-facing summary; emit realtime event including summary/error.
- Resilience & telemetry
  - Wrap Router/Email/Calendar/General/Knowledge LLM calls with `AIQueueService` (timeouts/retries, per-tenant rate) and `LlmTelemetryService.trackCall` tagged with tenant/user/session/agent/operation.
  - Add circuit breaker/fallback for LLM failures; structured logs with correlation IDs, intent, proposed/executed actions, locale.
- Memory & cost
  - Rolling summarization when token budget exceeded; cron eviction of stale sessions; log token estimates/history length.
- Safety & content
  - Sanitize email bodies/attachments; size/type limits; strip remote content; permission checks per action; capability preflight; sanitize LLM outputs; redact PII in telemetry.
- Rate limiting & abuse
  - Per-tenant/user action caps (e.g., sends/min, deletes/min) in addition to API throttle; per-action-type ceilings.
- Prompt governance
  - Central prompt templates with IDs/versioning; lint for structured JSON; consistent model selection per prompt type.
- Performance
  - Cache recent intent classifications; fast-path trivial greetings; batch DB lookups in executors; collect p95/p99 latencies.
- Ops tooling
  - Admin endpoints to purge/replay stuck actions, reset queues, view per-tenant learning/telemetry dashboards; export queue depth, HITL distribution, LLM cost/latency/token metrics.
- Frontend contract
  - Version `MultiAgentResponse` (include `executedSummaries` and metadata); align realtime event payloads for Pending Actions; ensure UI is resilient when summaries are missing.

## Suggested Implementation Order (Fastest Impact First)
1) Messaging & locale: shared strings + summary contract + `MultiAgentService` message assembly; executor summaries + remove placeholders. (Unblocks UI clarity.)
2) Safety/idempotency: action hash on pending/exec, failure surfacing to HITL, capability/provider checks, permission hooks.
3) Resilience/telemetry: AI queue + timeouts/retries + circuit breaker + `LlmTelemetryService.trackCall`; structured logs with correlation IDs.
4) Memory/cost: token-budget summarization + cron eviction; provider/model selection per op with cost caps.
5) Abuse/rate limits: per-tenant/user action ceilings; content/attachment sanitization.
6) Ops/tooling: admin endpoints for stuck actions/queue reset; metrics export + dashboards.
7) Tests: contract + integration + load/chaos for queue/LLM timeouts; UI resilience for missing summaries.

## Success Criteria & Metrics
- User messaging: 0% executed actions without a summary; localized strings rendered for >99% non-error paths.
- Safety: duplicate action rate <0.5% post-idempotency; blocked executions when dependencies/capabilities missing.
- Reliability: LLM timeout/circuit fallback success ratio >95%; queue job success rate >98% with retries.
- Performance: p95 end-to-end process <3s in direct mode; queue backlog alerting at configurable thresholds.
- Cost: LLM cost per 1k requests tracked; intent cache hit rate >30% on common prompts.
- HITL: pending-to-approved lead time tracked; FAILED vs EXECUTED ratio visible; no orphaned pending actions.

## Dependencies & Coordination
- Backend: Prisma schemas for idempotency fields and telemetry if needed; env vars for queue/timeouts/rate limits; cron scheduling for memory eviction.
- Frontend: expects `executedSummaries`, localized pending/failed messages, consistent realtime payloads; UI resilient when summaries missing.
- Ops: dashboards (queue depth, HITL distribution, LLM cost/latency), alerts for queue backlog and LLM error rates.

## Open Risks / Mitigations
- LLM variability: enforce strict JSON parsing and circuit breakers; add prompt linting and model selection defaults.
- Provider gaps: clear errors and preflight checks; feature flags to disable unsupported actions per tenant.
- Telemetry volume: sampling/aggregation on LLM logs; retention policy for usage/telemetry tables.
- Token bloat: aggressive summarization and token budget enforcement; cap enriched context sizes.

## Backlog Candidates (post-core)
- Multi-agent coordination: lightweight planner to sequence multiple agent actions with shared context.
- Learning improvements: decay/smoothing adjustments configurable; per-action-type thresholds driven by feedback.
- UI/UX: tooltips showing agentUsed/reasoning; richer Pending Actions detail from realtime events.

## Detailed Roadmap (Workstreams → Tasks)
### WS1: Messaging, Locale, and Summaries (P0)
- Define shared locale map and summary templates (email, calendar, contacts, knowledge, pending/approved/failed, empty-state).
- Enforce `ActionExecutionResult` contract (`summary`, `locale` required); remove placeholder successes.
- Update executors with per-branch summaries; add empty-state summaries for search/unread.
- Assemble responses in `MultiAgentService`: merge summaries, add pending/auto-exec/failure text, propagate `executedSummaries`.
- Deliverables: PR with string map + contract + executor summaries + orchestrator assembly; tests for locale/summaries.

### WS2: Safety, Idempotency, and Capability Checks (P0)
- Add action hash (tenantId + sessionId + type + payload) to pending actions; skip duplicate creates/exec.
- Fail fast when dependencies/providers/capabilities missing; mark HITL FAILED with user-facing error.
- Permission hooks per action type; provider resolution per user then tenant default.
- Deliverables: PR with schema changes (idempotency fields), capability preflight, HITL failure surfacing, tests for duplicates and missing providers.

### WS3: Resilience, Queue, and Telemetry (P1)
- Wrap Router/Email/Calendar/General/Knowledge LLM calls with `AIQueueService` (timeouts/retries, per-tenant rate limits).
- Add circuit breaker/fallback responses; structured logs with correlation IDs; integrate `LlmTelemetryService.trackCall`.
- Export metrics (queue depth, job success/fail, p95/p99 processing) and alerts for backlog/error spikes.
- Deliverables: PR with queue integration and telemetry; dashboard/alert configs; tests for timeout/failure fallbacks.

### WS4: Memory, Cost, and Context Control (P2)
- Implement rolling summarization when token budget is exceeded; cron for cache eviction of stale sessions.
- Token estimates/history length in logs; cap enriched context (emails/contacts/events) before prompts.
- Model selection per operation with cost caps; cache intent classifications for short windows.
- Deliverables: PR with summarization + cron + token logging; intent cache; tests for budget enforcement.

### WS5: Abuse Controls, Content Safety, and Rate Limits (P2)
- Per-tenant/user action ceilings (sends/min, deletes/min, folder ops/min); per-action-type ceilings.
- Sanitize email bodies/attachments; strip remote content; enforce size/type limits; sanitize LLM outputs pre-exec.
- Deliverables: PR with rate limiters + sanitization utilities; tests for rate and content blocks.

### WS6: Ops Tooling and Admin UX (P2/P3)
- Admin endpoints to purge/replay stuck actions; queue reset; view per-tenant learning/telemetry snapshots.
- Metrics export (queue depth, HITL distribution, LLM cost/latency/tokens) for dashboards.
- Deliverables: PR with admin endpoints + metrics exporters; dashboard definitions.

### WS7: Testing & Frontend Contract (ongoing)
- Contract tests for locale-aware summaries and HITL paths; integration tests for pending vs auto-approve, missing providers, retries.
- Load/chaos tests for queue/LLM timeouts; UI resilience tests for missing summaries and event payloads.
- Maintain versioned `MultiAgentResponse` schema with `executedSummaries` and metadata; align realtime payloads for Pending Actions UI.

### Milestones
1) P0 hardening shipped with localization fix and summary contract (unblocks reliable UX).  
2) Queue + telemetry + structured logging enabled; executor summaries wired to UI events.  
3) Memory/personalization improvements + provider validation; cost controls per operation.  
4) Test/observability expansion and load/perf coverage.

## Current Orchestration Model (and Chaining Considerations)
- Trigger: `MultiAgentController.processMessage` → `MultiAgentService.process`.
- Flow: RouterAgent classifies intent → selects one agent → that agent produces actions → learning adjustments → HITL/execute.
- Agents do not call each other; they are single-invocation per request, registered at module init.
- Benefits of single-agent: simpler HITL/safety, lower latency/cost, easier debugging.
- When chaining helps: cross-domain asks (email + calendar), multi-step flows (fetch unread → pick one → draft), planner/rollback needs.
- Risks of chaining: higher latency/cost, mid-chain failures, harder HITL/rollback, state drift without idempotency.
- If adding chaining: introduce a Planner/Coordinator to sequence agents, enforce per-step HITL and idempotent actions, apply timeouts/circuit breakers, and emit structured traces/summaries.

## Tool Registry & Validation (proposed improvement)
- Today: tools are implicit (enum + executor switch). Agents hardcode action types; no shared schema or payload validation.
- Plan:
  - Add a tool registry (e.g., `tool-registry.ts`) mapping each `AgentActionType` to description, severity, required/optional fields with validators, capability/role requirements, and handler reference.
  - Generate LLM tool specs from the registry so agents only propose valid actions/fields.
  - Replace executor switch with map-based dispatch using the registry; validate payloads before execution and fail fast with user-facing errors + HITL FAILED status.
  - Enforce capability/permission checks (provider supports email/calendar/contacts; user role) from the registry before execution.
  - Log tool usage with validation results/provider/outcome; keep idempotency per action hash.

### MCP-style tools (reference: Zero)
- In `Zero-main/apps/server/src/routes/agent/mcp.ts`, tools are registered explicitly via `McpServer.registerTool(name, { description, inputSchema }, handler)`.
- Each tool declares a zod schema for inputs, a description for LLMs, and a handler that enforces active connection/capabilities.
- No enum/switch; the registry itself is the contract for agents/LLMs and execution.
- If we align: mirror this pattern by exposing our tool registry as MCP tools (optional), with zod schemas, descriptions, and capability/role checks, and use the same registry for internal executor dispatch.
- Registry spec (proposed):
  - `{ actionType, description, severity, inputSchema (zod), requiredCapabilities (email/calendar/contacts), requiredRoles, handlerRef }`
  - LLM tool spec generation from the registry to constrain agent output.
  - Executor dispatch reads the registry map; validates payloads; enforces capability/role; logs usage.
- Migration plan from enum/switch to registry:
  1) Add registry + zod schemas for all actions.
  2) Generate tool spec for agents/LLM.
  3) Refactor executor to map-based dispatch + validation.
  4) Add capability/permission gating.
  5) (Optional) Expose MCP server that wraps the same registry.
  6) Tests for validation failures, capability errors, correct dispatch, and LLM tool spec conformance.
- Example registry entry (SEND_EMAIL, illustrative):
  - `actionType`: SEND_EMAIL
  - `description`: Send a new email (requires at least one `to` recipient)
  - `severity`: HIGH
  - `inputSchema` (zod): `{ to: z.array(z.string().email()), cc?: z.array(z.string().email()), bcc?: z.array(z.string().email()), subject: z.string(), bodyHtml?: z.string(), bodyText?: z.string() }`
  - `requiredCapabilities`: supportsEmail=true provider
  - `requiredRoles`: user or above
  - `handlerRef`: `executeSendEmail`
  - `llmSpec`: generated JSON snippet with required/optional fields and constraints; instruct single-line JSON, no markdown.
- Senior dev approach (2025 baseline):
  - Explicit tool registry with schemas/roles/capabilities; LLM tool specs generated from code; no enum/switch drift.
  - Prompts hardened: strict single-line JSON, refusal rules, capability/permission/severity injected, brief examples, locale enforced.
  - LLM calls wrapped with queue/timeouts/retries/circuit breakers/telemetry; structured logs with correlation IDs.
  - Safety/idempotency: action hash, validation before exec, HITL for high severity, capability gating, sanitization.
  - UX: guaranteed localized summaries; pending/auto/failure messages; realtime events carry summaries/errors.
  - Observability/ops: metrics (p95/p99, cost), dashboards, alerts, admin tooling for stuck actions.
  - Tests: contract (tools/prompts), integration (pending/auto/failure/rate-limit), chaos for timeouts.

## Prompt Hardening (current state → better)
- Current prompts (router/email/calendar/contacts): hardcode action lists/fields; JSON parsing is brittle (strip fences then `JSON.parse`); no strict output constraints; no injected capability/permission/severity rules; limited locale enforcement.
- Improvements:
  - Generate tool specs from the registry and inject into prompts so actions/fields stay in sync.
  - Require single-line strict JSON output: “Respond with exactly one JSON object, no markdown, no fences, no extra keys; escape inner quotes.”
  - Inject capability/permission/severity rules and “refuse/ask for info” guidance when required fields or providers/roles are missing.
  - Add concise examples (valid/invalid) and keep token use small; discourage verbosity.
  - Locale: enforce the target language via instruction + in-language example; fallback in code to localized error strings if parsing/language mismatches.

## Coordinator/Planner Proposal (optional extension)
- Role: A CoordinatorAgent (planner) that decomposes a user goal into ordered sub-steps, each mapped to an existing agent (Email/Calendar/Contacts/Knowledge/General), with per-step HITL and idempotency.
- Flow:
  1) Router detects MULTI or planner-eligible intents.
  2) Coordinator plans steps → for each step, calls target agent to propose actions → applies learning → HITL/execute → aggregates summaries/errors.
  3) Emits a trace (step list, status, errors) and combined user-facing summary.
- Guardrails:
  - Per-step HITL for high-severity actions; idempotency keys per step to avoid double execution.
  - Timeouts/circuit breakers per step; abort plan on critical failure with rollback/compensating action where possible.
  - Token/latency budgets: cap steps, limit prompt sizes, short-circuit on simple asks.
- Deliverables:
  - Planner agent with schema for plan/steps and trace output.
  - Router update to route MULTI/multi-domain requests to planner.
  - Changes to `MultiAgentService` to support step traces and aggregated summaries/errors.
  - Tests: multi-step flow (email+calendar), failure mid-plan, HITL checkpoints, idempotency under retries.
