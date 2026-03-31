# Sprint 02 — RAG Pipeline, Routing & Tools

| Campo | Valore |
|-------|--------|
| **Phase** | 1 — AI Chat Backend |
| **Sprint** | 02 |
| **SP** | 13 |
| **Objective** | Add memory eviction, optimize reranking bypass, make entity graph configurable, parallelize enrichment |
| **Addresses** | CHAT-M1, CHAT-M2, CHAT-M3, CHAT-L1 |

---

## Sprint Backlog

### T-0201: Implement sliding window memory eviction [3 SP]
- [ ] Read `ai-chat/memory.service.ts` — understand current memory model
- [ ] Add max conversation context window (configurable, default 20 messages)
- [ ] Implement summarization of evicted messages (lightweight LLM call)
- [ ] Store summary as system message in conversation history
- [ ] Addresses: **CHAT-M1**

### T-0202: Add reranking bypass for simple keyword queries [3 SP]
- [ ] Read `ai-chat/reranking.service.ts` — trace when reranking is triggered
- [ ] Add heuristic: if query is < 5 tokens and matches exact keyword, skip reranking
- [ ] Add `skipReranking` flag to search options for explicit control
- [ ] Measure latency improvement with bypass (log to AiRunLedger)
- [ ] Addresses: **CHAT-M2**

### T-0203: Make entity graph traversal depth configurable [2 SP]
- [ ] Read `ai-chat/entity-graph.service.ts` — locate depth constant
- [ ] Extract to config: `AI_GRAPH_MAX_DEPTH` env var (default 2)
- [ ] Add depth param to graph traversal methods
- [ ] Addresses: **CHAT-M3**

### T-0204: Parallelize chat enrichment with main LLM call [3 SP]
- [ ] Read `ai-chat/chat-enrichment.service.ts` — trace call timing
- [ ] Refactor to run enrichment `Promise.all()` with initial LLM call
- [ ] Ensure enrichment results are injected into context assembly, not blocking response
- [ ] Measure first-token-time improvement
- [ ] Addresses: **CHAT-L1**

### T-0205: Verify all registered tools have error boundaries [2 SP]
- [ ] Read `ai-chat/tools/` — all 6 tool services
- [ ] Verify each tool catches errors and returns structured error response (not throwing)
- [ ] Add try/catch wrapper to any tools that throw raw errors
- [ ] Test: simulate tool failure, verify chat continues gracefully

---

## Dependencies

- S01 must be complete (conversation pagination affects message loading)

## Risks

1. **T-0201 memory eviction** — Summarization LLM call adds latency. Must be async / fire-and-forget.
2. **T-0204 parallelization** — Race condition if enrichment modifies shared state.

## Definition of Done

- [ ] Memory eviction keeps last 20 messages + summary of older context
- [ ] Simple queries bypass reranking (measurable latency improvement)
- [ ] Entity graph depth configurable via env var
- [ ] Chat enrichment runs in parallel — faster first-token time
- [ ] All tools have error boundaries — no unhandled throws
- [ ] `npx tsc --noEmit` passes on both backend and frontend
