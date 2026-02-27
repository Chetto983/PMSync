# Project Research Summary: v3.2 AI Layer Rebuild & Cleanup

**Project:** MailAgent v3.2
**Domain:** Brownfield AI layer replacement in production email client (NestJS + Next.js)
**Researched:** 2026-02-27
**Confidence:** HIGH

## Executive Summary

MailAgent v3.2 is a brownfield AI layer replacement, not a greenfield build. The core work is surgical: rip out `@voltagent/core` (a thin wrapper around AI SDK v6 that adds overhead without value) and replace it with raw AI SDK v6 primitives (`ToolLoopAgent`, `streamText`, `generateText + Output.object()`), then adopt `assistant-ui` to replace the custom MUI chat components. The codebase already has everything needed — `ai@^6.0.77`, `@assistant-ui/react@0.12.9`, `@ai-sdk/mistral`, and Tailwind in the ai-elements layer — they are just not wired correctly. Net package delta is zero: add 3 packages (assistant-ui glue layer + MSW), remove 3 (VoltAgent trio).

The recommended approach follows strict phase sequencing: backend foundation first (memory migration + new streaming pipeline running in parallel with old), then service consolidation and non-chat AI simplification, then tool migration and consolidation, then the chat frontend redesign, and finally cleanup and VoltAgent deletion. The single most important constraint is that VoltAgent tables, HITL hooks, GDPR PII pipeline, and conversation IDs must all survive the migration intact. Doing a big-bang replacement risks destroying all five simultaneously, which is the primary failure mode in brownfield AI rebuilds. Every phase must leave the system in a deployable, working state.

The key risks are concrete and codebase-verified: VoltAgent has 5 hidden capability bundles beyond "wraps AI SDK" (PostgreSQL memory adapter, `BaseRetriever` base class for RAG, `AgentHooks`/`createHooks()` for HITL capture, `createTool()` format across 19 files, and `createWorkflow`/`andThen` approval workflow primitives) — each must be explicitly replaced before its VoltAgent counterpart is removed. Tool consolidation (28 tools to ~15) will change LLM tool selection behavior in ways that are invisible at compile time; only frozen-prompt replay testing against the new tool set can prevent silent quality regressions. GDPR compliance shipped in v3.1 must be explicitly threaded through every new code path in this rebuild.

---

## Key Findings

### Recommended Stack

The stack requires zero framework changes. The migration is entirely about removing an abstraction layer (`@voltagent/core`) that was wrapping an already-installed library (`ai@^6.0.77`). Three packages are added to complete the wire-up: `@assistant-ui/react-ai-sdk` (connects assistant-ui's runtime to AI SDK v6's `useChat` streaming protocol), `@assistant-ui/react-ui` (pre-styled Thread/Composer components; styled components were split out to a separate package in January 2025), and `msw@^2.12.0` (MSW v2 with first-class SSE handler support for mocking LLM streaming in tests without hitting real APIs). The test stack stays on Jest 30 — migration to Vitest would cost more than it saves given NestJS's Jest-native testing module and the existing dual-workspace Jest configuration.

**Core technologies:**
- `ai@^6.0.77` (already installed): `ToolLoopAgent`, `streamText`, `generateText + Output.object()`, `pipeAgentUIStreamToResponse` — replaces all VoltAgent agent and tool abstractions; no install needed
- `@assistant-ui/react-ai-sdk` (add): `useChatRuntime + AssistantChatTransport` — the missing glue between `@assistant-ui/react@0.12.9` (already installed but unused) and AI SDK v6 streaming protocol
- `@assistant-ui/react-ui` (add): styled Thread, Composer, ThreadList components — replaces custom MUI chat components; styled layer was separated from headless primitives in January 2025
- `msw@^2.12.0` (add, dev): SSE-capable HTTP mock for deterministic LLM testing; minimum version for `sse()` handler support
- `@voltagent/core`, `@voltagent/postgres`, `@sentinelseed/voltagent` (remove): eliminated only after all 5 capability bundles are explicitly replaced and verified working

