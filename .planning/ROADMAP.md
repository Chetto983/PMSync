# Roadmap: MailAgent

## Milestones

- ✅ **v1.0 Stability & Code Quality** - Phases 1-5 (shipped 2026-02-02)
- ✅ **v2.0 Professional Email Client** - Phases 6-10 (shipped 2026-02-04)
- ✅ **v2.1 Optimization & Polish** - Phases 11-13 (shipped 2026-02-05)
- ✅ **v3.0 AI Intelligence & Scalability** - Phases 1-12 (shipped 2026-02-09)
- ✅ **v3.1 GDPR Compliance & Chatbot Enhancement** - Phases 13-22 (shipped 2026-02-27)
- 🚧 **v3.2 AI Rebuild & Cleanup** - Phases 23-30 (in progress)

## Phases

<details>
<summary>✅ v3.0 AI Intelligence & Scalability (Phases 1-12) - SHIPPED 2026-02-09</summary>

Phases 1-12: VoltAgent audit, modern chat UI, priority scoring, follow-ups refactor, nested labels, chat UI on mail, chat improvements, email tool triage, artifact renderers, UI review, AI module audit, test fixes. 12 phases, 42 plans, 19/19 requirements.

</details>

<details>
<summary>✅ v3.1 GDPR Compliance & Chatbot Enhancement (Phases 13-22) - SHIPPED 2026-02-27</summary>

Phases 13-22: PII tokenization, database encryption at rest, GDPR core compliance, data rights & legal, rich artifacts UI, AI triage & bulk ops, AI draft generation, GDPR guard mounting, triage prompt enrichment, bug audit. 10 phases, 31/32 requirements (ENC-03 deferred to v3.2).

</details>

---

## 🚧 v3.2 AI Rebuild & Cleanup (Phases 23-30)

**Milestone Goal:** Full rebuild of the AI layer -- drop VoltAgent (33K LOC, 167 files), rewrite clean AI module with AI SDK v6 + assistant-ui. Consolidate services, tools, and frontend. Fix accumulated debt.

**Strategy:** Parallel construction. Build new pipeline alongside old, verify with real LLM calls, then delete old code. Every AI phase passes a real E2E validation gate (actual Mistral API, not mocked) before the next phase begins.

**Phase Numbering:**
- Integer phases (23-30): Planned milestone work
- Decimal phases (e.g., 24.1): Urgent insertions if needed

