# Requirements: MailAgent v3.2

**Defined:** 2026-02-27
**Core Value:** The best professional AI mail client -- fast, intelligent, and secure

## v3.2 Requirements

Requirements for AI Rebuild & Cleanup milestone. **Strategy: delete `voltagent/` (33K LOC), rewrite clean AI module from scratch with AI SDK v6 + assistant-ui.**

### Cross-Cutting: Real E2E Validation Gate

**Every phase MUST pass real E2E validation before proceeding to the next phase.** No phase is considered complete until:

1. **Real LLM calls** -- integration tests hit actual Mistral API (not mocked), validating the full pipeline end-to-end
2. **Quality validation** -- LLM responses are checked for correctness, not just "did it return 200"
3. **Phase gate** -- failing E2E blocks the next phase; no skipping ahead with TODO stubs
4. **MSW mocking is for unit/CI only** -- fast feedback during development, but the phase gate requires real calls

This applies to every phase that touches AI functionality (chat, tools, non-chat AI, RAG). Frontend-only and cleanup phases validate with Playwright E2E against a running backend with real LLM.

### New AI Module (AI-01 to AI-08)

- [ ] **AI-01**: Clean AI module with `AiChatService` using AI SDK v6 `streamText` + `pipeAgentUIStreamToResponse` -- single service handles chat orchestration, context building, and streaming
- [ ] **AI-02**: ~20 tools defined as AI SDK v6 `tool()` in `@Injectable()` ToolsService classes with NestJS DI -- no factory functions, no parameter threading
- [ ] **AI-03**: Intent-based tool routing serves 6-8 relevant tools per request (not all 20)
- [ ] **AI-04**: `ConversationService` with direct Prisma queries for chat history -- preserves existing conversation data
- [ ] **AI-05**: HITL approval for destructive actions via AI SDK v6 `needsApproval` + `onStepFinish` callback
- [ ] **AI-06**: PII tokenization, audit logging, and consent guards wired into new chat pipeline (GDPR compliance preserved)
- [ ] **AI-07**: Non-chat AI (daily briefing, follow-up detection, draft generation, email analysis) uses `generateText + Output.object()` -- single LLM call per operation, no agent loops
- [ ] **AI-08**: Rate limiting and circuit breaker preserved in new module

### Mistral SDK Consolidation (MSDK-01 to MSDK-03)

- [x] **MSDK-01**: All LLM chat/completion calls routed through `@ai-sdk/mistral` provider -- no direct `@mistralai/mistralai` SDK usage
- [x] **MSDK-02**: All embedding generation routed through AI SDK `embed()`/`embedMany()` via `@ai-sdk/mistral`
- [ ] **MSDK-03**: `@mistralai/mistralai` and `@voltagent/core` packages removed from dependencies

### RAG & Embeddings (RAG-01 to RAG-02)

- [ ] **RAG-01**: Embedding pipeline (BullMQ queues, KnowledgeBase, pgvector storage) preserved and rewired to new AI module -- existing embeddings data intact
- [ ] **RAG-02**: Hybrid search (vector + keyword with RRF fusion) preserved -- `UnifiedRetriever` logic survives in new module

### Chat Frontend (CHAT-01 to CHAT-05)

- [ ] **CHAT-01**: assistant-ui runtime wired with `useChatRuntime` + `AssistantChatTransport` pointing at new streaming endpoint
- [ ] **CHAT-02**: Thread, Composer, and Messages use assistant-ui primitives -- no custom MUI chat components
- [ ] **CHAT-03**: Domain tool renderers built with `makeAssistantToolUI` with running/complete/error states
- [ ] **CHAT-04**: HITL approval rendered inline via assistant-ui `requires_action` status
- [ ] **CHAT-05**: Mobile-responsive chat layout using assistant-ui responsive primitives

### Frontend Cleanup (FECLEAN-01 to FECLEAN-03)

- [ ] **FECLEAN-01**: Old ai-elements chat files deleted (assistant-ui replaces them)
- [ ] **FECLEAN-02**: Bundle analysis performed and largest offenders addressed
- [ ] **FECLEAN-03**: Dead components and orphaned files removed across entire frontend

### Testing (TEST-01 to TEST-04)

