# Domain Pitfalls: v3.2 AI Layer Rebuild

**Domain:** Brownfield AI layer rebuild in production email client
**Researched:** 2026-02-27
**Confidence:** HIGH (codebase-verified, official docs, community evidence)

---

## Executive Summary

Rebuilding the AI layer of a production email client with real users is a minefield with six distinct blast zones. After analyzing the MailAgent codebase (167 AI module files, 46 VoltAgent services, 19 tool files, ~25 `@voltagent/core` import sites) and cross-referencing with the AI SDK v6 migration guide, assistant-ui documentation, and industry post-mortems, these are the pitfalls ranked by likelihood of causing production regressions.

The single most dangerous mistake is doing a "big bang" migration -- replacing VoltAgent, redesigning the chat UI, consolidating services, and reducing tools all at once. Each change amplifies the risk of the others. The second most dangerous mistake is merging tools without re-evaluating prompt engineering -- the LLM "sees" tools differently when their names, descriptions, and parameter shapes change.

---

## Critical Pitfalls (Severity: PRODUCTION BREAKAGE)

### CP-1: VoltAgent Framework Removal Destroys Hidden Dependencies

**What goes wrong:**
You `npm uninstall @voltagent/core @voltagent/postgres` and the app compiles. Then you discover at runtime that conversation history is gone, tool execution errors are swallowed, HITL actions stop appearing, and the RAG retriever returns empty arrays.

**Why it happens:**
VoltAgent is not just a wrapper around AI SDK. It provides at least 5 distinct capabilities that are deeply wired into the codebase:

1. **Memory + PostgreSQLMemoryAdapter** (`voltagent.service.ts:196`) -- All conversation persistence lives in `voltagent_memory_*` tables via this adapter. Removing VoltAgent means these tables become orphaned and the conversation management service (`conversation-management.service.ts:22`) loses its `Memory` type entirely.

2. **createTool() format** -- Every tool file (19 files, ~65+ tools) uses `createTool()` from `@voltagent/core`. AI SDK v6's `tool()` has a different signature: `execute` receives a parameter object `{ ...params }` vs VoltAgent's destructured params. The Zod schemas are compatible but the wrapper is not.

3. **Agent class + hooks system** -- `unified.agent.ts:19` imports `Agent, AgentHooks, Memory, Tool` from `@voltagent/core`. The hooks system (`observability/hooks.ts`) drives metrics, learning, and HITL action capture. `createHooks()` is VoltAgent-specific.

4. **BaseRetriever** -- `unified-retriever.ts:3` extends `BaseRetriever` from `@voltagent/core`. This is the entire RAG pipeline's base class.

5. **createWorkflow/andThen** -- `approval.workflow.ts:7` uses VoltAgent's workflow primitives for the HITL approval flow.

**Consequences:**
- Conversation history silently disappears (users see empty chat)
- HITL approval workflow breaks (dangerous actions execute without approval)
- RAG retriever fails silently (AI gives empty/hallucinated answers)
- Tool execution errors lose structured error handling
- Observability/metrics collection stops

**Prevention:**

| VoltAgent Feature | AI SDK v6 Replacement | Migration Effort |
|---|---|---|
| `createTool()` | `tool()` from `ai` | Mechanical: change signature in 19 files |
| `Memory` + `PostgreSQLMemoryAdapter` | Custom Prisma-based message store | HIGH: must design schema, migrate data |
| `Agent` class | `streamText()` + tool loop | MEDIUM: rewrite `createUnifiedAgent()` |
| `AgentHooks` / `createHooks()` | Custom middleware/callbacks on `streamText` options | MEDIUM: `onStepFinish`, `onFinish` callbacks |
| `BaseRetriever` | Plain async function returning string[] | LOW: remove class, keep logic |
| `createWorkflow` / `andThen` | Plain async function chain | LOW: already simple |

**Detection:**
- Compile errors on import removal (immediate)
- Runtime: empty conversation list, missing HITL cards, degraded search quality
- Monitor: track conversation message count, HITL action creation rate, RAG result count

**Phase assignment:** Phase 1 (Backend Foundation) -- must complete memory migration before anything else touches conversations

---

### CP-2: Tool Consolidation Breaks LLM Tool Selection Behavior

