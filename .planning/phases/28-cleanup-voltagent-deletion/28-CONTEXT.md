# Phase 28: Cleanup & VoltAgent Deletion - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Delete all old VoltAgent code, unused ai-elements, and dead frontend components. Verify bundle reduction. Add Playwright E2E coverage for the new AI chat. The VoltAgent backend directory and packages are already removed (Phase 23). This phase focuses on frontend cleanup, dead code removal, bundle analysis, and E2E test coverage.

</domain>

<decisions>
## Implementation Decisions

### ai-elements Deletion Scope
- Delete the entire `frontend/src/components/ai-elements/` directory (69 files) in one clean cut
- No selective audit — all 69 files are dead code replaced by assistant-ui components in `components/chat/`
- `chat/types.ts` imports `ToolRendererResult` from `ai-elements/tool-renderers/types` — inline this type directly into `chat/types.ts` before deletion
- Full dead-code sweep across entire frontend/src after ai-elements deletion — use import tracing to find all unreferenced components, hooks, and utilities
- Clean all `voltagent` references from frontend code files, swagger.json, and comments

### @mistralai/mistralai & VoltAgent Packages
- MSDK-03 already satisfied — `@voltagent/core`, `@voltagent/postgres`, and `@mistralai/mistralai` packages are already removed from dependencies
- Only comment references remain in 3 backend files (ai.module.ts, mistral.service.ts, mistral-rag.service.ts) — leave as migration history
- `@sentinelseed/voltagent` retained (separate security package, not VoltAgent framework)
- Backend dead service audit deferred to Phase 29 (Architecture Hardening) — Phase 28 focuses on frontend cleanup

### Playwright E2E Tests
- Mocked responses: intercept backend API at HTTP level with Playwright route interception for canned streaming responses — fast, deterministic, CI-friendly
- Real LLM validation already covered by Phase 24-26 E2E gates; no need to repeat in Playwright
- Cover all 3 required flows from TEST-04:
  1. Chat flow: send message, verify streaming renders, tool card appears, HITL card shows for write action
  2. Briefing widget: dashboard loads, briefing card renders
  3. Mobile viewport: 375px, chat is usable with touch-friendly interactions
- Create new `chat-e2e.spec.ts` file (separate from existing `chat-visual-audit.spec.ts` — different concerns)
- No deletion-verification tests — type-check and lint already catch broken imports; E2E focuses on positive flows

### Bundle Analysis
- Use `@next/bundle-analyzer` with ANALYZE=true — run before and after deletion, generate visual treemap
- Document-only approach: measure and record the delta, no hard size targets (Phase 30 handles CI budget enforcement)
- Save report as `.planning/phases/28-cleanup-voltagent-deletion/BUNDLE-ANALYSIS.md`
- Note: if tree-shaking already eliminated ai-elements from the bundle, minimal delta is expected and acceptable

### Claude's Discretion
- Exact order of deletion operations (can delete in any logical sequence)
- How to handle edge cases found during import tracing (orphaned types, unused re-exports)
- Playwright test implementation details (selectors, assertion approach, fixture structure)
- Whether @next/bundle-analyzer needs to be added as devDependency or is already present

</decisions>

<specifics>
## Specific Ideas

No specific requirements — straightforward deletion and verification work. Follow existing Playwright patterns from the 10 existing E2E spec files.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/e2e/auth.setup.ts`: Auth state persistence for E2E tests (reuse for chat tests)
- `frontend/e2e/fixtures.ts`: Shared test fixtures (extend for chat test helpers)
- `frontend/playwright.config.ts`: Multi-browser config with auth dependency chain (new tests auto-inherit)
- `frontend/src/components/chat/`: 34 files — the replacement assistant-ui chat (verify these work after ai-elements deletion)

### Established Patterns
- E2E tests use `storageState: 'playwright/.auth/user.json'` for authenticated tests
- Route interception pattern: existing specs use `page.route()` for API mocking
- CSS-only responsive: chat uses `hidden md:flex` / `flex md:hidden` patterns (test by viewport resize)

### Integration Points
- `chat/types.ts` → `ai-elements/tool-renderers/types` (must fix before deletion)
- `frontend/src/api/swagger.json` has one `voltagent` reference (cleanup target)
- Existing chat route at `/chat` or `/dashboard/chat` (Playwright navigates here)

</code_context>

<deferred>
## Deferred Ideas

- Backend dead service audit (old VoltAgent stubs, BatchIndexingService no-op) — Phase 29
- CI bundle size budget enforcement — Phase 30
- Performance targets (LCP/TTI) — Phase 30

</deferred>

---

*Phase: 28-cleanup-voltagent-deletion*
*Context gathered: 2026-03-03*
