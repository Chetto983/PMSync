# Phase 31: Foundation & Stability Verification - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the v3.2 baseline works, close Phase 28 gaps (chat 403 error, dead action-counts polling, E2E mobile viewport tests), and install all foundation infrastructure for v4.0 (event-emitter, dependency-cruiser, domain event types, interface contracts, ToolRegistryModule, AiRunLedger schema). Zero changes to existing behavior — purely additive installations and targeted bug fixes.

</domain>

<decisions>
## Implementation Decisions

### Gap Closure: Chat 403 Error
- Root-cause investigation + cleanup: trace the auth flow end-to-end, fix the root cause, and clean up any stale VoltAgent references that contributed to the broken path
- Document the root cause in the plan summary so Phase 32+ doesn't repeat the issue
- Verify fix with both desktop and mobile viewport after patching

### Gap Closure: Dead Action-Counts Polling
- Full sweep: remove all traces of the dead `action-counts` endpoint
- Clean up: `aiActionsKeys.counts()` key invalidation calls in `use-ai-actions.ts`, the `ActionCounts` type import if unused elsewhere, E2E mock for `/api/v1/ai/stats/action-counts` in `chat-e2e.spec.ts`
- Keep the `countsQuery` hardcoded empty object pattern as-is if removing it would break the hook's return type contract — but remove the `refetchCounts` invalidation calls that fire on every approve/reject action (unnecessary network noise)

### Gap Closure: E2E Mobile Viewport Tests
- Separate mobile test suite: keep desktop tests with their skip guards, create dedicated mobile-specific tests that run the same core flows at 375px with mobile-specific assertions (mobile layout visible, desktop layout hidden, sidebar slide behavior)
- Run on every PR — mobile regressions caught before merge
- 375px viewport only for Phase 31 (matches success criteria); 768px tablet viewport deferred to Phase 37 if needed

### AiRunLedger Schema Design
- Per-run totals initially: each AI call gets one ledger row. Per-step breakdown can be added later by adding `parentRunId` self-referencing FK without schema migration
- Track both `tenantId` and `userId` — standard for enterprise per-user cost attribution
- Include error tracking: `status` enum (SUCCESS, FAILED, TIMEOUT), `errorCode` and `errorMessage` nullable fields
- Include prompt metadata: `promptVersion` nullable string field for correlating cost changes to prompt changes
- Schema only in Phase 31 — migration runs, no service wiring until Phase 35

### dependency-cruiser Baseline
- Start with full cross-module import rules (not just cycles) — flag all direct imports that bypass module public APIs
- Warn-only mode: reports violations without blocking PRs
- Backend only: focus on NestJS module boundaries. Frontend MUI/Tailwind split is convention-enforced, not tool-enforced
- Baseline `.dependency-cruiser.cjs` config captures current violation count so Phase 32 has a clear target to reduce

### Claude's Discretion
- Chat 403 debugging approach (reproduction steps, which auth middleware to trace first)
- Exact event type file structure in `common/events/` (naming, barrel exports)
- Interface contract file organization in `common/interfaces/`
- ToolRegistryModule implementation details (registration pattern, DI token design)
- dependency-cruiser rule syntax and forbidden dependency patterns
- E2E mobile test implementation details (selectors, fixtures, mock patterns)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — straightforward infrastructure and bug fixing work. Follow existing codebase patterns: NestJS module structure for new modules, existing E2E test patterns from `chat-e2e.spec.ts` for new mobile tests, standard Prisma schema patterns for AiRunLedger model.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/e2e/chat-e2e.spec.ts`: 5 existing chat E2E tests with SSE mock helpers (`buildTextResponse`, `buildToolResponse`, `fulfillSSE`) — reuse for mobile suite
- `frontend/e2e/fixtures.ts`: Shared test fixtures with `authedPage` — extend for mobile viewport fixture
- `frontend/hooks/ai/use-ai-actions.ts`: Already has `action-counts` partially disabled (line 116: hardcoded empty object) — cleanup target
- `backend/src/app.module.ts`: 128 lines, clean module registration — EventEmitterModule.forRoot() goes here
- `backend/src/common/`: Existing `services/`, `filters/`, `interceptors/`, `middleware/` directories — new modules follow this pattern

### Established Patterns
- NestJS modules use `forRoot()` for global registration (see `ThrottlerModule`, `ConfigModule`, `ScheduleModule`)
- E2E tests use `page.route()` for API mocking with `storageState` for authentication
- Prisma schema in `backend/prisma/schema.prisma` — AiRunLedger model follows existing model patterns
- BullMQ queue services in `backend/src/modules/*/services/*-queue.service.ts` — fire-and-forget pattern available for ledger writes in Phase 35

### Integration Points
- `AppModule` (`app.module.ts`): EventEmitterModule registration point
- `package.json` (backend): New dependencies `@nestjs/event-emitter`, `dependency-cruiser`
- `backend/prisma/schema.prisma`: AiRunLedger model addition + migration
- `frontend/e2e/playwright.config.ts`: Mobile viewport project configuration
- `frontend/hooks/ai/use-ai-actions.ts`: Dead polling cleanup target
- 11 module files with `forwardRef`: baseline count for Phase 32 tracking

</code_context>

<deferred>
## Deferred Ideas

- 768px tablet viewport E2E tests — Phase 37 if needed
- Backend dead service audit (old VoltAgent stubs, BatchIndexingService no-op) — Phase 32+
- Frontend dependency-cruiser rules (MUI/Tailwind boundary) — evaluate after backend rules prove valuable
- Per-step AI run breakdown (parentRunId self-referencing) — Phase 35 when service wiring happens

</deferred>

---

*Phase: 31-foundation-stability-verification*
*Context gathered: 2026-03-03*
