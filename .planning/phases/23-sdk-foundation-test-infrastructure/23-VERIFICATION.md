---
phase: 23-sdk-foundation-test-infrastructure
verified: 2026-02-27T15:30:00Z
status: gaps_found
score: 6/8 must-haves verified
re_verification: false
gaps:
  - truth: "MSW v2 test infrastructure can intercept and mock SSE streaming responses from the Mistral endpoint, enabling deterministic pipeline tests in CI"
    status: failed
    reason: "ROADMAP success criterion #3 and REQUIREMENTS.md TEST-01 both specify MSW v2 infrastructure. The phase explicitly deferred this and substituted real-API Vitest tests. No MSW package installed, no setupServer, no SSE handler code anywhere in the codebase. REQUIREMENTS.md TEST-01 is marked [x] Complete but the actual requirement text is not satisfied."
    artifacts:
      - path: "backend/package.json"
        issue: "msw package not installed (devDependencies)"
      - path: "backend/src/**/*msw*"
        issue: "No MSW handler files exist anywhere under src/"
    missing:
      - "Install msw@2.x as devDependency"
      - "Create backend/src/test/msw-handlers/mistral-chat.handler.ts -- SSE streaming mock for /v1/chat/completions"
      - "Create backend/src/test/msw-handlers/mistral-embed.handler.ts -- mock for /v1/embeddings"
      - "Create backend/src/test/setup.ts -- setupServer() with handlers, server.listen()/close() lifecycle"
      - "Wire setupFilesAfterEach in vitest.config.ts to activate handlers"
      - "At minimum one deterministic .test.ts using MSW to intercept and assert streaming response shape"

  - truth: "@mistralai/mistralai removed from package.json -- zero direct SDK dependency"
    status: partial
    reason: "The package IS removed from dependencies and devDependencies in package.json. However MSDK-03 in REQUIREMENTS.md covers this removal and is assigned to Phase 28 (Pending) in the tracking table -- indicating an inconsistency between what was done and how it was tracked. The removal itself is real and verified. The tracking table discrepancy is a documentation issue, not a code issue."
    artifacts:
      - path: "backend/package.json"
        issue: "Package correctly absent. Tracking table in REQUIREMENTS.md shows MSDK-03 as Phase 28 / Pending even though the removal already happened here in Phase 23."
    missing:
      - "Update REQUIREMENTS.md tracking table: MSDK-03 -> Phase 23 / Complete (package removal actually happened in this phase, not Phase 28)"
human_verification:
  - test: "Run vitest against real Mistral API"
    expected: "All 7 tests pass: embed (1024 dims), embedMany (3 results), generateText returns /4/, streamText produces chunks with 1 and 5, pgvector-compatible embedding, distinct cosine similarity, pgvector store/retrieve (when POSTGRES_URL set)"
    why_human: "Tests require live MISTRAL_API_KEY and optionally POSTGRES_URL. Cannot verify programmatically without executing the API calls."
---

# Phase 23: SDK Foundation & Test Infrastructure Verification Report

**Phase Goal:** All LLM calls route through a single SDK provider and test infrastructure exists for deterministic AI pipeline testing
**Verified:** 2026-02-27T15:30:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths

