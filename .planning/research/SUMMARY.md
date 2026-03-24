# Project Research Summary

**Project:** PMSync v9.0 — AI Intelligence & Platform Hardening
**Domain:** Multi-tenant AI email client — push dispatch, tiered rate limiting, HITL approval, Graph RAG
**Researched:** 2026-03-24
**Confidence:** HIGH

## Executive Summary

PMSync v9.0 is a brownfield hardening release, not a greenfield build. The research confirms that every capability needed for this version is already present in installed dependencies — no new packages are required. The four feature areas (push notification backend dispatch, tiered rate limiting, explicit HITL approval routing, Graph RAG steps 4-8) each extend existing infrastructure rather than introduce new systems. The recommended approach is strictly additive: configure what is already installed, fix what is already partially wired, complete what was started, and avoid the temptation to import external services where the current stack already covers the requirement.

The single most urgent item is push notification backend dispatch. The v8.0 settings UI has a push notification toggle that has always been a lie — `web-push` is installed but never called. Users who opted in have been silently receiving nothing. This is a broken promise, not a missing feature, and it carries trust damage if left unaddressed. Tiered rate limiting is the second urgent fix: the flat 30/min write limit was documented in v7.0 as causing user-reported 429s during normal workflows and was explicitly deferred for v9.0 resolution. These two items are table stakes. HITL approval UX and Graph RAG steps 4-8 complete existing plumbing rather than fix active regressions.

The primary risks are operational rather than architectural. Stale push subscriptions and event-loop blocking are the top two push pitfalls, both preventable by routing dispatch through BullMQ. HITL approval re-submit can lose conversation state under multi-tab usage. Graph expansion has a latent JSONB N+1 query problem that degrades past 10K contacts. None of these require architectural pivots — they require disciplined implementation: 410 cleanup on push, BullMQ queuing, server-side approval correlation, and either a GIN index or junction table for contact email lookups.

---

## Key Findings

### Recommended Stack

No new dependencies. Every tool needed is already in `backend/package.json`. The decision is validated against the full feature set:

**Core technologies in use for v9.0:**
- `web-push` ^3.6.7 — push notification dispatch — already installed, zero imports at runtime; just needs `PushDispatchService` wrapping `sendNotification()`
- `@nestjs/throttler` ^6.5.0 — tiered rate limiting — named throttlers already working with Redis storage; v9.0 adds `write`, `send`, and `delete` tiers
- `ai` (AI SDK) ^6.0.49 — HITL approval — `needsApproval` property on `tool()` definitions is SDK-native; dynamic per-user wrapping in `createToolSet()` is the only gap
- `bullmq` ^5.67.1 — async push dispatch, entity graph nightly build — already global, needs new job types
- `prisma` ^7.3.0 — `PushPreference`, `UserAiPreference`, `EntityNode`, `EntityEdge` models — schema additions only
- `tokenlens` ^1.3.1 — token budgeting in `ContextAssemblyService` — already installed
- `EventEmitter2` (via `@nestjs/event-emitter`) — domain event bus for push triggers — already global; new `@OnEvent` listeners only

Alternatives considered and rejected: Firebase/OneSignal (Google lock-in, SaaS dependency), Neo4j (overkill for adjacency-list graph at email scale), LangChain (Python ecosystem), mem0 (multi-tenant incompatible), Cohere Rerank (external latency + cost), express-rate-limit (conflicts with existing throttler).

### Expected Features

**Must have (table stakes):**
- Push notification backend dispatch — toggle exists in v8.0, nothing fires; trust-destroying broken promise
- Event-driven dispatch service (`PushDispatchListener` + `PushDispatchService`) — wires `email:new` event to web-push
- Per-user notification preferences scoped to `(tenantId, userId)` — minimum on/off per category
- Stale subscription cleanup on 410/404 from web-push — prevents silent accumulation of dead endpoints
- Per-category write-rate limits — `read` (300/min), `write` (60/min), `send` (10/min), `delete` (20/min)
- HITL approval/rejection buttons for `part.state === 'approval-requested'` — backend pauses, frontend shows nothing currently
- Visual distinction between informational tool calls and destructive approval prompts — prevents approval fatigue

**Should have (competitive differentiators):**
- Graph RAG Step 6: Memory-entity anchoring — link AIMemory records to EntityNode for contextual recall
- Graph RAG Step 4: Context assembly — structured summarization of graph expansion results, 40-60% token reduction
- Graph RAG Step 8: Few-shot tool chain examples — dynamic injection by query complexity tier, ~250 extra tokens per query
- Three-level HITL preference (`HIGH_ONLY` / `ALL_MUTATIONS` / `NONE`) — per-user configurable in AI Safety settings
- Rate limit response headers (`X-RateLimit-Remaining` / `X-RateLimit-Reset`) — proactive client warnings before hitting 429
- Approval audit logging via existing `AuditService.logAudit()` — GDPR accountability trail