**What goes wrong:**
You merge 65+ tools down to ~30 by combining related tools into multi-mode tools (like the existing `list_emails` which already consolidates 3 operations). The LLM starts calling the wrong tool modes, passes incorrect parameters, or fails to discover capabilities that existed in the old separate tools.

**Why it happens:**
LLMs select tools based on three signals: **tool name**, **tool description**, and **parameter schema**. When you change any of these, you change the LLM's behavior unpredictably. Specific failure modes:

1. **Description inflation** -- When a consolidated tool's description covers too many capabilities, the LLM gets confused about which mode to use. The existing `list_emails` tool already has a 10-line description. Merging more modes makes it worse.

2. **Parameter explosion** -- Optional parameters that only apply to certain modes create ambiguity. The LLM may pass `emailId` when using `mode="accounts"` because the parameter is visible.

3. **Name semantic drift** -- Renaming `search_emails` + `get_email_content` into a single `email_query` tool means the LLM must learn a new mental model. This is especially brittle with Mistral models (smaller context windows, less tool-calling training data than GPT-4/Claude).

4. **Loss of specificity** -- Separate tools with focused descriptions give the LLM clear intent signals. "search_emails: Search emails by query" is unambiguous. "email_operations: Multi-mode email tool supporting search, read, list, triage..." is ambiguous.

**Real evidence:**
- Anthropic's tool search research shows 85% token reduction is possible but requires careful description engineering
- The existing `list_emails` consolidation in `email.tools.ts:122-148` already shows the pattern working -- but it took explicit mode examples in the description to make it reliable
- MailAgent v3.0 pitfalls research documented "tools not consolidated" as a symptom of agent confusion when too many overlapping tools existed

**Consequences:**
- AI gives wrong answers ("I couldn't find that email" when it exists)
- AI calls tools with wrong parameters (silent failures or crashes)
- AI makes multiple unnecessary tool calls (slower, more expensive)
- Regression is invisible until users complain -- no compile-time safety

**Prevention:**

1. **Golden rule: 1 tool = 1 cognitive concept.** Merge tools that operate on the same noun with the same verb. Do NOT merge `search_emails` with `send_email` just because both involve emails.

2. **Test tool selection with frozen prompts.** Before deploying merged tools, replay 50+ real user queries against the new tool set and verify the LLM selects the correct tool with correct parameters. Log discrepancies.

3. **Keep description length under 200 chars per mode.** Use structured examples in descriptions (the existing `list_emails` pattern is good).

4. **Never merge tools that have different safety levels.** Read-only tools and write tools should remain separate so HITL can gate writes without blocking reads.

5. **Preserve tool names where possible.** If `search_emails` worked before, keep `search_emails` as a name even if the implementation changes.

**Detection:**
- A/B test: run old tools and new tools side by side on same prompts, compare tool selection
- Monitor: tool call error rate, tool call count per conversation (should decrease, not increase)
- User reports: "the AI can't find my emails anymore"

**Phase assignment:** Phase 2 (Tool Migration) -- after backend foundation is stable, before chat UI redesign

---

### CP-3: Memory/Conversation Data Loss During Migration

**What goes wrong:**
Existing conversation history stored in `voltagent_memory_*` PostgreSQL tables becomes inaccessible after removing VoltAgent's `PostgreSQLMemoryAdapter`. Users open the chat and see zero history. Or worse: the new system creates duplicate conversations because it cannot read old ones.

**Why it happens:**
VoltAgent's `PostgreSQLMemoryAdapter` uses its own table schema (`voltagent_memory_*` prefix, as configured in `voltagent.service.ts:198`). When you replace this with a custom Prisma-based message store, you must:

1. Understand VoltAgent's table schema (not publicly documented in detail)
2. Write a data migration to convert old format to new format
3. Handle the transition period where both old and new systems coexist

The `conversation-management.service.ts` is entirely built on the `Memory` type from VoltAgent. Every method -- list conversations, get messages, delete conversation -- goes through this abstraction.

**Consequences:**
- Users lose all conversation history (trust-destroying)
- Duplicate conversation IDs cause data corruption
- ConversationAtomicityService's saga pattern breaks if it assumed VoltAgent Memory API semantics

**Prevention:**