The ROADMAP.md defines 4 success criteria. Plans 01 and 02 also declare additional must-haves which are verified below.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every chat/completion call goes through @ai-sdk/mistral provider -- zero direct @mistralai/mistralai SDK usage | VERIFIED | grep confirms zero `from '@mistralai/mistralai'` import statements in backend/src/; MistralService uses generateText() with MistralProviderService.getChatModel(); MistralRagService same |
| 2 | All embedding generation uses AI SDK embed()/embedMany() via @ai-sdk/mistral -- BullMQ queues and pgvector storage still work | VERIFIED | mistral-embedding.service.ts:9 imports `embed, embedMany` from 'ai'; line 71 and 110 call them; MistralProviderService injected at line 21; dead provider files deleted |
| 3 | MSW v2 test infrastructure can intercept and mock SSE streaming responses | FAILED | No MSW package in package.json. No MSW handler files anywhere. Phase explicitly deferred this and delivered real-API tests instead. REQUIREMENTS.md TEST-01 definition is not met. |
| 4 | E2E gate: real Mistral API call through consolidated provider returns coherent response | VERIFIED (needs human run) | mistral-provider.test.ts exists with 4 real-API tests (embed, embedMany, generateText, streamText). embedding-pipeline.test.ts adds 3 more including pgvector store/retrieve. Tests are substantive and use real createMistral. Cannot execute without live API key. |
| 5 | VoltAgent directory deleted, @voltagent/core + @voltagent/postgres removed from package.json | VERIFIED | `ls backend/src/modules/ai/voltagent/` returns empty. package.json grep confirms @voltagent/core and @voltagent/postgres absent. 4 commits confirm the deletion (559bc2cf, f4387f5b). |
| 6 | @mistralai/mistralai removed from package.json | VERIFIED | package.json grep returns no match. @sentinelseed/voltagent correctly retained (different security package, not AI framework). |
| 7 | re-embed-all.ts enqueues emails via BullMQ (not direct Prisma writes), --dry-run parses JSONL | VERIFIED | File uses Queue from bullmq, QUEUE_NAMES.EMAIL_EMBEDDING, addBulk(); --dry-run flag skips queue creation; readline JSONL parsing implemented |
| 8 | re-embed-contacts.ts queries Contact records from Prisma, enqueues into ContactEmbeddingQueueService | VERIFIED | File uses PrismaClient.contact.findMany(), Queue with QUEUE_NAMES.CONTACT_EMBEDDING, addBulk(); --dry-run and --limit flags present |

**Score:** 6/8 truths verified (1 failed, 1 needs human execution)

---

## Required Artifacts

### Plan 01 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/modules/mistral/mistral.module.ts` | Global NestJS module exporting MistralProviderService | VERIFIED | @Global() + @Module() decorators present; providers + exports: [MistralProviderService]; 9 lines, no bloat |
| `backend/src/modules/mistral/mistral-provider.service.ts` | getChatModel() and getEmbeddingModel() methods | VERIFIED | Both methods exist; uses createMistral from @ai-sdk/mistral; ConfigService.getOrThrow for API key |
| `backend/src/modules/mistral/mistral-error.ts` | Typed error hierarchy | VERIFIED | 4 error classes: MistralRateLimitError, MistralAuthError, MistralTimeoutError, MistralModelNotFoundError; extends AiError |
| `backend/src/modules/ai/services/mistral-embedding.service.ts` | embed()/embedMany() calls | VERIFIED | Lines 71 and 110 call embed()/embedMany() with MistralProviderService.getEmbeddingModel() |

### Plan 02 Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/vitest.config.ts` | Vitest config with SWC plugin | VERIFIED | unplugin-swc plugin present; `src/**/*.test.ts` include pattern; testTimeout: 60_000; dotenv/config loaded |
| `backend/src/modules/mistral/__tests__/mistral-provider.test.ts` | Real-API tests with embed() | VERIFIED | 4 tests: embed 1024-dim, embedMany 3 results, generateText /4/, streamText chunks |
| `backend/src/modules/ai/services/__tests__/embedding-pipeline.test.ts` | Real-API pipeline test with cosine | VERIFIED | 3 tests: pgvector-compatible check, distinct cosine similarity (<0.8), pgvector store/retrieve via raw SQL |
| `backend/scripts/re-embed-all.ts` | BullMQ producer with EmailEmbeddingQueue | VERIFIED | Queue(QUEUE_NAMES.EMAIL_EMBEDDING), addBulk(batch), --dry-run, --limit, batch size 50 |
| `backend/scripts/re-embed-contacts.ts` | BullMQ producer with ContactEmbeddingQueue | VERIFIED | Queue(QUEUE_NAMES.CONTACT_EMBEDDING), PrismaClient.contact.findMany(), addBulk(batch) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| mistral-provider.service.ts | @ai-sdk/mistral createMistral | constructor | WIRED | Line 10: import createMistral; line 19: this.provider = createMistral({ apiKey }) |
| mistral-embedding.service.ts | mistral-provider.service.ts | DI + getEmbeddingModel() | WIRED | Line 10 import, line 21 constructor injection, line 72 getEmbeddingModel() call |
| mistral.service.ts | mistral-provider.service.ts | DI + getChatModel() | WIRED | Line 13 import, line 54 constructor injection, line 137/191 getChatModel() + generateText() |
| mistral-rag.service.ts | mistral-provider.service.ts | DI + getChatModel() | WIRED | Line 9 import, line 29 constructor injection |
| app.module.ts | mistral.module.ts | imports array | WIRED | Line 35: import MistralModule; line 65: MistralModule in imports array with @Global() comment |
| vitest.config.ts | src/**/*.test.ts | include pattern | WIRED | include: ['src/**/*.test.ts'] at line 9 |
| re-embed-all.ts | EmailEmbeddingQueue | BullMQ addBulk | WIRED | QUEUE_NAMES.EMAIL_EMBEDDING, queue.addBulk(batch) at lines 131, 149 |
| re-embed-contacts.ts | ContactEmbeddingQueue | BullMQ addBulk | WIRED | QUEUE_NAMES.CONTACT_EMBEDDING, queue.addBulk(batch) at lines 122, 140 |
| mistral-provider.test.ts | @ai-sdk/mistral createMistral | real API call | WIRED | createMistral at line 6, 4 describe() test blocks with real embed/generateText/streamText |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MSDK-01 | Plan 01 | All LLM chat/completion calls via @ai-sdk/mistral, no direct @mistralai/mistralai | SATISFIED | grep confirms zero import statements from '@mistralai/mistralai' in backend/src/; generateText() used in mistral.service.ts and mistral-rag.service.ts |
| MSDK-02 | Plan 01 | All embedding generation via AI SDK embed()/embedMany() | SATISFIED | mistral-embedding.service.ts uses embed()/embedMany() with provider model; dead provider abstraction deleted |
| TEST-01 | Plan 02 | MSW v2 infrastructure with SSE handlers for mocking LLM streaming responses | BLOCKED | REQUIREMENTS.md TEST-01 explicitly requires MSW v2. No MSW package installed, no handler files exist. Phase substituted real-API Vitest tests (valid and valuable) but the requirement as written is not met. Plan 02 reinterpreted TEST-01 as "real-API tests" -- CONTEXT.md authorized the deferral but REQUIREMENTS.md was not updated to reflect the changed scope. |

