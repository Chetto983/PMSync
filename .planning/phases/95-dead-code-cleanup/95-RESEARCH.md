# Phase 95: Dead Code & Cleanup - Research

**Researched:** 2026-03-20
**Domain:** Codebase hygiene -- dead code removal, unused dependencies, stale shims, debug statements
**Confidence:** HIGH

## Summary

Phase 95 is a pure deletion/cleanup phase. The codebase has accumulated dead code from multiple architecture transitions (VoltAgent removal, HITL redesign, AI SDK migration). Testing phases 89-94 have confirmed what is actually used vs. dead.

Knip analysis reveals **35 unused files** and **138 unused exports** in frontend, **31 unused files** and **44 unused exports** in backend. Several specific legacy artifacts are called out in requirements: the `voltAgentApi` alias, `multiAgentApi` shim, `PendingAction` type hierarchy, and orphaned `bulk_email_actions` renderer mapping.

Backend `console.log` usage is concentrated in scripts (acceptable) and test files (acceptable), with one production hit in `queue.config.ts`. Frontend has zero `console.log` in `src/`.

**Primary recommendation:** Use knip output as the authoritative inventory. Delete in waves: (1) legacy API shims/types, (2) orphaned files, (3) unused exports, (4) unused dependencies, (5) console.log cleanup. Type-check after each wave.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLN-01 | Dead code removed (orphaned `bulk_email_actions` renderer, unused exports, stale shims) | Knip identifies 35+31 unused files, 138+44 unused exports. `bulk_email_actions` found in tool-uis/index.tsx:40 and HitlApprovalCard.tsx:41 |
| CLN-02 | All hardcoded strings replaced with i18n keys (en.ts + it.ts) | Requires grep scan of .tsx files for English string literals outside of i18n calls |
| CLN-03 | `PendingAction` type and legacy HITL API methods cleaned up | PendingAction found in 13 frontend files: entities.ts, api.ts, websocket.ts, email-ui-store.ts, email-ui-types.ts, locales, AssistantMessage.tsx. Test file has commented-out getPendingActions test |
| CLN-04 | Unused API client methods removed (deprecated `voltAgentApi` alias, `multiAgentApi` shim) | Both in frontend/lib/api/ai.ts lines 656-687. Also: MultiAgentResponse type, AgentInfo type, IntentResult type |
| CLN-05 | Stale contract test assertions updated | frontend/lib/api/ai.test.ts has commented-out getPendingActions/approveAction tests that reference removed endpoints |
| CLN-06 | Console.log/debug statements removed from production code | Backend: 1 production hit (queue.config.ts:52), rest in scripts/tests. Frontend src/: 0 hits |
| CLN-07 | Unused dependencies removed from both package.json files | Frontend: @fontsource/roboto unused. Backend: @types/bcrypt + bcrypt unused (per knip). DevDeps: @types/ua-parser-js, @typescript-eslint/eslint-plugin (FE); @types/imapflow, @types/multer, dotenv-cli (BE) |
| CLN-08 | Dead routes and controllers removed | No dead routes found during testing phases. Backend VoltAgent references are cosmetic (comments/cache key names in audit.service.ts, cache.service.ts) |
</phase_requirements>

## Standard Stack

This phase requires no new libraries. Tools used for analysis:

| Tool | Purpose | Why Standard |
|------|---------|--------------|
| knip | Detect unused files, exports, dependencies | Already in frontend devDeps. Industry standard for JS/TS dead code detection |
| TypeScript compiler (`npx tsc --noEmit`) | Validate deletions don't break types | Project standard per CLAUDE.md |
| grep/ripgrep | Find console.log, hardcoded strings | Standard CLI tools |

### Installation

Knip is already installed in frontend. For backend, it was run via npx (no install needed).

## Architecture Patterns

### Deletion Strategy: Waves with Validation

Each wave focuses on one category, followed by type-check validation:

```
Wave 1: Legacy API artifacts (CLN-03, CLN-04)
  Delete voltAgentApi, multiAgentApi, PendingAction types
  Run: cd frontend && npx tsc --noEmit

Wave 2: Orphaned files (CLN-01, CLN-08)
  Delete unused files identified by knip
  Run: cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit

Wave 3: Unused exports (CLN-01)
  Remove dead exports from barrel files
  Run: both tsc --noEmit

Wave 4: Dependencies & console.log (CLN-06, CLN-07)
  Remove unused deps, clean console.log
  Run: npm install in both, verify build

Wave 5: i18n hardcoded strings (CLN-02)
  Grep for English text in .tsx, add to locales
  Run: tsc --noEmit

Wave 6: Test cleanup (CLN-05)
  Remove/update stale test assertions
  Run: jest/vitest on affected suites
```

