---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: AI Rebuild & Cleanup
status: in_progress
last_updated: "2026-03-03T09:33:00Z"
progress:
  total_phases: 15
  completed_phases: 13
  total_plans: 50
  completed_plans: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** Phase 28 - Cleanup & VoltAgent Deletion

## Current Position

Phase: 28 of 30 (Cleanup & VoltAgent Deletion)
Plan: 2 of 3 complete in current phase
Status: Executing Phase 28
Last activity: 2026-03-03 -- Completed 28-02-PLAN.md (Voltagent cleanup + bundle analysis)

Progress: [########░░] 79% (19/24 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 19 (v3.2)
- Average duration: 11min
- Total execution time: 214min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 23-01 | 1 | 17min | 17min |
| 23-02 | 1 | 18min | 18min |
| 23-03 | 1 | 7min | 7min |
| 24-01 | 1 | 11min | 11min |
| 24-02 | 1 | 13min | 13min |
| 24-03 | 1 | 7min | 7min |
| 25-01 | 1 | 12min | 12min |
| 25-02 | 1 | 5min | 5min |
| 25-03 | 1 | 5min | 5min |
| 25-04 | 1 | 7min | 7min |
| Phase 26 P01 | 10min | 2 tasks | 6 files |
| Phase 26 P02 | 8min | 2 tasks | 8 files |
| Phase 26 P03 | 9min | 2 tasks | 10 files |
| Phase 27 P01 | 24min | 2 tasks | 16 files |
| Phase 27 P02 | 8min | 1 task | 9 files |
| Phase 27 P03 | 11min | 2 tasks | 9 files |
| Phase 27 P04 | 45min | 2 tasks | 40+ files |
| Phase 28 P01 | 8min | 2 tasks | 108 files |
| Phase 28 P02 | 13min | 2 tasks | 10 files |

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
- [28-02]: Voltagent E2E mock routes removed entirely (catch-all covers all unmocked endpoints)
- [28-02]: crm.ts and document-library.ts API paths migrated from /api/v1/voltagent/* to /api/v1/ai/*
- [28-02]: Tree-shaking confirmed: zero ai-elements code in production bundle before file deletion

### Pending Todos

None yet.

### Blockers/Concerns

- LCP/TTI at 4.1s (deferred from v2.1, target <2.5s/<3.5s in Phase 30)
- ENC-03 hash indexes deferred from v3.1 (17+ query sites, Phase 30)

## Session Continuity

Last session: 2026-03-03
Stopped at: Completed 28-02-PLAN.md
Resume file: .planning/phases/28-cleanup-voltagent-deletion/28-02-SUMMARY.md
Next action: Execute 28-03-PLAN.md