**Defer to v9.x+:**
- Graph RAG Step 5: Materialized entity graph — current ~200ms JSONB graph expansion is acceptable; optimize when query volume justifies it
- Graph RAG Step 7: Tool consolidation (`semantic_search` + `graph_context_search` merge) — requires alias period; ship after Steps 4/6/8 stabilize
- AI triage batch notifications ("3 urgent emails need attention") — additional AI pipeline; ship basic per-email push first
- Approval with parameter modification (edit args before approving) — complex custom UI; simple approve/reject covers the requirement
- Progressive rate limiting with escalating cooldowns — standard 429 + Retry-After covers requirements

**Explicit anti-features (do not build):**
- Push for every single email — notification fatigue destroys the feature; default to important/urgent or batch
- Per-endpoint rate limit config UI — hardcoded tiers are correct; env var overrides at most
- Drag-and-drop HITL workflow builder — enterprise ABAC territory, out of scope
- Cross-model reranker API (Cohere/BGE) — heuristic reranking already sufficient at current data volumes
- Neo4j or any graph database — PostgreSQL adjacency list is sufficient at email scale
- Universal mega-search tool (all domains merged) — confuses model with too many optional parameters

### Architecture Approach

All four features follow the same integration philosophy: extend existing services and event infrastructure, never duplicate trigger logic, keep state in the right layer. Push dispatch hangs off `EventEmitter2` domain events via a new `PushDispatchListener` — the same events already driving WebSocket broadcast — then delegates to `PushDispatchService` which calls `web-push.sendNotification()` asynchronously via BullMQ. Rate limiting is purely a configuration change to `ThrottlerModule.forRoot()` plus `@Throttle()` decorator updates across ~18 controller files. HITL approval routing modifies only `AiChatService.createToolSet()` to dynamically set `needsApproval` based on a new `UserAiPreference` model, with no changes to the underlying AI SDK streaming protocol. Graph RAG builds a chain of services: `ContextAssemblyService` (Step 4) -> `EntityGraphService` + nightly BullMQ build job (Step 5, deferred) -> `MemoryService` entity-aware retrieval (Step 6) -> `FewShotService` dynamic injection (Step 8).

**Major components (new or modified):**
1. `PushDispatchService` / `PushDispatchListener` / `PushPreferenceService` — complete the push pipeline left unfinished in v8.0
2. `ThrottlerModule` tier config + controller `@Throttle()` decorators — split flat write tier into `write` (60/min), `send` (10/min), `delete` (20/min)
3. `AiPreferenceService` + `AiChatService.createToolSet()` modification + split approval UI renderer — dynamic HITL gate with structured diff display
4. `ContextAssemblyService` + `FewShotService` — token-efficient RAG context packaging with query-type-aware few-shot examples
5. Prisma schema additions: `PushPreference`, `UserAiPreference`, `EntityNode`, `EntityEdge` (Step 5, deferred), AIMemory `entityNodeId` FK

### Critical Pitfalls

1. **Stale push subscriptions silently dropping notifications** — check every `sendNotification()` response for HTTP 410/404; immediately delete the subscription row; track `failureCount`/`lastSuccessAt`; add weekly cleanup job. This is the #1 backend push failure mode in production post-mortems.

2. **Push dispatch blocking the event loop** — never await delivery inline in an event handler; route all sends through a `push-dispatch` BullMQ queue with concurrency 5-10; set 5s timeout on each `sendNotification()` call.

3. **Throttler tier name collision breaking existing rate limits** — `@Throttle()` applies ALL named throttlers simultaneously unless explicitly skipped; audit all 17+ existing decorators before changing `ThrottlerModule.forRoot()` config; use `@SkipThrottle({ read: true })` on write-only endpoints rather than trying to override.

4. **HITL approval re-submit losing conversation state** — client-side approval re-submit trusts `clientMessages` and bypasses server-side history loading; under multi-tab usage or background enrichment, re-submitted messages diverge; add server-side `pendingApprovalId` correlation and idempotency check on `toolCallId`.

5. **Graph expansion JSONB N+1 from contact email lookup** — `unified_contacts.emails` is a JSONB array with no GIN index; `EXISTS (SELECT 1 FROM jsonb_array_elements(...))` JOIN pattern causes sequential scans past 10K contacts; add GIN index or extract to `contact_emails` junction table; enforce 200ms hard timeout on graph expansion.

---

## Implications for Roadmap

Based on combined research, the architecture file's suggested build order is authoritative and well-reasoned. Four main phases with clean dependency boundaries:

### Phase 1: Tiered Rate Limiting

