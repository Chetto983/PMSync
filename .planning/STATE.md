---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: AI Rebuild & Cleanup
status: unknown
last_updated: "2026-03-02T12:51:29.274Z"
progress:
  total_phases: 13
  completed_phases: 10
  total_plans: 43
  completed_plans: 40
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-27)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** Phase 25 - Tools & RAG (IN PROGRESS)

## Current Position

Phase: 25 of 30 (Tools & RAG)
Plan: 2 of 4 complete in current phase
Status: In Progress
Last activity: 2026-03-02 -- Completed 25-02-PLAN.md (Intent Routing & Memory)

Progress: [####░░░░░░] 33% (8/24 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 8 (v3.2)
- Average duration: 11min
- Total execution time: 90min

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

### Pending Todos

None yet.

### Blockers/Concerns

- LCP/TTI at 4.1s (deferred from v2.1, target <2.5s/<3.5s in Phase 30)
- ENC-03 hash indexes deferred from v3.1 (17+ query sites, Phase 30)

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 25-02-PLAN.md (Intent Routing & Memory) -- Phase 25 plan 2 of 4 done
Resume file: None
Next action: Execute 25-03-PLAN.md