- [x] **TEST-01**: MSW v2 infrastructure with SSE handlers for mocking LLM streaming responses
- [ ] **TEST-02**: Integration tests for new AI chat pipeline (message -> tool execution -> streaming response)
- [ ] **TEST-03**: Integration tests for non-chat AI (briefing, follow-ups, drafts via generateText)
- [ ] **TEST-04**: Playwright E2E tests for assistant-ui chat frontend

### Modular Monolith Architecture (ARCH-01 to ARCH-04)

- [ ] **ARCH-01**: Clean module boundaries with explicit public interfaces -- each NestJS module exports a defined service contract, no cross-module internal imports
- [ ] **ARCH-02**: AI module decoupled from domain modules -- communicates via interfaces (EmailServiceInterface, CalendarServiceInterface) not direct imports
- [ ] **ARCH-03**: Memory profiling under 1000-user simulation -- identify and fix RAM bloat sources (unbounded caches, connection pools, large payloads in queues)
- [ ] **ARCH-04**: Lazy module loading for AI features -- AI module loaded on demand, not at startup for users who don't use AI chat

### Performance & Debt (PERF-01 to PERF-04)

- [ ] **PERF-01**: LCP reduced from 4.1s to <2.5s
- [ ] **PERF-02**: TTI reduced from 4.1s to <3.5s
- [ ] **PERF-03**: ENC-03 -- hash-based search indexes on encrypted fields (17+ query sites)
- [ ] **PERF-04**: 7 deferred bugs from v3.1 audit fixed

## Future Requirements (v3.3+)

### Deferred

- **CTX-01**: Contextual AI inline in email view
- **ART-01**: Artifact panel redesign
- **STREAM-01**: Advanced streaming array output via `elementStream`
- **ZK-01**: Zero-knowledge architecture

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mastra framework | Explicitly no NestJS support |
| VoltAgent (any version) | Removed -- AI SDK v6 replaces it entirely |
| Multi-agent orchestration | Single ToolLoopAgent is sufficient |
| Custom streaming infrastructure | assistant-ui handles natively |
| Vitest migration | Jest 30 already configured, cost > benefit |
| Direct @mistralai/mistralai SDK | Consolidated to @ai-sdk/mistral |
| Mobile app | Web-first, responsive |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MSDK-01 | Phase 23 | Complete |
| MSDK-02 | Phase 23 | Complete |
| TEST-01 | Phase 23 | Complete |
| AI-01 | Phase 24 | Pending |
| AI-04 | Phase 24 | Pending |
| AI-05 | Phase 24 | Pending |
| AI-06 | Phase 24 | Pending |
| AI-08 | Phase 24 | Pending |
| AI-02 | Phase 25 | Pending |
| AI-03 | Phase 25 | Pending |
| RAG-01 | Phase 25 | Pending |
| RAG-02 | Phase 25 | Pending |
| AI-07 | Phase 26 | Pending |
| TEST-02 | Phase 26 | Pending |
| TEST-03 | Phase 26 | Pending |
| CHAT-01 | Phase 27 | Pending |
| CHAT-02 | Phase 27 | Pending |
| CHAT-03 | Phase 27 | Pending |
| CHAT-04 | Phase 27 | Pending |
| CHAT-05 | Phase 27 | Pending |
| FECLEAN-01 | Phase 28 | Pending |
| FECLEAN-02 | Phase 28 | Pending |
| FECLEAN-03 | Phase 28 | Pending |
| MSDK-03 | Phase 28 | Pending |
| TEST-04 | Phase 28 | Pending |
| ARCH-01 | Phase 29 | Pending |
| ARCH-02 | Phase 29 | Pending |
| ARCH-03 | Phase 29 | Pending |
| ARCH-04 | Phase 29 | Pending |
| PERF-01 | Phase 30 | Pending |
| PERF-02 | Phase 30 | Pending |
| PERF-03 | Phase 30 | Pending |
| PERF-04 | Phase 30 | Pending |

**Coverage:**
- v3.2 requirements: 33 total
- Mapped to phases: 33/33
- Unmapped: 0

---
*Requirements defined: 2026-02-27*
*Last updated: 2026-02-27 -- all 33 requirements mapped to phases 23-30*