- [x] **Phase 23: SDK Foundation & Test Infrastructure** - Route all LLM calls through @ai-sdk/mistral, set up MSW v2 SSE mocking, establish E2E validation gate (completed 2026-02-27)
- [ ] **Phase 24: Backend Core Pipeline** - New AiChatService with streamText, conversation history via Prisma, HITL via onStepFinish, GDPR guards, rate limiting
- [ ] **Phase 25: Tools & RAG** - ~20 tools as @Injectable ToolsService classes with AI SDK v6 tool(), intent routing, embedding pipeline and hybrid search preserved
- [ ] **Phase 26: Non-Chat AI & Backend Testing** - Briefing/follow-ups/drafts via generateText + Output.object(), integration tests for chat and non-chat pipelines
- [ ] **Phase 27: Chat Frontend** - assistant-ui runtime, Thread/Composer primitives, tool renderers via makeAssistantToolUI, HITL inline, mobile layout
- [ ] **Phase 28: Cleanup & VoltAgent Deletion** - Delete old ai-elements and voltagent code, remove @voltagent/* packages, bundle analysis, Playwright E2E
- [ ] **Phase 29: Architecture Hardening** - Module boundaries with explicit interfaces, AI module decoupled via service contracts, memory profiling, lazy loading
- [ ] **Phase 30: Performance & Debt** - LCP <2.5s, TTI <3.5s, ENC-03 hash indexes on encrypted fields, 7 deferred bugs from v3.1

## Phase Details

### Phase 23: SDK Foundation & Test Infrastructure
**Goal**: All LLM calls route through a single SDK provider and test infrastructure exists for deterministic AI pipeline testing
**Depends on**: Nothing (first v3.2 phase)
**Requirements**: MSDK-01, MSDK-02, TEST-01
**Success Criteria** (what must be TRUE):
  1. Every chat/completion call in the codebase goes through `@ai-sdk/mistral` provider -- zero direct `@mistralai/mistralai` SDK usage for LLM calls
  2. All embedding generation uses AI SDK `embed()`/`embedMany()` via `@ai-sdk/mistral` -- existing BullMQ queues and pgvector storage still work, existing embeddings remain queryable
  3. MSW v2 test infrastructure can intercept and mock SSE streaming responses from the Mistral endpoint, enabling deterministic pipeline tests in CI
  4. E2E validation gate: a real Mistral API call through the consolidated provider returns a coherent response (not mocked), validating the full SDK path end-to-end
**Plans**: 3 plans in 3 waves

Plans:
- [x] 23-01: MistralModule provider + SDK consolidation + embedding rewiring (wave 1)
- [x] 23-02: VoltAgent deletion + Vitest real-API tests + re-embed script + E2E gate (wave 2)
- [x] 23-03: MSW v2 SSE streaming handlers + deterministic test + MSDK-03 tracking fix (wave 3)

### Phase 24: Backend Core Pipeline
**Goal**: A new AiChatService handles chat orchestration end-to-end with conversation persistence, HITL safety, GDPR compliance, and rate limiting -- atomic replacement of old chat endpoint
**Depends on**: Phase 23
**Requirements**: AI-01, AI-04, AI-05, AI-06, AI-08
**Success Criteria** (what must be TRUE):
  1. New `POST /api/v1/ai/chat` endpoint replaces old chat handler and streams a coherent AI response via a 3-hop pipeline (Controller -> AiChatService -> streamText) -- old chat code deleted from AiController
  2. Conversation history loads from new AiConversation/AiMessage Prisma tables -- new conversations created, rolling summary for long histories
  3. Destructive tool calls (send, delete, move) create a pending HITL action via `onStepFinish` callback -- the action does NOT execute without user approval
  4. PII tokenization and audit logging are wired into the new pipeline -- a message containing PII is tokenized before reaching the LLM, and the interaction is audit-logged
  5. Rate limiting and circuit breaker reject requests when thresholds are exceeded, matching existing behavior
  6. E2E validation gate: send a real message through the new endpoint, verify streaming response, verify conversation persisted, verify HITL action created for a write tool call
**Plans**: 3 plans in 3 waves

Plans:
- [ ] 24-01: Prisma models, AiChatModule, ConversationService, AiChatService, streaming controller (wave 1)
- [ ] 24-02: HITL via needsApproval + ActionQueue, GDPR guards (PII, consent, audit), rate limiting, circuit breaker (wave 2)
- [ ] 24-03: E2E validation with real Mistral calls, old endpoint cleanup (wave 3)

### Phase 25: Tools & RAG
**Goal**: All chat tools defined as AI SDK v6 tool() in @Injectable ToolsService classes with NestJS DI, intent-based routing, and preserved RAG pipeline
**Depends on**: Phase 24
**Requirements**: AI-02, AI-03, RAG-01, RAG-02
**Success Criteria** (what must be TRUE):
  1. ~20 tools defined in ToolsService classes using AI SDK v6 `tool()` with NestJS DI via closures -- no factory functions, no parameter threading
  2. Intent routing serves 6-8 relevant tools per request based on query analysis, not all 20 every time
  3. Embedding pipeline (BullMQ queues, KnowledgeBase ingestion, pgvector storage) works end-to-end -- new emails get embedded, existing embeddings remain queryable
  4. Hybrid search (vector + keyword with RRF fusion) returns relevant results for both semantic and exact-match queries
  5. Duplicate tools eliminated (manage_email x2, bulk_email_actions x2) and overlapping tools merged (search_emails + semantic_search_emails)
  6. E2E validation gate: send a real query that triggers tool execution (e.g., "search my emails from John"), verify correct tool selected via intent routing, verify RAG results returned with relevant content
**Plans**: TBD

Plans:
- [ ] 25-01: ToolsService classes (email, calendar, contacts, folders, insights, memory, core)
- [ ] 25-02: Intent routing, tool consolidation, and duplicate elimination
- [ ] 25-03: RAG pipeline preservation and hybrid search verification

### Phase 26: Non-Chat AI & Backend Testing
**Goal**: Non-chat AI features use direct generateText calls instead of agent loops, domain services relocated to proper modules, and integration tests cover both chat and non-chat pipelines
**Depends on**: Phase 25
**Requirements**: AI-07, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):
  1. Daily briefing generates via single `generateText + Output.object()` call with pre-fetched data -- no agent loop, no tool calls during generation, output matches structured schema
  2. Follow-up detection and draft generation both use `generateText + Output.object()` with pre-fetched context -- output quality verified against existing agent loop output (50+ case comparison)
  3. Domain services relocated: CRM/relationship services -> contacts module, calendar conflict/focus/meeting-prep -> calendar module, with proper NestJS DI wiring
  4. Integration tests for chat pipeline: message -> tool execution -> streaming response, with MSW-mocked LLM responses
  5. Integration tests for non-chat AI: briefing generation, follow-up detection, draft generation, with MSW-mocked LLM responses
  6. E2E validation gate: generate a real daily briefing via Mistral, verify structured output matches schema and contains relevant data; send a real chat message requiring multi-step tool use, verify response quality
**Plans**: TBD

Plans:
- [ ] 26-01: Non-chat AI migration (briefing, follow-ups, drafts to generateText + Output.object)
- [ ] 26-02: Domain service relocation (CRM -> contacts, calendar services -> calendar)
- [ ] 26-03: Integration test suite for chat and non-chat AI pipelines

### Phase 27: Chat Frontend
**Goal**: AI chat UI rebuilt with assistant-ui primitives replacing all custom MUI chat components, with tool rendering, HITL inline, and mobile support
**Depends on**: Phase 26
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05
**Success Criteria** (what must be TRUE):
  1. assistant-ui runtime connects to new streaming endpoint via `useChatRuntime` + `AssistantChatTransport` -- chat messages stream token-by-token in real time
  2. Thread, Composer, and Messages use assistant-ui primitives -- auto-scroll, message editing, regeneration all work; no custom MUI chat components remain in the chat panel
  3. Domain tool renderers (email search, calendar, contacts, briefing, etc.) built with `makeAssistantToolUI` showing running/complete/error states -- tool results render as rich cards, not raw JSON
  4. HITL approval renders inline via assistant-ui `requires_action` status -- user can approve/reject destructive actions without leaving the chat
  5. Mobile-responsive chat layout works on 375px viewport with touch-friendly interactions -- verified at mobile, tablet, and desktop breakpoints
  6. E2E validation gate (Playwright against running backend with real LLM): send a message, verify streaming response renders, verify tool result card appears, verify HITL card shows for write action, verify mobile layout at 375px
**Plans**: TBD

Plans:
- [ ] 27-01: assistant-ui runtime setup (AiChatRuntime, transport, provider scoping, CSS isolation)
- [ ] 27-02: Thread, Composer, Messages with assistant-ui primitives
- [ ] 27-03: Tool renderers (makeAssistantToolUI) and HITL inline approval
- [ ] 27-04: Mobile layout and Playwright E2E smoke tests

### Phase 28: Cleanup & VoltAgent Deletion
**Goal**: All old VoltAgent code, unused ai-elements, and dead frontend components deleted; bundle size reduced; full Playwright E2E coverage
**Depends on**: Phase 27
**Requirements**: FECLEAN-01, FECLEAN-02, FECLEAN-03, MSDK-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. `npm ls @voltagent/core @voltagent/postgres @mistralai/mistralai` returns empty -- all three packages removed from dependencies
  2. Old ai-elements chat files deleted (~35 files that assistant-ui replaces) -- ChatArea, ChatMessages, ChatInput, useChatController, TypingIndicator, StreamingMessage, etc.
  3. Dead components and orphaned files removed across entire frontend -- verified by import tracing, no unused exports ship
  4. Bundle analysis performed and documented: main JS chunks sized, largest offenders identified, tree-shaking verified for ai-elements removal
  5. Playwright E2E test suite covers: full chat flow (send message -> tool execution -> HITL approval -> response), daily briefing widget, and mobile viewport
  6. `npm run type-check` and `npm run lint` pass with zero errors after all deletions
**Plans**: TBD

Plans:
- [ ] 28-01: VoltAgent deletion (packages, old controllers, tool factories, merged services)
- [ ] 28-02: Frontend cleanup (old ai-elements, dead components, orphan removal)
- [ ] 28-03: Bundle analysis and Playwright E2E test suite

### Phase 29: Architecture Hardening
**Goal**: Clean modular monolith with explicit interface contracts, validated memory efficiency, and lazy-loadable AI module
**Depends on**: Phase 28
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04
**Success Criteria** (what must be TRUE):
  1. Each NestJS module exports a defined service contract (TypeScript interface) -- no cross-module internal imports exist (verified by import path analysis)
  2. AI module communicates with domain modules via interfaces (EmailServiceInterface, CalendarServiceInterface, ContactsServiceInterface) -- not direct service class imports
  3. Memory profiling under simulated 1000-user load shows no unbounded cache growth, connection pool exhaustion, or large payload retention in BullMQ queues
  4. AI module loads lazily on demand -- application startup time measured with and without AI module shows measurable improvement; users who never open chat do not pay the AI module initialization cost
**Plans**: TBD

Plans:
- [ ] 29-01: Module boundary enforcement and interface contracts
- [ ] 29-02: Memory profiling and lazy loading

### Phase 30: Performance & Debt
**Goal**: Performance targets hit, encrypted field search works, and all v3.1 deferred bugs resolved
**Depends on**: Phase 29
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04
**Success Criteria** (what must be TRUE):
  1. Lighthouse LCP on email list page < 2.5s (production build, 4G throttled) -- down from 4.1s
  2. TTI on email list page < 3.5s (production build, 4G throttled) -- down from 4.1s
  3. ENC-03 hash-based search indexes implemented on all 17+ encrypted field query sites -- indexed lookups replace full-table scans
  4. All 7 deferred bugs from v3.1 audit resolved and verified (RC-A1/A8 race conditions and remaining BUG-REPORT items)
  5. Lighthouse CI budget gates enforced in CI pipeline, blocking PRs that regress LCP/TTI/CLS beyond thresholds
**Plans**: TBD

Plans:
- [ ] 30-01: LCP and TTI optimization (profiling, code splitting, waterfall elimination)
- [ ] 30-02: ENC-03 hash indexes on encrypted fields
- [ ] 30-03: Deferred bug fixes from v3.1 audit

## Progress

**Execution Order:**
Phases execute in numeric order: 23 -> 24 -> 25 -> 26 -> 27 -> 28 -> 29 -> 30

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 23. SDK Foundation & Test Infrastructure | 3/3 | Complete   | 2026-02-27 |
| 24. Backend Core Pipeline | 0/3 | Not started | - |
| 25. Tools & RAG | 0/3 | Not started | - |
| 26. Non-Chat AI & Backend Testing | 0/3 | Not started | - |
| 27. Chat Frontend | 0/4 | Not started | - |
| 28. Cleanup & VoltAgent Deletion | 0/3 | Not started | - |
| 29. Architecture Hardening | 0/2 | Not started | - |
| 30. Performance & Debt | 0/3 | Not started | - |

---
*Roadmap created: 2026-02-09*
*v3.2 phases added: 2026-02-27 -- 8 phases, 24 plans, 33 requirements mapped*