### Orphaned Requirements Check

Phase 23 in REQUIREMENTS.md tracking table lists: MSDK-01, MSDK-02, TEST-01. All three are claimed by plans. No orphaned requirements.

**Documentation inconsistency flagged (not a code gap):** MSDK-03 ("@mistralai/mistralai and @voltagent/core packages removed from dependencies") is tracked as Phase 28 / Pending in REQUIREMENTS.md but was actually completed in this phase. The tracking table needs updating.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `backend/src/modules/ai/services/batch-indexing.service.ts` | 8, 23, 34 | no-op stub with TODO comment | Warning | BatchIndexingService is intentionally stubbed; sync services depend on it; TODO says Phase 25+. This is a known deviation from Plan 01 (stubbed instead of deleted). It is a stub but it is intentional and documented, not accidental. Not a blocker for Phase 23 goal. |

No blocker anti-patterns found in core Phase 23 deliverables (MistralModule, provider service, tests, scripts).

---

## Human Verification Required

### 1. Vitest E2E Gate Execution

**Test:** Run `cd backend && npx vitest run --reporter=verbose` with MISTRAL_API_KEY set in .env
**Expected:** All 7 tests pass -- embed returns 1024-dim vector, embedMany returns 3 ordered results, generateText matches /4/, streamText produces chunks with "1" and "5", pgvector pipeline tests pass (pgvector store/retrieve test skips if POSTGRES_URL not set, which is acceptable)
**Why human:** Tests require live MISTRAL_API_KEY. Cannot verify test execution without real API credentials.

---

## Gaps Summary

**One genuine gap blocks TEST-01:** The ROADMAP.md and REQUIREMENTS.md both define TEST-01 as MSW v2 infrastructure with SSE handlers for deterministic mocking. The phase delivered real-API Vitest tests instead -- which are valuable and correct -- but the specified deliverable (MSW mocking layer) does not exist. CONTEXT.md documented the deferral decision, but the REQUIREMENTS.md tracking table was marked Complete ([x]) without actually delivering the MSW infrastructure. This is the only gap preventing status: passed.

**One documentation inconsistency:** MSDK-03 (package removal) is marked Phase 28 / Pending in REQUIREMENTS.md but was completed here. Update the tracking table.

**What is solid:** MistralModule, MistralProviderService, typed errors, AI SDK rewiring (generateText/embed/embedMany), VoltAgent deletion, old package removal, Vitest setup with SWC plugin, real-API tests with 4+3 test cases, both re-embed scripts as proper BullMQ producers, all git commits verified present. The core consolidation goal (MSDK-01, MSDK-02) is fully achieved.

---

_Verified: 2026-02-27T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
