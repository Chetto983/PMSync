---
phase: 110-wire-entity-anchored-memory-retrieval
verified: 2026-03-25T16:45:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 110: Wire Entity-Anchored Memory Retrieval — Verification Report

**Phase Goal:** Entity-anchored memories from getMemoriesByEntity() are actually used in AI chat responses after graph traversal, closing the GRAG-04 integration gap
**Verified:** 2026-03-25T16:45:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Graph traversal results carry externalId so entity IDs can be extracted | ✓ VERIFIED | `GraphTraversalResult` interface line 23: `externalId?: string | null`; CTE base case line 90, recursive case line 106, final SELECT line 122 all select `"externalId"` |
| 2   | Batch entity memory retrieval fetches memories by contactId/emailId in a single query | ✓ VERIFIED | `getMemoriesByEntities()` at memory.service.ts:188 uses single `prisma.aIMemory.findMany` with `OR: [{ contactId: { in: ... } }, { emailId: { in: ... } }]` |
| 3   | Entity-anchored memories are merged with vector memories before context assembly | ✓ VERIFIED | ai-chat.service.ts lines 276-288: `mergedMemories` built from entity memories + vector memories, then passed to `contextAssemblyService.assemble()` at line 285-289 |
| 4   | Entity-anchored memories get priority over vector memories in merge order | ✓ VERIFIED | Entity memories iterated first (lines 278-280), vector memories appended second (lines 281-283); dedup Set ensures entity memories are kept when ID collision occurs |
| 5   | Duplicate memories are deduplicated by ID | ✓ VERIFIED | `seenIds = new Set<string>()` at line 276; both loops guard `if (m.id && !seenIds.has(m.id))` before pushing |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `backend/src/modules/ai-chat/services/entity-graph.service.ts` | GraphTraversalResult with externalId field, traverse CTE selecting externalId | ✓ VERIFIED | externalId in interface (line 23) and all 3 CTE SELECT positions (lines 90, 106, 122) |
| `backend/src/modules/ai-chat/services/memory.service.ts` | getMemoriesByEntities batch method | ✓ VERIFIED | Method at line 188, guards empty arrays, single findMany with OR, returns MemoryResult[] |
| `backend/src/modules/ai-chat/services/ai-chat.service.ts` | Entity memory wiring in prepareChatAgent after graph traversal | ✓ VERIFIED | Phase 110 block at lines 262-289: extract IDs, call getMemoriesByEntities, merge, pass to assemble |
| `backend/src/modules/ai-chat/services/entity-graph.service.spec.ts` | Test for externalId in traverse results | ✓ VERIFIED | Test "should include externalId in traversal results" at spec lines 130-155; 12/12 tests pass |
| `backend/src/modules/ai-chat/services/memory.service.spec.ts` | describe block getMemoriesByEntities with 4 tests | ✓ VERIFIED | describe('getMemoriesByEntities') at spec lines 98-158 with 4 test cases; 11/11 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `entity-graph.service.ts traverse()` | `ai-chat.service.ts prepareChatAgent()` | `node.externalId` on GraphTraversalResult | ✓ WIRED | Lines 266-269: `if (node.externalId)` branch extracts contactIds/emailIds from traversal results |
| `ai-chat.service.ts prepareChatAgent()` | `memory.service.ts getMemoriesByEntities()` | extracted contactIds/emailIds from graph results | ✓ WIRED | Line 273: `this.memoryService.getMemoriesByEntities(tenantId, userId, contactIds, emailIds, 10)` |
| `memory.service.ts getMemoriesByEntities()` | `context-assembly.service.ts assemble()` | merged memory array passed to assemble() | ✓ WIRED | Line 285-288: `this.contextAssemblyService.assemble(graphResults, mergedMemories.length > 0 ? mergedMemories : memories, fewShotExamples)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `memory.service.ts getMemoriesByEntities()` | `memories` (return value) | `prisma.aIMemory.findMany` with FK OR conditions | Yes — real DB query with tenantId + userId + OR contactId/emailId | ✓ FLOWING |
| `ai-chat.service.ts prepareChatAgent()` | `mergedMemories` | entityMemories (FK lookup) + memories (vector search), dedup by ID | Yes — both sources are real DB queries | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| TypeScript compiles clean | `npx tsc --noEmit` | No output (exit 0) | ✓ PASS |
| entity-graph.service.spec tests | `npx jest --testPathPatterns="entity-graph.service.spec"` | 12/12 tests pass | ✓ PASS |
| memory.service.spec tests | `npx jest --testPathPatterns="memory.service.spec"` | 11/11 tests pass | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| GRAG-04 | 110-01-PLAN.md | Entity-anchored memories are retrievable by direct entity lookup (not just semantic search) | ✓ SATISFIED | `getMemoriesByEntities()` does direct FK lookup; `getMemoriesByEntity()` (single entity) also exists; both wired into chat pipeline via entity-first merge |

**Orphaned requirements check:** REQUIREMENTS.md traceability table maps GRAG-04 to Phase 110. No other phase-110 requirements exist. No orphans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| None | — | — | — | — |

No anti-patterns found. The entity memory fetch and merge are guarded by the existing `if (this.entityGraphService && this.contextAssemblyService)` check (Phase 109 block), so the path is non-blocking by design. The fallback at lines 309-314 preserves pre-Phase-109 behavior when graph services are absent.

### Human Verification Required

None. All observable truths are verifiable from the codebase structure and test results.

The one truth that cannot be fully automated — "What do I remember about [contact]? returns entity-specific memories, not just semantic search hits" (ROADMAP Success Criterion 3 for Phase 110) — depends on runtime data (graph nodes with externalId populated, AIMemory records with contactId set). The code wiring that enables this is verified. The runtime behavior requires a production smoke test with real data.

#### Optional Production Smoke Test

**Test:** In the live app, with at least one AIMemory record anchored to a contact (contactId set), send the chat message "What do I remember about [contact name]?" and inspect the system prompt injected into the LLM (visible in backend logs with `[DIAG]` prefix or via AiRunLedger context tokens).

**Expected:** The system prompt's memory section includes the entity-anchored memory content, not just the vector-similarity top-5.

**Why human:** Requires production data (seeded AIMemory with contactId + GraphNode with matching externalId) and live LLM request inspection.

### Gaps Summary

No gaps. All 5 must-have truths are verified at all levels (exists, substantive, wired, data-flowing). The 3 key links are wired. GRAG-04 requirement is satisfied. Both spec suites pass. TypeScript compiles clean.

---

_Verified: 2026-03-25T16:45:00Z_
_Verifier: Claude (gsd-verifier)_