1. **Read-first migration:** Before removing VoltAgent, write a script that reads all conversations from `voltagent_memory_*` tables and exports them to a format your new system can import. Do NOT rely on the adapter -- query the tables directly.

2. **Dual-read period:** For the first release after migration, keep VoltAgent tables read-only. New conversations go to the new system. Old conversations are served from VoltAgent tables via a thin read adapter. Gradually migrate old data.

3. **Conversation ID preservation:** Whatever new storage you use must preserve the same conversation IDs so frontend links, bookmarks, and the HITL session references continue working.

4. **Test with production-like data volume:** The conversation table may have thousands of entries per tenant. Test migration with realistic data, not empty test databases.

**Detection:**
- Pre-migration: count conversations per tenant, snapshot for comparison
- Post-migration: verify same counts, spot-check message content
- Monitor: conversation list API 404 rate, empty conversation responses

**Phase assignment:** Phase 1 (Backend Foundation) -- this is the FIRST thing to migrate, before touching tools or agents

---

## High Severity Pitfalls (Severity: MAJOR REGRESSION)

### HP-1: Chat Frontend Replacement Creates State Management Conflicts

**What goes wrong:**
You replace the custom chat UI with assistant-ui components, but the existing app already has state management (TanStack Query for server state, Zustand stores, MUI theme context) that conflicts with assistant-ui's internal state. The chat works in isolation but breaks when integrated into the three-panel email layout.

**Why it happens:**
Assistant-ui v0.12 (`@assistant-ui/react@0.12.9` already in `package.json`) has its own state management via `AssistantRuntimeProvider`. It manages:
- Message list state
- Streaming state (`isRunning`)
- Tool call state
- Thread state

Conflicts arise when:

1. **Dual source of truth** -- If you also store chat messages in TanStack Query (for persistence/sync), you have two sources of truth. Assistant-ui's runtime and your query cache will drift.

2. **Provider nesting** -- assistant-ui requires `AssistantRuntimeProvider` wrapping the chat components. If this wraps too much of the app (e.g., at the layout level), it can interfere with other providers. If it wraps too little, child components lose access.

3. **Styling collisions** -- MailAgent uses both MUI and shadcn/ui with Tailwind. Assistant-ui components are Tailwind-based. MUI's CSS-in-JS (emotion) and Tailwind can produce specificity wars. The `ai-elements/` directory already uses Tailwind (per CLAUDE.md: "ai-elements use Tailwind, not MUI"), but the parent layout is MUI.

