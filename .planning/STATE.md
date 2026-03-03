---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Enterprise Stabilization
status: defining_requirements
last_updated: "2026-03-03T12:00:00.000Z"
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** Defining v4.0 requirements

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-03 — Milestone v4.0 started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (v4.0)
- Previous milestone (v3.2): 20 plans, 227min total, 11min avg

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v3.2]: Drop VoltAgent for raw AI SDK v6 (framework weight without proportional value)
- [v3.2]: Mastra rejected (no NestJS support)
- [v3.2]: generateText + Output.object() for non-chat AI (faster, cheaper than agent loops)
- [v3.2]: Parallel construction strategy (new pipeline alongside old, zero breakage)
- [23-01]: AI SDK maxOutputTokens replaces maxTokens (API change in ai@6.x)
- [23-01]: BatchIndexingService stubbed to no-op (sync services depend on it, Batch API removed)
- [23-01]: EmbeddingModel type is not generic in ai@6.0.77 (union type, not EmbeddingModel<string>)
- [23-01]: GdprService MistralAgentCleanup dependency removed (agents no longer used)
- [23-02]: Extracted locales from voltagent/ to ai/locales/ (shared by 6+ services)
- [23-02]: Stubbed deleted VoltAgent services with @Optional/@Inject string tokens
- [23-02]: dotenv/config in vitest.config.ts for env var loading
- [23-02]: Deterministic math test for generateText (LLMs unreliable for exact text matching)
- [23-02]: @sentinelseed/voltagent retained (separate security package from @voltagent/core)
- [23-03]: Per-test MSW lifecycle (not global setupFiles) to avoid intercepting real-API tests
- [23-03]: AI SDK v6 uses inputTokens/outputTokens not promptTokens/completionTokens
- [24-01]: AI SDK v6 uses ModelMessage (not CoreMessage) -- CoreMessage removed in v5
- [24-01]: createUIMessageStream wrapping streamText with writer.merge() for NestJS streaming
- [24-01]: Rolling summary + last 10 messages verbatim for conversation context management
- [24-02]: CircuitBreaker uses isAllowed() not shouldAllowRequest() -- actual API method name
- [24-02]: AI SDK v6 Tool uses inputSchema (not parameters) and TypedToolCall uses input (not args)
- [24-02]: PiiDetectionService/PiiResolutionService registered directly in AiChatModule (not in AiModule)
- [24-02]: createToolSet() closure pattern for PII resolution -- tools get resolved args without threading
- [24-02]: data-needs-approval chunk type for HITL stream events via writer type assertion
- [24-03]: Direct service instantiation over NestJS TestingModule for tests (avoids Redis+Postgres bootstrap)
- [24-03]: createPrismaClient() factory in tests (Prisma 7 adapter pattern, not raw constructor)
- [24-03]: ChatDto/ChatResponseDto dead code removed from ai.dto.ts
- [25-01]: delete_event maps to SCHEDULE_MEETING ActionType (DELETE_EVENT not in enum yet)
- [25-01]: FolderToolsService uses Prisma directly (EmailFolderService is query-builder utility)
- [25-01]: save_memory userId set to tenantId as placeholder (Phase 26)
- [25-01]: 5 needsApproval flags not 6 (no delete_contact tool per ContactToolsService spec)
- [25-02]: prepareStep activeTools uses keyof typeof tools cast (AI SDK expects literal union)
- [25-02]: Memory retrieval non-blocking (errors logged, empty returned, chat continues)
- [25-02]: LLM fallback uses mistral-small-latest with maxOutputTokens: 30 (cheapest)
- [25-02]: Tool expansion always includes save_memory in follow-up steps
- [25-03]: Contact table is unified_contacts (not contacts) per Prisma @@map directive
- [25-03]: CalendarEvent uses startTime/endTime (not startDate/endDate) per actual schema
- [25-03]: Calendar FTS-only search (no embeddings) per research recommendation
- [25-03]: HybridSearchService graceful fallback: empty results on missing SQL functions
- [25-04]: Direct service instantiation for E2E tests (consistent with Phase 24 pattern)
- [25-04]: IntentClassifierService regex fallback in tests (no FastText model needed)
- [25-04]: drainStream must type-check chunks (AI SDK createUIMessageStream emits strings)
- [25-04]: HybridSearchService tested via direct call for graceful fallback verification
- [26-01]: MistralModule is @Global -- no explicit import needed in AiModule for MistralProviderService
- [26-01]: AI SDK v6 LanguageModelUsage uses inputTokens/outputTokens -- trackUsage simplified to counter-only
- [26-01]: Frontend routes batch-migrated from /api/v1/voltagent/* to /api/v1/ai/* (90 occurrences)
- [26-01]: .nullable() not .optional() in Output.object() Zod schemas per AI SDK v6 compatibility
- [26-02]: Contact emails are JSONB (Array<{value}>) -- raw SQL with jsonb_array_elements for lookups
- [26-02]: MeetingPrepService stays pure-data; LLM summarization deferred to AI module BriefingService
- [26-02]: Batch email indexing for scoring (single query for all contact emails, then in-memory grouping)
- [26-03]: createGenerateHandler matches system prompt keywords to fixtures (not URL path or model name)
- [26-03]: ConversationService mock: getOrCreateConversation, saveUserMessage, getMessagesForContext (not getOrCreate/addMessage/getHistory)
- [26-03]: 50 comparison cases procedurally generated (20 briefing + 20 follow-up + 10 draft) to avoid filesystem bloat
- [27-01]: Module-scoped CSRF cache in ChatRuntimeProvider (avoids React Compiler ref-in-render lint error)
- [27-01]: prepareSendMessagesRequest transforms AI SDK messages to { message, conversationId } for backend ChatRequestDto
- [27-01]: MarkdownTextPrimitive cast to any for Text slot (runtime compatible, type signature mismatch)
- [27-01]: ChainOfThought component slot replaces separate Reasoning+tools in MessagePrimitive.Content
- [27-01]: ThreadListPrimitive with runtime-managed thread list (backend conversation hydration deferred)
- [27-02]: Barrel export index.tsx not index.ts (JSX fragments require .tsx extension)
- [27-02]: Operator precedence parenthesization for ?? vs || coalescing in ContactToolUI
- [27-03]: addResult typed as any in HitlApprovalCardFromStatus (generic erasure at component boundary)
- [27-03]: Poll-based HITL is the functional mechanism; native requires_action code path gated on backend update
- [27-03]: FallbackToolUI uses wildcard toolName '*' for catch-all matching
- [27-03]: HitlPendingActions rendered unconditionally in AssistantMessage
- [27-04]: CSS split into 3 files (layout/sidebar/thread) to stay under 500-line limit
- [27-04]: CSS variable design system with --chat-* tokens for light/dark mode theming
- [27-04]: CSS-only responsive switching (hidden md:flex / flex md:hidden), no JS breakpoint detection
- [27-04]: ChatPage skeleton loading guard prevents flash of unstyled content
- [28-01]: components/ai/index.ts barrel kept with only CommandPalette export (direct subdirectory imports preferred)
- [28-01]: Self-contained chat/types.ts owns all tool output types directly (no cross-directory re-exports)
- [28-01]: ai-elements npm package left in package.json for 28-02 bundle analysis scope
- [28-03]: AI SDK v6 DefaultChatTransport uses SSE format (text/event-stream), not old Data Stream prefix codes (0:, 9:, a:, d:)
- [28-03]: Desktop thread scoping for E2E tests (dual-layout renders both in DOM, scope to visible container)
- [28-03]: dispatchEvent('click') for CSS-transformed sidebar elements (bypasses viewport/pointer checks)
- [28-02]: Voltagent E2E mock routes removed entirely (catch-all covers all unmocked endpoints)
- [28-02]: crm.ts and document-library.ts API paths migrated from /api/v1/voltagent/* to /api/v1/ai/*
- [28-02]: Tree-shaking confirmed: zero ai-elements code in production bundle before file deletion

### Pending Todos

None yet.

### Blockers/Concerns

- LCP/TTI at 4.1s (deferred since v2.1, target <2.5s/<3.5s)
- ENC-03 hash indexes deferred since v3.1 (17+ query sites)
- 15 circular dependencies identified in Enterprise Platform PRD audit
- Enterprise readiness score: 58/100 (PRD baseline)

## Session Continuity

Last session: 2026-03-03
Stopped at: v4.0 milestone initialization
Resume file: —
Next action: Define v4.0 requirements and create roadmap