**Critical breaking changes to handle:** `generateObject()` is deprecated in v6 — use `generateText({ output: Output.object({ schema }) })` instead; `convertToModelMessages()` is now async (add awaits); default `stopWhen` in ToolLoopAgent is `stepCountIs(20)` — must explicitly set to match current VoltAgent `maxSteps: 8`; run `npx @ai-sdk/codemod v6` after VoltAgent removal for mechanical renames.

### Expected Features

The rebuild scope is about correctness and simplification, not new features. The product already has the right capabilities; the rebuild makes them cheaper, faster, and maintainable.

**Must have (table stakes — must survive the rebuild intact):**
- Token-by-token streaming chat — assistant-ui's `ThreadPrimitive.Viewport` handles natively; current custom `useChatScroll` hook can be deleted
- Tool call visualization with status states (running/complete/error) — `makeAssistantToolUI` with `status.type` provides cleaner API than current `SmartToolOutput` pattern
- Human-in-the-loop approval for destructive actions — existing `HitlService` (929 lines, Prisma-based, framework-agnostic) is kept; only the hook capture mechanism must be rewired from VoltAgent `AgentHooks` to `streamText`'s `onStepFinish` callback
- Conversation history — existing Prisma tables survive; VoltAgent `PostgreSQLMemoryAdapter` is replaced with direct Prisma queries in new `ConversationService`; conversation IDs must be preserved
- GDPR PII tokenization on all user data paths — cross-cutting concern, must be explicitly threaded into every new pipeline entry point in v3.2

**Should have (differentiators to keep, not rebuild):**
- Artifact side panel — assistant-ui has no artifact concept; keep existing `ArtifactPanel.tsx` unchanged, integrate with new thread layout
- Smart tool routing by intent — 13 chat tools with intent-based pre-filtering means LLM sees ~6-8 tools per request; preserve `getToolGroupsForIntent()` logic in new `AiChatService`
- Writing style learning — existing `learning.service.ts` kept; only the LLM call migrates from VoltAgent to `generateText + Output.object()`
- Suggested prompts — existing `SuggestedPromptsService` kept and wired into assistant-ui via custom message parts

**Defer to v3.3+:**
- Contextual AI inline in email view (high value, high complexity)
- Artifact panel redesign (works adequately, improve incrementally)
- Advanced streaming array output via `elementStream` (nice-to-have, not blocking)

**Anti-features (actively delete):**
- Custom streaming infrastructure (`useChatScroll`, `StreamingMessage`, `TypingIndicator`) — assistant-ui handles these natively
- Agent pool and multi-agent orchestration (`AgentPoolService`) — single `ToolLoopAgent` is sufficient for a single-tenant chat assistant
- ~35 ai-elements library files that duplicate assistant-ui primitives (message, tool, conversation, loader, shimmer, prompt-input, controls)
- Task complexity classifier and NLP intent classifier services — deleted; tool selection simplifies without needing them
- VoltAgent observability hooks layer — replaced with `onStepFinish`/`onFinish` callbacks directly on `streamText`

### Architecture Approach

The target architecture replaces the 6-hop VoltAgent chat pipeline (Controller → VoltAgentService → ChatPrepareService → ChatContextBuilderService → AgentPoolService → VoltAgent Agent) with a 3-hop pipeline (AiChatController → AiChatService → `streamText()`). Tools move from factory functions that thread NestJS services as constructor parameters into `@Injectable()` `*ToolsService` classes where NestJS DI provides services via closures — dramatically simpler and fully type-safe. Non-chat AI features (briefing, follow-up detection, draft generation) move from agent loops to single `generateText + Output.object()` calls with pre-fetched context, cutting LLM call count per operation in half. Service count drops from ~69 total to ~37 (32 services eliminated or relocated to their proper domain modules). Tool count drops from 29 (including duplicates) to ~22.