**Rationale:** Zero schema changes, zero service additions, immediate user-visible benefit. Fixes the documented v7.0 regression (user-reported 429s during normal workflows). Pure configuration + decorator updates. Lowest-risk change in the entire release. Should ship before any other feature so developers are not hitting false 429s during their own testing.
**Delivers:** Named throttle tiers (`read` 300/min, `write` 60/min, `send` 10/min, `delete` 20/min), updated `@Throttle()` decorators on all controllers, rate limit response headers.
**Addresses:** Tiered write-rate limiting table stakes (MVP Priority 1 from FEATURES.md).
**Avoids:** Pitfall 3 (tier name collision) — requires pre-flight audit of all 17+ existing decorators before touching `ThrottlerModule.forRoot()` config.

### Phase 2: Push Notification Backend Dispatch

**Rationale:** Standalone feature with no impact on the chat pipeline. Completes the broken v8.0 push promise. One Prisma migration (`PushPreference` model). BullMQ dispatch pattern mirrors existing email-sync job patterns — low novelty, high urgency.
**Delivers:** `PushDispatchService`, `PushDispatchListener`, `PushPreferenceService`, `PushPreference` model, preferences API endpoints (`GET/PATCH /push/preferences`), 410/404 subscription cleanup, `push-dispatch` BullMQ queue.
**Addresses:** All push dispatch table stakes (MVP Priority 1 from FEATURES.md).
**Avoids:** Pitfall 1 (stale subscriptions — 410 cleanup on every send), Pitfall 2 (event loop blocking — BullMQ queue required), Pitfall 6 (4KB payload limit — strict schema with truncation), Pitfall 11 (tenant isolation — all preferences scoped to `(tenantId, userId)`), Pitfall 13 (VAPID key mismatch — backend serves public key as single source of truth).
**Operational prerequisite:** `VAPID_PRIVATE_KEY` must be added to Railway backend environment before this phase can go live in production.

### Phase 3: Explicit HITL Approval Routing

**Rationale:** Touches `AiChatService` (highest-traffic code path); needs careful testing in isolation. Requires one Prisma migration (`UserAiPreference` model). Backend dynamic approval is minimal — `createToolSet()` wrapping. Frontend approval renderer with structured diff display is the bulk of the work. Independent of Graph RAG.
**Delivers:** `AiPreferenceService`, `UserAiPreference` model, dynamic `needsApproval` in `createToolSet()`, split approval/informational frontend tool renderers with structured diff display, AI Safety settings section, approval audit logging.
**Addresses:** HITL approval UX table stakes + three-level HITL preference differentiator (MVP Priority 2 from FEATURES.md).
**Avoids:** Pitfall 4 (conversation state divergence — server-side `pendingApprovalId` correlation and toolCallId idempotency), Pitfall 8 (approval fatigue — split informational vs. approval renderers with distinct visual treatment).
**Research flag:** The server-side `pendingApprovalId` correlation mechanism is not currently implemented. The approach needs validation against AI SDK v6 streaming protocol constraints before implementation begins. Spike required at start of phase.

### Phase 4: Graph RAG Steps 4, 6, 8 (Context Assembly + Memory Anchoring + Few-shot)

**Rationale:** Steps 1-3 are working. These three steps deliver the highest value among the remaining graph RAG steps: Step 4 cuts token waste, Step 6 enables entity-aware memory recall, Step 8 improves tool chain accuracy for multi-hop queries. All three are independent of the entity graph materialization (Step 5) which is deferred. Step 8 is the lowest effort with the highest signal-to-code ratio.
**Delivers:** `ContextAssemblyService` with 4K token budget, updated `RagToolsService` using assembled context, AIMemory `entityNodeId` FK + entity-aware `MemoryService` retrieval, `FewShotService` with dynamic query-tier injection, system prompt modification (~40 lines, ~250 tokens per query).
**Addresses:** Graph RAG differentiators (MVP Priority 3 from FEATURES.md).
**Avoids:** Pitfall 5 (JSONB N+1 — add GIN index on `unified_contacts.emails` in this phase; measure query plan first), Pitfall 12 (context inflation — fixed 4K token budget in `ContextAssemblyService`, no recursive expansion from memory injection), Pitfall 15 (prompt bloat — dynamic few-shot injection by tier, not global injection, monitored via `AiRunLedger` input token tracking).
**Note:** Step 5 (entity graph materialization) and Step 7 (tool consolidation) are explicitly deferred to v9.x per MVP recommendation.

### Phase Ordering Rationale

- Rate limiting first: unblocks clean testing of all other features, carries zero schema risk, fixes documented regression immediately.
- Push before HITL: push is self-contained with no impact on the chat pipeline; HITL modifies `AiChatService` (the most critical service) and needs isolated testing.
- HITL before Graph RAG: HITL is simpler (one new model, one method modification) vs. Graph RAG (multiple service chains, schema additions, context budgeting); HITL is also closer to a broken promise (backend pauses, frontend shows nothing) than Graph RAG (search works, just could be smarter).
- Graph RAG last: Steps 1-3 already provide functional search; Steps 4/6/8 improve quality, not restore broken functionality; can ship incrementally within the phase.