### Anti-Patterns to Avoid
- **Deleting everything knip reports in one shot:** Knip can have false positives for dynamically-imported or reflection-used code. Delete in waves, validate each.
- **Removing barrel index.ts files:** Some are unused by knip's analysis but serve as public API contracts. Verify before deleting.
- **Touching test console.log:** Console output in test files is acceptable for debugging. Only remove from production `src/` code.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding unused exports | Manual grep | `knip` | Tracks transitive usage, handles re-exports |
| Finding unused deps | Manual review | `knip` or `depcheck` | Handles dynamic imports, peer deps |
| Finding hardcoded strings | Manual review | `grep -rn ">[^{<]*[A-Z]" --include="*.tsx"` | Systematic, catches edge cases |

## Common Pitfalls

### Pitfall 1: False Positive Unused Files
**What goes wrong:** Knip reports files as unused that are actually imported dynamically or via require()
**Why it happens:** Static analysis cannot trace all import paths (dynamic imports, webpack aliases, test-only files)
**How to avoid:** Cross-check knip results against actual imports. Pay special attention to: test setup files, E2E setup files, seed scripts, type declaration files
**Warning signs:** `e2e/auth.setup.ts`, `types/api.generated.ts` flagged -- these may be used by Playwright config or codegen

### Pitfall 2: Removing Types That Are Used via Re-export
**What goes wrong:** Deleting a type from entities.ts that is re-exported via api.ts and consumed elsewhere
**Why it happens:** Knip tracks direct usage but barrel file re-exports can mask dependencies
**How to avoid:** Always run `tsc --noEmit` after each deletion batch. Never delete more than one category before validating.

### Pitfall 3: PendingAction in Email UI Store
**What goes wrong:** `pendingActions` in email-ui-store.ts tracks optimistic email mutations, NOT the legacy HITL PendingAction type
**Why it happens:** Same name, different concept. The email UI store uses `Set<string>` for pending email IDs during bulk operations
**How to avoid:** Do NOT delete `addPendingAction`/`removePendingAction`/`clearPendingActions` from the email UI store. Only delete the `AgentPendingAction` interface and API types.

### Pitfall 4: VoltAgent References in Backend Comments
**What goes wrong:** Renaming comments/cache keys breaks cache invalidation or audit log queries
**Why it happens:** Cache key enum values (`VOLT_EMAIL_CONTENT`, etc.) are string literals stored in Redis
**How to avoid:** Renaming cache enum values requires flushing Redis caches. For comments, just update the text. For enum values, consider leaving as-is or coordinating with deployment.

### Pitfall 5: @sentinelseed/voltagent is NOT dead
**What goes wrong:** Removing it because "VoltAgent was removed"
**Why it happens:** Name confusion -- the npm package provides OWASP prompt guard and PII detection, unrelated to the VoltAgent chat pipeline
**How to avoid:** Keep `@sentinelseed/voltagent` in backend deps. It is actively imported by `prompt-guard-sentinel.service.ts` and `pii-detection-sentinel.service.ts`.

## Concrete Findings

### CLN-01: Dead Code Inventory

**Frontend unused files (35 total, key ones):**
- `components/ai/ChatCommandPalette.tsx` -- old chat UI
- `components/ai/DailyBriefing/index.tsx` -- replaced
- `components/ai/FollowUpTracker/FollowUpCard.tsx` -- replaced
- `components/crm/CrmAlertsWidget.tsx` -- CRM deferred to v8
- `components/dashboard/LayoutPresets.tsx` -- unused dashboard feature
- `components/dashboard/WidgetLibrary.tsx` -- unused dashboard feature
- `components/email/thread/ThreadView.tsx` and related -- old thread UI
- `components/productivity/DeadlineWidget.tsx` -- unused
- `types/api.ts`, `types/entities.ts`, `types/websocket.ts`, `types/index.ts` -- legacy type files
- `hooks/use-toast.tsx`, `hooks/use-is-mobile.ts`, `hooks/use-swipe-actions.ts` -- unused hooks
- `lib/api/email-sync.ts` -- unused API module

**Backend unused files (31 total, key ones):**
- `src/common/auth/better-auth.controller.ts` -- unused controller
- `src/common/dto/pagination.dto.ts` -- unused DTO
- `src/common/services/log-sanitizer.service.ts` -- unused service
- Various `index.ts` barrel files that re-export nothing consumed
- `src/modules/mistral/mistral-error.ts` -- unused error class
- `types/fasttext.d.ts` -- unused type declaration

### CLN-03 & CLN-04: Legacy API Artifacts

**In `frontend/lib/api/ai.ts`:**
- Line 656: `export const voltAgentApi = aiChatApi;` -- deprecated alias, delete
- Lines 659-687: `export const multiAgentApi = {...}` -- legacy shim, delete
- Types to delete: `MultiAgentResponse`, `AgentInfo`, `LearningProfileStats`, `IntentResult` (verify no consumers first)

**PendingAction spread across frontend:**
- `types/entities.ts`: `AgentPendingAction` interface (lines ~377+)
- `types/api.ts`: `GetPendingActionsRequest`, `GetPendingActionsResponse`
- `types/websocket.ts`: `AgentPendingAction` import and usage in event types
- `locales/en.ts`, `it.ts`, `index.ts`: `viewPendingActions`, `noPendingActions` keys
- IMPORTANT: `email-ui-store.ts` `pendingActions` is a DIFFERENT concept (email bulk ops) -- DO NOT DELETE