**Major components:**
1. `AiChatService` (new, replaces 4 services) — `streamText()` orchestration with DI-injected tool services, context building, and PII/rate-limit pipeline; replaces VoltAgentService + ChatPrepareService + ChatContextBuilderService + AgentPoolService
2. `*ToolsService` classes (10 services, new pattern) — each `@Injectable()` service exposes `getTools(tenantId, userId)` returning AI SDK v6 `tool()` definitions with full NestJS DI access via closures; no parameter threading
3. `AiChatRuntime` frontend component — `useChatRuntime + AssistantChatTransport` pointing at new `/api/v1/ai/chat/stream` endpoint, wrapped in `AssistantRuntimeProvider`; scoped tightly to the chat panel only to avoid state conflicts with TanStack Query and Zustand
4. `ConversationService` (replaces VoltAgent Memory adapter) — direct Prisma reads/writes to existing conversation tables; preserves conversation IDs and message content
5. Domain services migrated from VoltAgent module — CRM/relationship services move to `contacts/` module; calendar conflict/focus/meeting-prep services move to `calendar/` module

### Critical Pitfalls

1. **VoltAgent removal destroys 5 hidden dependencies** — VoltAgent provides distinct capabilities beyond "wraps AI SDK": PostgreSQL memory adapter, `BaseRetriever` base class (RAG pipeline), `AgentHooks`/`createHooks()` (HITL capture), `createTool()` format (19 files, ~65+ tools), and `createWorkflow`/`andThen` (approval workflow). Each must be explicitly replaced and verified working before `npm uninstall`. Removal must be Phase 5 (last), never concurrent with the migration. Runtime failures (empty conversations, missing HITL cards, empty RAG results) appear only after deployment. Prevention: compile errors on import removal catch some issues immediately; integration tests for HITL flow, RAG retrieval, and conversation history must pass before VoltAgent tables are dropped.

2. **Tool consolidation silently changes LLM behavior** — Merging 28 tools to ~15 changes the tool names, descriptions, and parameter schemas that the LLM uses for selection. Specific failure modes with Mistral models: description inflation in multi-mode tools, optional parameter ambiguity, name semantic drift. This is entirely invisible at compile time. Prevention: replay 50+ real user queries against the new tool set and compare tool selection outcomes before deployment; preserve existing tool names where possible; keep read-only and write tools as separate tools for HITL gating; keep descriptions under 200 chars per mode.

3. **HITL approval flow breaks silently after VoltAgent hook removal** — `voltagent.service.ts:233-234` has a critical comment about `onPendingAction` capturing HITL actions from tool executions via VoltAgent's `createHooks()`. Without this hook, write actions (send email, delete, move) execute without user approval. Prevention: trace `hooks.ts` and `learning.ts` to find the exact callback; implement equivalent logic in `streamText`'s `onStepFinish`; add a safety-net that always creates a pending action if a tool result contains an `actionId` field; write an integration test verifying the full HITL path before removing VoltAgent.

4. **Conversation data loss during migration** — VoltAgent's `PostgreSQLMemoryAdapter` uses `voltagent_memory_*` prefixed tables; `conversation-management.service.ts` is entirely built on VoltAgent's `Memory` type. Prevention: export all conversations via direct SQL before any migration begins; maintain dual-read during transition (new conversations to new system, old conversations from VoltAgent tables via thin adapter); preserve conversation IDs; test migration with realistic data volume.

5. **GDPR compliance regression** — v3.1 shipped PII tokenization, encryption-at-rest, audit logging, and consent guards. New code paths in v3.2 can silently bypass these if not explicitly wired. Prevention: compliance checklist for every new code path that handles user data; integration test ("send PII-containing message → verify tokenization before LLM call"); `pii-detection-sentinel.service.ts` and `prompt-guard-sentinel.service.ts` must be explicitly wired into the new `streamText()` pipeline, not just VoltAgent hooks.