### Research Flags

**Phases likely needing `/gsd:research-phase` during planning:**
- **Phase 3 (HITL Approval Routing):** Server-side `pendingApprovalId` correlation against AI SDK v6 streaming protocol is underspecified in research. Pitfall 4 (conversation state divergence) identifies the risk but the fix requires API-level validation before implementation. Treat as a mandatory spike before writing code.
- **Phase 4 (Graph RAG):** GIN index vs. junction table for `unified_contacts.emails` lookup (Pitfall 5) requires a query plan analysis against real data volumes before committing to an approach. The JSONB pattern is confirmed as an anti-pattern but the threshold for degradation needs measurement.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Rate Limiting):** Well-documented `@nestjs/throttler` pattern; codebase already has working named throttler examples; change is purely additive configuration.
- **Phase 2 (Push Dispatch):** `web-push` API is simple and documented; BullMQ dispatch pattern mirrors existing email-sync jobs; `EventEmitter2` listener pattern is established in codebase. No novel integration work.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations verified against actual `package.json` and codebase imports. No speculative dependencies. Alternatives considered and explicitly rejected with rationale. |
| Features | HIGH | Every feature verified against existing codebase state. Broken promises identified by direct code reading (no `sendNotification()` calls exist in codebase). Priority ordering is unambiguous. |
| Architecture | HIGH | All patterns derive from reading existing services, not external sources. Integration points mapped to specific files. Anti-patterns explicitly documented with reasoning. |
| Pitfalls | HIGH | Pitfalls 1, 2, 3, 5, 6, 7, 11, 13, 14 are HIGH confidence (visible in code or MDN-documented). Pitfalls 4, 8, 9, 10, 12, 15 are MEDIUM (design risks, not current bugs). |

**Overall confidence:** HIGH

### Gaps to Address

- **HITL approval server-side state (HIGH priority):** `convertToModelMessages()` HITL path trusts client-provided messages. Pitfall 4 identifies a multi-tab state divergence risk. The fix (`pendingApprovalId` server-side correlation) is not designed. Resolve with a spike at the start of Phase 3 planning before writing any implementation code.

- **Contact email lookup performance (MEDIUM priority):** JSONB `jsonb_array_elements()` JOIN is a confirmed anti-pattern but current contact volumes may be below the degradation threshold. Measure actual PostgreSQL query plan on production data before committing to GIN index vs. junction table. Do this at the start of Phase 4.

- **VAPID key deployment (operational blocker for Phase 2):** `VAPID_PRIVATE_KEY` does not exist in the Railway backend environment. Must be added and matched to the existing `VAPID_PUBLIC_KEY` in frontend config before Phase 2 can ship to production. This is an ops prerequisite, not a code gap — but it blocks production verification of the entire push feature.

- **Rate-limiting decorator audit (prerequisite for Phase 1):** 17+ existing `@Throttle()` decorators must be mapped to new tiers before changing `ThrottlerModule.forRoot()`. No code is blocked by this, but shipping rate limit changes without the audit risks worsening the 429 situation. Do this before writing Phase 1 code.

---

## Sources

### Primary (HIGH confidence)
- Existing codebase — all services, models, controllers, test files read directly; all recommendations verified against running code
- AI SDK v6 HITL cookbook (ai-sdk.dev/cookbook/next/human-in-the-loop) — `needsApproval` property, approval/denial flow
- web-push npm v3.6.7 (npmjs.com/package/web-push) — `sendNotification()` API, VAPID configuration
- NestJS Throttler docs (docs.nestjs.com/security/rate-limiting) — named tiers, `@Throttle()`, `@SkipThrottle()`
- Graph RAG 8-step plan (`C:\Users\Davide\.claude\plans\rosy-imagining-starlight.md`) — Steps 1-3 verified in codebase

### Secondary (MEDIUM confidence)
- MDN Web Push API Best Practices — payload limits (4KB), subscription lifecycle, 410 handling
- NestJS Throttler GitHub — per-endpoint override behavior, simultaneous throttler application
- Graph RAG vs SQL RAG (towardsdatascience.com) — PostgreSQL graph query complexity at modest data volumes

### Tertiary (LOW confidence)
- AI SDK v6 needsApproval mid-execute issue #9862 (github.com/vercel/ai) — limitations of current HITL model; relevant to Pitfall 4 but issue-tracker, not documentation
- EDB SQL/PGQ for PostgreSQL — recursive CTE performance characteristics; informational context for entity graph design

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
