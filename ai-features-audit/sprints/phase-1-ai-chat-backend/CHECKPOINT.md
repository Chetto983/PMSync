# Sprint 02 Checkpoint — RAG Pipeline, Routing & Tools

| Field | Value |
|-------|-------|
| **Status** | COMPLETE |
| **Last Task** | T-0205 |
| **Next Task** | Sprint 03 (T-0301) |
| **Tasks Done** | 5/5 |
| **SP Done** | 13 |

## Findings Addressed

| Finding | Status | Notes |
|---------|--------|-------|
| CHAT-M1 | Fixed | AI_CHAT_CONTEXT_WINDOW env var (default 20). Summary trigger/retention aligned with window. |
| CHAT-M2 | Fixed | shouldSkipReranking() heuristic + explicit skipReranking option. Note: reranker is heuristic (<1ms), not LLM-based as audit claimed. |
| CHAT-M3 | Fixed | AI_GRAPH_MAX_DEPTH env var (default 2, hard cap 3). Traverse uses configured default. |
| CHAT-L1 | Fixed | saveUserMessage overlapped with graph context assembly (~5-20ms savings). |

## Last Modified Files

- `backend/src/modules/ai-chat/services/ai-chat.service.ts` — CHAT_CONTEXT_WINDOW constant, parallel save, error boundary wrapper
- `backend/src/modules/ai-chat/services/chat-enrichment.service.ts` — configurable CONTEXT_WINDOW for summary trigger
- `backend/src/modules/ai-chat/services/reranking.service.ts` — shouldSkipReranking() + skipReranking option
- `backend/src/modules/ai-chat/services/hybrid-search.service.ts` — pass-through skipReranking option
- `backend/src/modules/ai-chat/services/entity-graph.service.ts` — DEFAULT_GRAPH_MAX_DEPTH from env
- `backend/src/modules/ai-chat/utils/tool-error-boundary.ts` — NEW: centralized wrapToolsWithErrorBoundary()

## Key Decisions

1. **T-0201**: Memory eviction (summary generation + rolling window) already existed. Added configurability via env var only.
2. **T-0202**: Audit finding CHAT-M2 was inaccurate — reranker is pure heuristic (<1ms), not LLM-based. Added bypass anyway for explicit control.
3. **T-0204**: Graph context must complete before LLM call (injects into system prompt). Parallelized saveUserMessage instead.
4. **T-0205**: 32/45 tools lacked error boundaries. Centralized wrapper in createToolSet() rather than modifying 32 files individually.

## Validation Status

- Backend: `npx tsc --noEmit` PASS
- Frontend: no changes