---

## Implications for Roadmap

Based on combined research, the phase structure is dictated by hard dependencies: memory migration must precede agent removal, backend stability must precede frontend redesign, and cleanup must come last. The architecture migration order from ARCHITECTURE.md is the most reliable guide and directly aligns with pitfall prevention.

### Phase 1: Backend Foundation (Zero Breakage)

**Rationale:** Creates the new pipeline alongside the old — no existing code is touched, zero regression risk. Must come first because all subsequent phases depend on a working new streaming endpoint. Memory migration and HITL rewiring are the highest-risk items and belong here.
**Delivers:** New `POST /api/v1/ai/chat/stream` endpoint working end-to-end with a simple tool call; `ConversationService` with Prisma-based history; new `*ToolsService` classes with AI SDK v6 `tool()` definitions; `ConversationService` reading and writing existing conversation tables; HITL `onStepFinish` capture mechanism in place; MSW test infrastructure set up.
**Addresses:** Table-stakes streaming, conversation history, tool execution baseline, HITL safety
**Avoids:** CP-1 (VoltAgent hidden dependencies), CP-3 (conversation data loss), CP-5 (GDPR regression), MP-2 (HITL flow break), MiP-3 (Prisma migration timing)
**Research flag:** No additional research needed — AI SDK v6 NestJS streaming is fully documented in the official cookbook. `ConversationService` is standard Prisma CRUD.

### Phase 2: Service Consolidation + Non-Chat AI Migration

**Rationale:** Service merging and non-chat AI simplification are independent of the chat frontend redesign but depend on the Phase 1 foundation being stable. The follow-up service cluster (5 files) and chat pipeline services (3 files) must be merged with characterization tests written first, one merge per PR. Non-chat AI (briefing, drafts, follow-ups) migrates from agent loops to `generateText + Output.object()`.
**Delivers:** Service count from ~69 to ~37; `DailyBriefingService`, `DraftGenerationService`, `FollowUpService` all using `generateText + Output.object()`; domain services moved to `contacts/` and `calendar/` modules; 8 services deleted (AgentPoolService, TaskComplexityClassifierService, NlpIntentClassifierService, ApprovalWorkflowService, MistralBatchService, AiQueueService, UnifiedKnowledgeService, AgentMetricsService).
**Uses:** `generateText + Output.object()` from `ai@^6.0.77`; Prisma for all persistence; NestJS `forwardRef()` for any circular deps introduced by module moves
**Avoids:** HP-2 (silent service regression), HP-3 (generateObject quality degradation)
**Research flag:** Pre-fetch data requirements for briefing and follow-up extraction need auditing against current agent loop tool call logs — this is codebase introspection (read `daily-briefing.service.ts` and `follow-up-extraction.service.ts` execution traces), not external research.

### Phase 3: Tool Migration + Consolidation

**Rationale:** Tools must migrate after the backend foundation is stable but before the frontend redesign (which must build tool renderers against the final tool set). Tool consolidation carries the highest behavioral risk in the entire rebuild — LLM behavior changes are completely invisible until users complain. Must include frozen-prompt replay validation before deployment.
**Delivers:** All 19 tool files converted from `createTool()` (VoltAgent) to `tool()` (AI SDK v6); 29 tools (including duplicates) reduced to ~22; `getToolsForIntent()` intent routing preserved in `AiChatService`; locale system (en/it translations in tool descriptions) preserved throughout; duplicates deleted (`manage_email` x2, `bulk_email_actions` x2).
**Avoids:** CP-2 (LLM tool selection regression), MiP-2 (locale fragility)
**Research flag:** Frozen-prompt replay testing (50+ real queries comparing old vs new tool set) is required before deployment. This is a pre-release validation step, not addressable through planning research.

### Phase 4: Chat Frontend Redesign