### CLN-06: Console.log in Production

**Backend production code (must fix):**
- `src/common/config/queue.config.ts:52`: `console.log('[BullMQ-Shared] Redis connected')` -- replace with logger

**Backend acceptable (scripts/tests):**
- `scripts/backfill-from-hash.ts` -- CLI script, console.log is correct
- `scripts/backfill-encryption.ts` -- CLI script, console.log is correct
- `__tests__/*.test.ts` files -- test output, acceptable

### CLN-07: Unused Dependencies

**Frontend:**
- Remove: `@fontsource/roboto` (unused, project uses Inter)
- Remove devDep: `@types/ua-parser-js` (unused type)
- Note: `@typescript-eslint/eslint-plugin` flagged but may be needed for eslint config -- verify before removing

**Backend:**
- Remove: `bcrypt` + `@types/bcrypt` (unused, project uses better-auth which handles hashing)
- Remove devDeps: `@types/imapflow` (types inlined), `@types/multer` (unused), `dotenv-cli` (unused)
- KEEP: `@sentinelseed/voltagent` (actively used for prompt guard + PII detection)

### CLN-08: VoltAgent Comment Cleanup in Backend

These are cosmetic references to rename in comments/strings:
- `audit.service.ts:111`: entity name `'VoltAgent'` in audit log
- `cache.service.ts:33-39`: JSDoc comments mentioning "VoltAgent"
- `ai-chat.module.ts:37`: Comment mentioning VoltAgent

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 30 (frontend) + Vitest 4 (backend) |
| Config file | `frontend/jest.config.ts`, `backend/vitest.config.ts` |
| Quick run command | `cd frontend && npx jest --passWithNoTests` / `cd backend && npx vitest run --reporter=verbose` |
| Full suite command | Same as quick run for this phase |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLN-01 | No orphaned files/exports | static analysis | `cd frontend && npx knip --reporter compact` | N/A (tool) |
| CLN-02 | No hardcoded English in .tsx | grep scan | `grep -rn ">[A-Z][a-z]" frontend/src --include="*.tsx"` | N/A (manual) |
| CLN-03 | PendingAction types removed | type-check | `cd frontend && npx tsc --noEmit` | N/A |
| CLN-04 | voltAgentApi/multiAgentApi removed | type-check | `cd frontend && npx tsc --noEmit` | N/A |
| CLN-05 | Test assertions updated | unit test | `cd frontend && npx jest lib/api/ai.test.ts` | Yes |
| CLN-06 | No console.log in prod | grep scan | `grep -rn "console\.\(log\|debug\)" backend/src --include="*.ts" --exclude-dir=__tests__ --exclude-dir=scripts --exclude-dir=test` | N/A |
| CLN-07 | Unused deps removed | install | `cd frontend && npm install && cd ../backend && npm install` | N/A |
| CLN-08 | No dead routes | type-check | `cd backend && npx tsc --noEmit` | N/A |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` in affected package
- **Per wave merge:** `npx tsc --noEmit` in both packages
- **Phase gate:** Both type-checks green + knip re-run shows reduced counts

### Wave 0 Gaps
None -- this phase is deletion-only. No new test infrastructure needed.

## Open Questions

1. **`types/api.generated.ts` -- truly unused?**
   - What we know: Knip flags it as unused
   - What's unclear: It may be generated by openapi-typescript and consumed indirectly
   - Recommendation: Check if any import references it; if not, delete

2. **Email UI store `pendingActions` -- related to HITL?**
   - What we know: Uses `Set<string>` for email IDs, NOT `AgentPendingAction` type
   - What's unclear: Whether the naming collision is confusing
   - Recommendation: Keep as-is -- it serves email bulk operations, renaming is out of scope for cleanup

3. **VoltAgent cache key enum values**
   - What we know: Cache keys like `VOLT_EMAIL_CONTENT` are string literals stored in Redis
   - What's unclear: Whether renaming them requires cache flush on deploy
   - Recommendation: Leave cache enum values as-is unless there's a deployment window to flush Redis

## Sources

### Primary (HIGH confidence)
- Knip analysis output (run on both frontend and backend) -- unused files, exports, dependencies
- Direct codebase grep -- console.log counts, PendingAction locations, voltAgentApi/multiAgentApi
- `frontend/lib/api/ai.ts` -- direct read of legacy shim code
- `frontend/lib/api/ai.test.ts` -- direct read of commented-out test assertions

### Secondary (MEDIUM confidence)
- MEMORY.md project context -- confirms VoltAgent was fully removed, API renamed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, tools already in place
- Architecture: HIGH - deletion patterns are straightforward, validated by type-checker
- Pitfalls: HIGH - directly verified each concern against codebase (especially PendingAction name collision)

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- cleanup targets won't change)
