---
phase: 11
plan: 01
subsystem: ai-module
tags: [dead-code, cleanup, npm, nestjs-providers]
requires: []
provides:
  - "Leaner AI module with zero dead exports"
  - "2 unused npm packages removed"
  - "2 dead NestJS providers removed"
affects:
  - "11-02 (file splitting depends on cleaner codebase)"
  - "11-03 (test coverage now targets fewer files)"
tech-stack:
  removed:
    - "@anthropic-ai/sdk"
    - "@voltagent/logger"
key-files:
  deleted:
    - "backend/src/modules/ai/services/feedback-queue.service.ts"
    - "backend/src/modules/ai/nlp/embedding-intent-classifier.service.ts"
    - "backend/src/modules/ai/nlp/intent-augmentation.ts"
    - "backend/src/modules/ai/voltagent/memory/index.ts"
    - "backend/src/modules/ai/voltagent/memory/working-memory.config.ts"
  modified:
    - "backend/src/modules/ai/voltagent/agents/supervisor.agent.ts"
    - "backend/src/modules/ai/voltagent/agents/index.ts"
    - "backend/src/modules/ai/ai.module.ts"
    - "backend/src/modules/ai/nlp/index.ts"
    - "backend/src/modules/ai/voltagent/tools/index.ts"
    - "backend/src/modules/ai/voltagent/tools/web-search.tools.ts"
    - "backend/src/modules/ai/voltagent/tools/analytics.tools.ts"
    - "backend/src/modules/ai/voltagent/tools/document-library.tools.ts"
    - "backend/src/modules/ai/voltagent/services/relationship-intelligence.service.ts"
    - "backend/src/modules/ai/services/email-insights.service.ts"
    - "backend/src/modules/ai/voltagent/services/index.ts"
    - "backend/package.json"
key-decisions:
  - decision: "Keep supervisor.agent.ts filename despite content change"
    rationale: "4+ consumers import from this path; renaming would cause import churn with no functional benefit"
  - decision: "Delete FeedbackQueueService despite OnModuleInit"
    rationale: "Self-creates BullMQ queue on startup but no service or controller ever injects or calls its methods; wastes Redis resources on every boot"
  - decision: "Delete EmbeddingIntentClassifierService despite OnModuleInit"
    rationale: "Pre-computes Mistral embeddings on startup but no service ever queries them; wastes API credits on every boot"
duration: "~15 minutes"
completed: "2026-02-08"
---

# Phase 11 Plan 01: Dead Code Removal Summary

**One-liner:** Deleted 1,618 lines of dead code (unused functions, files, NestJS providers) and removed 2 unused npm packages from the AI module.

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~15 minutes |
| Start | 2026-02-08T09:00:13Z |
| End | 2026-02-08T09:14:45Z |
| Tasks | 2/2 |
| Files deleted | 5 |
| Files modified | 12 |
| Lines removed | 1,618 |
| npm packages removed | 2 |

## Accomplishments

### Task 1: Delete dead files, functions, and stale comments
- Refactored `supervisor.agent.ts` from 332 to 223 lines by deleting `createSupervisorAgent()`, `SupervisorAgentOptions`, and 12 now-unused imports
- Deleted `memory/` directory (empty barrel + unused working memory config)
- Deleted `nlp/intent-augmentation.ts` (258 lines of unused Italian paraphrase augmentation utilities)
- Deleted deprecated `classifyContactRole()` wrapper from relationship intelligence service
- Deleted 6 unused `clear*Cache`/`clear*AgentPool` functions from web-search, analytics, and document-library tool files
- Removed stale comments referencing deleted services (PersonalizationService, PromptRegistryService, ModelRouterService)
- Retained and verified: `buildDynamicInstructions`, `UserContext`, `ConnectedProvider`, `formatCurrentDateTime` -- all 4 consumers still import successfully

### Task 2: Remove dead NestJS providers and unused npm packages
- Deleted `FeedbackQueueService` (689 lines) -- registered in AiModule but never injected by any service or controller
- Deleted `EmbeddingIntentClassifierService` (~238 lines) -- pre-computed embeddings on startup that no service ever queried
- Removed both from `ai.module.ts` providers and exports arrays
- Uninstalled `@anthropic-ai/sdk` (zero imports across entire backend)
- Uninstalled `@voltagent/logger` (zero imports across entire backend)
- Verified `LearningService` chain (via `observability/learning.ts`) is completely independent of `FeedbackQueueService`

## Task Commits

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Delete dead files, functions, stale comments | d48fac1f | -452 lines across 13 files |
| 2 | Remove dead NestJS providers + npm packages | 69ce82bd | -689 + -238 lines, 2 npm packages |

## Verification Results

- TypeScript type-check: PASS
- Backend build (`nest build`): PASS
- No broken imports: verified via grep for all deleted symbols
- `buildDynamicInstructions` / `UserContext` / `ConnectedProvider` still exported and consumed by: `unified.agent.ts`, `agent-pool.service.ts`, `chat-prepare.service.ts`
- `LearningService` -> `HitlService` chain unbroken (uses `observability/learning.ts`, not `FeedbackQueueService`)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Keep `supervisor.agent.ts` filename | 4+ consumers import from this path; renaming = churn with no benefit |
| Delete `FeedbackQueueService` despite `OnModuleInit` | Creates BullMQ queue nobody uses; wastes Redis resources |
| Delete `EmbeddingIntentClassifierService` despite `OnModuleInit` | Pre-computes Mistral embeddings nobody queries; wastes API credits |
| Remove `@anthropic-ai/sdk` | Zero imports; no Anthropic integration exists or is planned |
| Remove `@voltagent/logger` | Zero imports; native NestJS Logger used throughout |

## Deviations from Plan

### Minor: Pre-staged files in Task 2 commit

The Task 2 commit (`69ce82bd`) inadvertently included a few pre-staged planning files (`STATE.md`, `10-04-SUMMARY.md`, `ChatInput.tsx`, `MentionInput.tsx`) that were already in the git staging area from prior work. These are unrelated to the dead code removal and do not affect correctness. All Task 2 specific deletions and modifications are correctly included.

## Issues Encountered

None. All deletions were clean with no cascading breakage.

## Next Phase Readiness

Plan 11-01 is complete. The AI module is now ~1,618 lines leaner:
- 5 dead files deleted
- 2 dead NestJS providers removed (saving startup time and Redis/API resources)
- 2 unused npm packages removed
- All stale comments cleaned

Ready for 11-02 (file splitting for 500-line violations).