**Rationale:** Frontend redesign depends on stable Phase 1-3 backend — specifically, the stable endpoint and the known final tool set (tool renderers must match consolidated tools). `AssistantRuntimeProvider` must be scoped tightly to the chat panel only to avoid state management conflicts with TanStack Query and Zustand stores.
**Delivers:** `AiChatRuntime` with `useChatRuntime + AssistantChatTransport`; 10 domain tool renderers migrated to `makeAssistantToolUI` format; HITL/AskUser via tool renderer pattern; `ThreadList` for conversation management; mobile layout; ~35 deleted ai-elements files that assistant-ui replaces; CSS isolation boundary between MUI (email layout) and Tailwind (chat panel).
**Uses:** `@assistant-ui/react-ai-sdk`, `@assistant-ui/react-ui` (both new packages)
**Avoids:** HP-1 (state management conflicts), MP-3 (bundle size increase), IP-2 (WebSocket/HITL real-time event breakage)
**Research flag:** Review `RealtimeEventsService` WebSocket event contract (event names, payload shapes for HITL real-time updates) before beginning frontend work. The HITL card real-time update path depends on this being preserved exactly.

### Phase 5: Cleanup + VoltAgent Deletion

**Rationale:** This is the last phase, only after everything is verified working through the new pipeline across Phases 1-4. Running `npm uninstall @voltagent/core @voltagent/postgres @sentinelseed/voltagent` is a milestone signaling completion, not a starting point. Old v3 controller endpoints and tool factory files are deleted here.
**Delivers:** Zero VoltAgent dependencies in `npm ls`; deleted old tool factory files; deleted old `POST /api/v1/voltagent/chat/stream/v3` endpoint; deleted custom MUI chat components; deleted merged and relocated services; updated module registrations; clean type-check and lint.
**Avoids:** CP-1 (attempting VoltAgent removal before replacements are verified)
**Research flag:** Standard patterns — no research needed. This is file deletion and dependency removal.

### Phase Ordering Rationale

- Phase 1 must come first: memory migration is the highest-risk item; the new endpoint must exist and be verified before any other phase can be tested end-to-end
- Phase 2 and Phase 3 are sequentially ordered (Phase 2 before Phase 3) because some services being consolidated in Phase 2 (follow-up extraction, briefing) are related to tools being migrated in Phase 3; however, they share no hard blocking dependency and could be partially parallelized
- Phase 4 strictly after Phase 1-3: the frontend redesign depends on a stable backend endpoint and must build tool renderers against the finalized tool set from Phase 3
- Phase 5 strictly last: VoltAgent deletion is the cleanup prize earned after everything is verified working, not a migration strategy

---

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 2 (non-chat AI quality):** Audit current agent loop tool call logs for briefing and follow-up extraction to establish complete pre-fetch data requirements. If the agent loop calls 4 tools during briefing generation, all 4 data sources must be pre-fetched before the `generateText` call. This is codebase reading, not external research.
- **Phase 4 (frontend):** Review `RealtimeEventsService` WebSocket event contract before beginning assistant-ui integration. HITL card real-time updates (actionId, approval state) depend on this event shape being preserved in the new frontend.

Phases with standard patterns (skip research-phase):