4. **React version sensitivity** -- assistant-ui v0.12 has known issues with React 19.2.3 and Next.js 16 Turbopack (GitHub issue #2925: "Resource updated before mount error"). If MailAgent upgrades React, this will hit.

5. **ExternalStoreRuntime bugs** -- If you use ExternalStoreRuntime to connect assistant-ui to your own backend, `isRunning` has a known bug where it reports false even during active streaming (GitHub issue #2603).

**Consequences:**
- Chat shows stale messages after navigation
- Streaming indicator does not work (user thinks AI is broken)
- CSS breaks in specific components (MUI dialog inside assistant-ui thread)
- Memory leaks from unmounted providers

**Prevention:**

1. **Use LocalRuntime, not ExternalStoreRuntime.** LocalRuntime manages state internally and connects to your REST/streaming backend via a clean adapter. Avoids the `isRunning` bug.

2. **Scope AssistantRuntimeProvider tightly.** Wrap ONLY the chat panel, not the entire layout. Pass data in via props, not context.

3. **Do not duplicate message state.** Choose one source of truth: either assistant-ui manages messages (and you sync to server on demand) or TanStack Query manages messages (and you use ExternalStoreRuntime). Not both.

4. **Create a CSS isolation boundary.** Use a Tailwind `@layer` or a CSS scope wrapper around the chat panel to prevent MUI styles from leaking in and Tailwind utilities from leaking out.

5. **Pin React and assistant-ui versions.** Do not upgrade React or assistant-ui in the same PR as the chat redesign. Test the chat with current versions first.

**Detection:**
- Visual: messages flicker, duplicate, or disappear on navigation
- Console: React warnings about state updates on unmounted components
- Network: duplicate API calls for same conversation
- Lighthouse: memory leak warnings in long sessions

**Phase assignment:** Phase 3 (Chat Frontend) -- after backend is stable, tools are migrated

---

### HP-2: Service Consolidation Introduces Silent Regressions

**What goes wrong:**
You merge 46 VoltAgent services into ~20, and one of the merged services subtly changes behavior -- wrong default values, missing edge case handling, or broken dependency injection. The app compiles, tests pass, but production users hit errors in specific scenarios (e.g., follow-up extraction fails for emails in Italian, or daily briefing misses calendar conflicts).

**Why it happens:**
The current service architecture has 46 files in `voltagent/services/` (excluding tests). Many share state or depend on initialization order:

1. **Follow-up services (5 files):** `follow-up.service.ts`, `follow-up-crud.service.ts`, `follow-up-extraction.service.ts`, `follow-up-queue.service.ts`, `follow-up-scanner.service.ts`. These have subtle interdependencies: the scanner queues items, the queue processes them, extraction parses email content, CRUD persists results, and the main service orchestrates. Merging them risks losing the queue's rate limiting or the scanner's scheduling logic.

2. **Chat pipeline (3 files):** `chat-request-processor.service.ts`, `chat-context-builder.service.ts`, `chat-response-processor.service.ts`. These form a pipeline: request -> context -> response. Each has distinct error handling. Merging them into one service means one massive try/catch instead of three specific ones.

3. **Domain services in wrong module:** Calendar-conflict, CRM, writing-style services live in `voltagent/` but belong in `calendar/`, `crm/`, `email/` modules. Moving them changes their NestJS module context, which can break dependency injection if the target module does not import the required providers.

**Consequences:**
- Specific features silently degrade (follow-ups stop being detected, briefings lose data)
- DI errors at startup (NestJS `Nest could not resolve dependency` errors)
- Increased coupling makes future changes harder
- Testing surface area drops if merged service tests cover fewer edge cases

**Prevention:**

1. **Write characterization tests BEFORE merging.** For each service you plan to merge, write tests that capture its current behavior -- including edge cases. These become your regression safety net. You currently have only 3 test files in `services/__tests__/`.

2. **Merge in dependency order.** Start with leaf services (no downstream dependents), then work inward. Follow-up CRUD before follow-up orchestrator. Chat response processor before chat pipeline.

3. **One merge per PR.** Each consolidation is a separate, reviewable commit. If follow-ups break, you can revert the follow-up merge without touching the chat pipeline merge.

4. **Preserve method signatures.** When merging service A into service B, keep A's public method names as-is. The callers should not need to change. Rename internally if needed, but the public API stays stable.

5. **Use NestJS `forwardRef()` for circular deps.** When moving domain services between modules, you will hit circular dependency errors. Solve with `forwardRef(() => TargetModule)` in module imports, not by flattening the module structure.

**Detection:**
- CI: NestJS bootstrap fails (DI errors caught immediately)
- Integration tests: existing test suite catches behavioral regressions
- Production: monitor feature-specific metrics (follow-up creation rate, briefing generation success rate, chat response time)

**Phase assignment:** Phase 2 (Service Consolidation) -- after memory migration, before tool reduction

---

### HP-3: generateObject() for Non-Chat AI Silently Degrades Output Quality

**What goes wrong:**
You replace agent loops (used for briefing, follow-up generation) with `generateObject()` as planned, and the output quality drops because `generateObject()` does not have access to tools -- it just generates a structured object from a prompt. Features that previously used tool calls to fetch live data (e.g., briefing checking calendar for conflicts) now rely on pre-fetched data being complete.

**Why it happens:**
The current `daily-briefing.service.ts` and `follow-up-extraction.service.ts` likely use agent loops where the LLM can call tools to gather information iteratively. With `generateObject()`, you must:

1. Pre-fetch ALL relevant data before the LLM call
2. Include it in the prompt
3. Hope the prompt is comprehensive enough

If you miss a data source (e.g., forget to include calendar events when generating the briefing), the LLM cannot compensate by calling a tool. It will either hallucinate or produce incomplete output.

**Consequences:**
- Daily briefing misses important information (calendar conflicts, urgent follow-ups)
- Follow-up extraction accuracy drops because it cannot query for additional context
- Users lose trust in AI features ("the AI used to catch this, now it doesn't")

**Prevention:**

1. **Audit every agent loop you plan to replace.** For each one, list every tool call the agent makes during a typical execution. This is your "data requirements" list. ALL of that data must be pre-fetched.

2. **Use `generateObject()` with explicit Zod schemas.** The schema forces structured output, which is actually more reliable than parsing agent text output. But the quality depends entirely on input completeness.

3. **Add fallback tool access.** For complex features like briefing, consider using `streamText()` with tools instead of `generateObject()`. The overhead is small (one extra round-trip) but the quality improvement is significant.

4. **Compare outputs.** Before switching, run both approaches on the same inputs for 50+ cases and compare. If `generateObject()` output quality is within 90% of agent loop output, proceed. If not, keep the tool loop for that specific feature.

**Detection:**
- User feedback: "briefing is missing X"
- Metrics: briefing content length drops, follow-up detection rate drops
- A/B comparison of old agent loop vs new generateObject on same inputs

**Phase assignment:** Phase 2 (Backend Rebuild) -- after service consolidation, can be done incrementally per feature

---

## Moderate Pitfalls (Severity: DEGRADED EXPERIENCE)

### MP-1: Streaming Behavior Changes Between VoltAgent Agent and AI SDK streamText

**What goes wrong:**
The chat streaming works but behaves differently: tool call results appear at wrong times, streaming pauses during tool execution (where VoltAgent showed a loading indicator), or the `maxSteps` default change causes infinite tool loops.

**Why it happens:**
VoltAgent's `Agent` class wraps AI SDK's `streamText` but adds its own streaming behavior:
- Custom step management (currently `maxSteps: 8` in `unified.agent.ts:379`)
- Hook callbacks between steps (`onStepFinish`)
- Tool result formatting

AI SDK v6's `streamText` changed the default `maxSteps` from 1 to 20 (via `ToolLoopAgent` replacement). If you switch from VoltAgent's `Agent(maxSteps: 8)` to raw `streamText()` without setting `maxSteps`, the LLM will loop up to 20 times, calling tools repeatedly.

**Consequences:**
- LLM calls 20 tools instead of 8 (cost explosion, latency spike)
- Streaming UX changes (pauses, different chunk sizes)
- HITL actions captured at wrong points in the stream

**Prevention:**
- Explicitly set `maxSteps: 8` in `streamText()` options
- Implement `onStepFinish` callback to replicate VoltAgent's hook behavior
- Test streaming with tools that trigger multi-step execution (e.g., search then summarize)
- Compare streaming chunk timing between VoltAgent and raw streamText

**Phase assignment:** Phase 1 (Backend Foundation)

---

### MP-2: HITL (Human-in-the-Loop) Approval Flow Breaks Silently

**What goes wrong:**
The HITL service (`hitl.service.ts`, 929 lines) is robust and framework-agnostic -- it uses Prisma directly. But the integration point where VoltAgent hooks capture pending actions during tool execution will break when VoltAgent is removed.

**Why it happens:**
Looking at `voltagent.service.ts:233-234`:
```
// CRITICAL: onPendingAction captures HITL actions from sub-agent tools
// that would otherwise be lost during delegate_task execution
```

The observability hooks (`hooks.ts:13`) use VoltAgent's `createHooks()` to intercept tool executions and detect when a tool returns a pending action. Without these hooks, tool results that contain HITL payloads are silently discarded.

**Consequences:**
- Dangerous actions (send email, delete contact) execute without user approval
- HITL cards stop appearing in chat UI
- Users cannot review AI-proposed actions before execution

**Prevention:**
1. Map the exact hook callback that captures HITL actions (read `hooks.ts` and `learning.ts` in detail)
2. Implement equivalent logic in `streamText`'s `onStepFinish` callback
3. Write an integration test: "when tool returns HITL payload, verify ActionQueue row is created"
4. Add a safety net: if a tool's result contains an `actionId` field, always create a pending action regardless of hook state

**Phase assignment:** Phase 1 (Backend Foundation) -- this is safety-critical

---

### MP-3: Frontend Bundle Size Increases Instead of Decreasing

**What goes wrong:**
You add assistant-ui components for the new chat, add new tool renderer components, but forget to remove the 65+ old `ai-elements/` components that are no longer used. Bundle size increases instead of the planned decrease.

**Why it happens:**
The `frontend/src/components/ai-elements/` directory has 65+ component files. Many are generic UI primitives (canvas, edge, node, file-tree, terminal, etc.) that may not be used by the email client at all. Without a dead code audit, they persist in the bundle.

Additionally, if you import assistant-ui and keep the old custom chat components, you are shipping two chat implementations.

**Consequences:**
- LCP/TTI gets worse, not better (contradicts the <2.5s target)
- Bundle analyzer shows two chat libraries
- Users on mobile experience worse performance

**Prevention:**
1. **Before adding assistant-ui:** Run `npx next-bundle-analyzer` and document current bundle size per chunk
2. **Audit ai-elements/ usage:** Use tree-shaking analysis or `grep` to find which components are actually imported. Remove unused ones.
3. **Lazy-load the entire chat panel:** The chat is not on the critical path for email viewing. Lazy-load it with `React.lazy()` + `Suspense`. Currently NO lazy loading exists in the frontend (0 `React.lazy` calls found).
4. **Remove old chat components in the same PR** as adding assistant-ui components. No transition period where both exist.

**Phase assignment:** Phase 3 (Frontend Cleanup) -- tied to chat redesign

---

### MP-4: LCP/TTI Optimization Targets Wrong Bottleneck

**What goes wrong:**
You invest heavily in code splitting and bundle optimization but the 4.1s LCP is actually caused by waterfall API calls on page load, not bundle size. Or you optimize the dashboard page but the email list page (the most visited) is still slow.

**Why it happens:**
Common Next.js performance optimization mistakes:

1. **Optimizing dev mode, not production.** Dev mode is intentionally slower (hot reload, debugging). Always measure production builds.

2. **Optimizing bundle but not network.** If the page makes 5 sequential API calls before rendering (auth -> user -> folders -> emails -> unread counts), no amount of bundle splitting helps. The waterfall is the bottleneck.

3. **Over-using next/image.** Adding `next/image` everywhere can actually hurt performance via hydration overhead and CLS if dimensions are not specified.

4. **Barrel file imports.** If `import { something } from '@/components'` pulls in an index file that re-exports 100 components, tree-shaking may fail and load everything. The current `ai-elements/` exports pattern needs checking.

5. **Testing on fast networks.** LCP at <2.5s on gigabit is meaningless. Test on 4G throttled connections.

**Consequences:**
- Performance budget met in CI but not for real users
- Effort wasted on wrong optimizations
- LCP target missed despite significant work

**Prevention:**
1. **Profile first, optimize second.** Use Chrome DevTools Performance tab on a production build with 4G throttling. Identify the actual bottleneck (JS execution? Network? Layout shift?).
2. **Measure the right page.** The email list page, not the dashboard, is likely the most visited. Optimize that first.
3. **Prefetch API data.** Use Next.js `getServerSideProps` or React Server Components to start data fetching before the client JS loads.
4. **Set a performance budget in CI.** Use Lighthouse CI (already set up per v2.1 OPT-02) with real thresholds that block PRs.

**Phase assignment:** Phase 4 (Performance) -- after functional changes are stable

---

## Minor Pitfalls (Severity: ANNOYANCE/TECH DEBT)

### MiP-1: Test Infrastructure Bootstrap Cost

**What goes wrong:**
You need integration tests for the AI layer but there is no test infrastructure. Setting up mocks for Mistral API, conversation persistence, and tool execution takes longer than the actual feature work.

**Why it happens:**
The AI layer currently has only 3 test files (`hitl.service.spec.ts`, `action-executor.service.spec.ts`, `pii-integration.spec.ts`). None test the chat pipeline end-to-end. None mock LLM responses.

**Prevention:**
1. **Use AI SDK's `simulateReadableStream` or mock provider.** AI SDK v6 has testing utilities for mocking LLM responses without hitting real APIs.
2. **Build a shared test fixture factory.** Create a `createMockChatContext()` that provides all the services the chat pipeline needs, with sensible defaults.
3. **Test tools independently of the LLM.** Each tool's `execute` function is a pure function of its parameters. Test it directly with known inputs.
4. **Use recorded LLM responses for integration tests.** Record real Mistral responses once, replay them in tests. Framework: `nock` for HTTP interception or a custom provider that replays stored responses.

**Phase assignment:** Phase 1 (Test Foundation) -- build infrastructure first, write tests throughout

---

### MiP-2: Locale System Fragility During Tool Migration

**What goes wrong:**
Tool descriptions include locale-specific text (via `getToolTranslations(locale)` in every tool file). When migrating tools from VoltAgent `createTool` to AI SDK `tool()`, the locale wiring gets lost or the translations stop loading.

**Prevention:**
- Keep the locale system as-is during tool migration. Change only the tool wrapper, not the description content.
- Verify both `en` and `it` locales work after migration (MailAgent supports both).

**Phase assignment:** Phase 2 (Tool Migration)

---

### MiP-3: Prisma Schema Migration Coordination

**What goes wrong:**
The new conversation storage (replacing VoltAgent Memory tables) requires Prisma schema changes. If these migrations run before the application code is updated to use them, or after VoltAgent tables are dropped, there is a window where neither system works.

**Prevention:**
- Schema migration deploys BEFORE application code (add new tables first)
- Application code uses new tables but falls back to VoltAgent tables during transition
- VoltAgent tables are dropped LAST, only after data migration is verified

**Phase assignment:** Phase 1 (Backend Foundation)

---

## Integration Pitfalls (Cross-Cutting Concerns)

### IP-1: GDPR Compliance Regression

**What goes wrong:**
v3.1 just shipped GDPR compliance (PII tokenization, encryption at rest, audit logging, consent management). The AI rebuild touches the same code paths. If the PII detection interceptor, audit logging interceptor, or consent guards are bypassed by the new code paths, you have a compliance regression.

**Specific risks:**
- New `streamText()` call bypasses the PII detection that was wired into VoltAgent hooks
- New conversation storage bypasses encryption-at-rest annotations
- New tool execution bypasses audit logging interceptor
- New chat endpoints bypass `@RequireConsent('ai_analysis')` decorator

**Prevention:**
1. Create a compliance checklist: for EVERY new code path that handles user data, verify PII detection, encryption, audit logging, and consent checks are in place
2. Write a compliance integration test: "send a message containing PII -> verify it is tokenized before reaching LLM"
3. The PII detection service (`guards/pii-detection-sentinel.service.ts`) and prompt guard (`guards/prompt-guard-sentinel.service.ts`) must be wired into the new `streamText()` pipeline, not just VoltAgent hooks

**Phase assignment:** Every phase -- this is a cross-cutting concern

---

### IP-2: WebSocket/Realtime Event Compatibility

**What goes wrong:**
The HITL service emits WebSocket events via `RealtimeEventsService` (`realtimeEvents.emitAiActionCreated/Approved/Rejected/Executed`). The chat UI consumes these events. If the new chat frontend expects different event formats or connects via a different mechanism, HITL cards stop updating in real time.

**Prevention:**
- Document the current WebSocket event contract (event names, payload shapes)
- New chat frontend must subscribe to the same events with the same handlers
- Add an integration test: "approve HITL action -> verify WebSocket event fires -> verify UI updates"

**Phase assignment:** Phase 3 (Chat Frontend)

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| Memory migration | Data loss, conversation orphaning | Dual-read period, data export before migration |
| VoltAgent removal | 25+ import sites break simultaneously | Replace one import at a time, keep adapter shim |
| Tool format change | 19 files need mechanical changes | Script the `createTool` -> `tool()` conversion, test each |
| Tool consolidation | LLM behavior changes unpredictably | Freeze prompts, replay test queries, compare tool selection |
| Service merging | DI errors, subtle behavioral changes | Characterization tests first, one merge per PR |
| generateObject switch | Missing data in pre-fetched context | Audit tool calls per feature, compare output quality |
| Chat UI replacement | State management conflicts, CSS wars | Scope providers tightly, CSS isolation boundary |
| Bundle reduction | Adding more than removing | Dead code audit first, lazy load chat panel |
| LCP/TTI optimization | Wrong bottleneck targeted | Profile production build on 4G, waterfall analysis |
| Test infrastructure | Takes longer than expected | Build shared fixtures first, mock LLM with recorded responses |
| GDPR compliance | New code paths bypass protections | Compliance checklist per code path, integration tests |
| HITL integrity | Actions execute without approval | Safety net in tool result processing, integration test |

---

## Testing Strategy for AI Layer

### What to Test and How

| Layer | What to Test | How to Test | LLM Required? |
|---|---|---|---|
| Tool execution | Each tool's `execute()` with known inputs | Unit test, mock Prisma | No |
| Tool selection | LLM picks correct tool for a query | Recorded LLM response + assertion | Recorded |
| Chat pipeline | Request -> context -> response flow | Integration test, mock LLM provider | Mock |
| HITL flow | Tool returns action -> ActionQueue row created | Integration test, real Prisma | No |
| Streaming | Chunks arrive in order, tool results inline | Integration test, mock LLM stream | Mock |
| Memory | Conversation persists and loads correctly | Integration test, real Prisma | No |
| RAG retrieval | Query -> relevant results returned | Integration test, seeded embeddings | No |
| GDPR compliance | PII tokenized before LLM, audit logged | Integration test, real pipeline | Mock |

### Mock LLM Strategy

Use AI SDK v6's test utilities or build a `MockLanguageModel` that:
1. Returns predefined text for specific system prompts
2. Returns predefined tool calls for specific user messages
3. Supports streaming via `simulateReadableStream`
4. Records all calls for assertion

This avoids Mistral API costs in CI while testing the full pipeline.

---

## Sources

### AI SDK v6 Migration
- [AI SDK 6 Migration Guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0) -- Official breaking changes documentation
- [AI SDK 6 Blog Post](https://vercel.com/blog/ai-sdk-6) -- ToolLoopAgent, tool() changes
- [Vercel Chatbot SDK v6 Upgrade Issue](https://github.com/vercel/chatbot/issues/1366) -- Community migration pain points

### assistant-ui
- [assistant-ui v0.12 Migration](https://www.assistant-ui.com/docs/migrations/v0-12) -- State management rewrite
- [assistant-ui Runtime Docs](https://www.assistant-ui.com/docs/runtimes/pick-a-runtime) -- LocalRuntime vs ExternalStoreRuntime
- [ExternalStoreRuntime isRunning Bug](https://github.com/assistant-ui/assistant-ui/issues/2603) -- Known state bug
- [React 19 + Turbopack Issue](https://github.com/assistant-ui/assistant-ui/issues/2925) -- Runtime error in dev mode

### Tool Engineering
- [Lakera: Prompt Engineering Guide 2026](https://www.lakera.ai/blog/prompt-engineering-guide) -- Tool description best practices
- [Best Practices for LLM Tools 2025](https://techinfotech.tech.blog/2025/06/09/best-practices-to-build-llm-tools-in-2025/) -- Tool consolidation patterns

### Testing AI Systems
- [Scenario: Mocking External APIs in Agent Tests](https://langwatch.ai/scenario/testing-guides/mocks/) -- Tool function mocking with real LLM
- [Langfuse: Testing LLM Applications](https://langfuse.com/blog/2025-10-21-testing-llm-applications) -- Recorded response testing
- [Confident AI: LLM Testing 2026](https://www.confident-ai.com/blog/llm-testing-in-2024-top-methods-and-strategies) -- Evaluation frameworks

### Next.js Performance
- [Pagepro: Next.js Performance Optimization 2025](https://pagepro.co/blog/nextjs-performance-optimization-in-9-steps/) -- Common mistakes
- [QED42: Next.js Lighthouse Fixes](https://www.qed42.com/insights/next-js-performance-tuning-practical-fixes-for-better-lighthouse-scores) -- Practical tuning
- [Blazity: Expert Guide to Next.js Performance 2025](https://blazity.com/the-expert-guide-to-nextjs-performance-optimization) -- Bundle and waterfall optimization

### NestJS Refactoring
- [Nexumo: 7 NestJS Architecture Habits That Kill Refactors](https://medium.com/@Nexumo_/7-nestjs-architecture-habits-that-kill-refactors-aa2298d592e9) -- Module boundaries
- [NestJS Factory Method Pattern](https://michaelguay.dev/nestjs-factory-method-pattern/) -- Service consolidation patterns

### Brownfield Migration
- [IBM: Brownfield Application Modernization](https://www.ibm.com/think/insights/reimagining-brownfield-application-modernization) -- Migration strategies
- [D3 Framework for AI-Driven Productivity in Brownfield](https://arxiv.org/abs/2512.01155) -- Structured migration approach