- **Phase 1 (foundation):** AI SDK v6 NestJS streaming is fully documented in the official cookbook with working examples. Prisma CRUD for ConversationService is standard.
- **Phase 3 (tool migration):** The `createTool()` to `tool()` conversion is mechanical; the AI SDK v6 codemod handles most renames. The consolidation plan is already specified in ARCHITECTURE.md Section 4.
- **Phase 5 (cleanup):** Package removal and file deletion require no research.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions verified against npm and official docs; version compatibility matrix confirmed; codemod path verified; VoltAgent import sites traced across 30+ files in codebase |
| Features | HIGH | Core features verified against official assistant-ui and AI SDK v6 docs; tool count threshold (~10 per request) is MEDIUM confidence (multiple informal sources, no rigorous benchmark) |
| Architecture | HIGH | Codebase directly analyzed — 167 AI module files, 46 VoltAgent services, 19 tool files, 25+ `@voltagent/core` import sites; target architecture patterns from official docs |
| Pitfalls | HIGH | Pitfalls derived from direct codebase analysis + official migration guides + community GitHub issues (ExternalStoreRuntime `isRunning` bug #2603, React 19 Turbopack issue #2925); VoltAgent hidden dependencies verified by tracing actual import sites |

**Overall confidence:** HIGH

### Gaps to Address

- **VoltAgent `voltagent_memory_*` table schema:** The exact schema is not publicly documented. Must be inspected via `psql \d+ voltagent_memory_*` or Prisma introspection before designing the data migration in Phase 1. The migration script depends on understanding the exact columns.
- **Tool selection accuracy threshold (~10 tools max per request):** Multiple informal sources agree but no rigorous benchmark was found. Validate during Phase 3 by running real queries against both current 28-tool and target 15-tool configurations before deployment.
- **`generateText + Output.object()` quality parity for briefing and follow-ups:** PITFALLS.md flags that replacing agent loops with direct `generateText` may reduce output quality if pre-fetch context is incomplete. Validate during Phase 2 with A/B comparison (50+ cases, old agent loop vs new `generateText`) before full deployment.
- **ExternalStoreRuntime `isRunning` bug (assistant-ui GitHub #2603):** Mitigated by using `LocalRuntime` (not `ExternalStoreRuntime`) as recommended in ARCHITECTURE.md. Verify bug fix status when implementing Phase 4 to confirm this mitigation is still necessary.

---

## Sources

### Primary (HIGH confidence — official documentation)
- [AI SDK v6 Release Blog](https://vercel.com/blog/ai-sdk-6) — ToolLoopAgent, Output API, migration path
- [AI SDK v5 to v6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) — breaking changes, codemod
- [ToolLoopAgent Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent) — full API
- [Output API Reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/output) — structured output patterns
- [pipeAgentUIStreamToResponse](https://ai-sdk.dev/docs/reference/ai-sdk-core/pipe-agent-ui-stream-to-response) — NestJS streaming
- [AI SDK NestJS Cookbook](https://ai-sdk.dev/cookbook/api-servers/nest) — integration pattern
- [AI SDK Structured Data Generation](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) — Output.object, Output.array
- [assistant-ui Documentation](https://www.assistant-ui.com/docs) — runtime, primitives, makeAssistantToolUI
- [assistant-ui AI SDK v6 Integration](https://www.assistant-ui.com/docs/api-reference/integrations/vercel-ai-sdk) — useChatRuntime API
- [MSW SSE Documentation](https://mswjs.io/docs/sse/) — SSE handler support verified

### Secondary (MEDIUM confidence — multiple sources or verified examples)
- [assistant-ui GitHub AI SDK v6 example](https://github.com/assistant-ui/assistant-ui/tree/main/examples/with-ai-sdk-v6) — integration pattern verified
- [Tool Calling Optimization Research](https://www.useparagon.com/learn/rag-best-practices-optimizing-tool-calling/) — tool count impact on LLM accuracy
- Codebase analysis — 167 AI module files, service dependency map, import site tracing
- [ExternalStoreRuntime isRunning Bug](https://github.com/assistant-ui/assistant-ui/issues/2603) — known state bug, community-verified

### Tertiary (LOW confidence — single source or inference)
- Tool count accuracy threshold (~10 tools max per request) — multiple informal sources, no rigorous benchmark
- assistant-ui npm download numbers — could not fetch from npmjs.com
- `voltagent_memory_*` table schema — not publicly documented, must be introspected from running database

---

*Research completed: 2026-02-27*
*Ready for roadmap: yes*
