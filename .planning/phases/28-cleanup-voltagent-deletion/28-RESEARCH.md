# Phase 28: Cleanup & VoltAgent Deletion - Research

**Researched:** 2026-03-03
**Domain:** Frontend dead code removal, bundle analysis, Playwright E2E
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Delete the entire `frontend/src/components/ai-elements/` directory (69 files) in one clean cut
- No selective audit -- all 69 files are dead code replaced by assistant-ui components in `components/chat/`
- `chat/types.ts` imports `ToolRendererResult` from `ai-elements/tool-renderers/types` -- inline this type directly into `chat/types.ts` before deletion
- Full dead-code sweep across entire frontend/src after ai-elements deletion -- use import tracing to find all unreferenced components, hooks, and utilities
- Clean all `voltagent` references from frontend code files, swagger.json, and comments
- MSDK-03 already satisfied -- `@voltagent/core`, `@voltagent/postgres`, and `@mistralai/mistralai` packages are already removed from dependencies
- Only comment references remain in 3 backend files (ai.module.ts, mistral.service.ts, mistral-rag.service.ts) -- leave as migration history
- `@sentinelseed/voltagent` retained (separate security package, not VoltAgent framework)
- Backend dead service audit deferred to Phase 29 (Architecture Hardening) -- Phase 28 focuses on frontend cleanup
- Mocked responses: intercept backend API at HTTP level with Playwright route interception for canned streaming responses -- fast, deterministic, CI-friendly
- Real LLM validation already covered by Phase 24-26 E2E gates; no need to repeat in Playwright
- Cover all 3 required flows from TEST-04: chat flow, briefing widget, mobile viewport
- Create new `chat-e2e.spec.ts` file (separate from existing `chat-visual-audit.spec.ts`)
- No deletion-verification tests -- type-check and lint already catch broken imports
- Use `@next/bundle-analyzer` with ANALYZE=true -- run before and after deletion, generate visual treemap
- Document-only approach: measure and record the delta, no hard size targets
- Save report as `.planning/phases/28-cleanup-voltagent-deletion/BUNDLE-ANALYSIS.md`

### Claude's Discretion
- Exact order of deletion operations (can delete in any logical sequence)
- How to handle edge cases found during import tracing (orphaned types, unused re-exports)
- Playwright test implementation details (selectors, assertion approach, fixture structure)
- Whether @next/bundle-analyzer needs to be added as devDependency or is already present

### Deferred Ideas (OUT OF SCOPE)
- Backend dead service audit (old VoltAgent stubs, BatchIndexingService no-op) -- Phase 29
- CI bundle size budget enforcement -- Phase 30
- Performance targets (LCP/TTI) -- Phase 30
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FECLEAN-01 | Old ai-elements chat files deleted (assistant-ui replaces them) | Confirmed: 69 files in `frontend/src/components/ai-elements/`, only 1 import reference from `chat/types.ts` line 32. Plus ~26 files in `frontend/components/ai/AiDashboard/` and related old hooks. |
| FECLEAN-02 | Bundle analysis performed and largest offenders addressed | `@next/bundle-analyzer` already installed (v16.1.6) and wired in `next.config.js` with `ANALYZE=true` env gate. Ready to run. |
| FECLEAN-03 | Dead components and orphaned files removed across entire frontend | Research identified: AiDashboard (26 files), `ai/index.ts` barrel, `use-voltagent-chat.ts`, `hooks/ai/use-ai-chat.ts`, `hooks/use-email-chat-actions.ts`, `ai/TypingIndicator.tsx`, `ai/StreamingMessage.tsx`, swagger.json voltagent paths, E2E fixture voltagent mocks. EmailChatPanel is the critical cross-reference. |
| MSDK-03 | `@mistralai/mistralai` and `@voltagent/core` packages removed from dependencies | Confirmed: `npm ls` returns empty for all three packages across frontend, backend, and root. Already complete. |
| TEST-04 | Playwright E2E tests for assistant-ui chat frontend | Chat route at `/dashboard/ai`, existing Playwright infra with auth fixtures, 10 existing spec files, `page.route()` mocking pattern established. Need to mock `POST /api/v1/ai/chat` with Data Stream format response. |
</phase_requirements>

## Summary

Phase 28 is a cleanup and testing phase with no new feature development. The work divides into three clean segments: (1) delete dead frontend code that was replaced by assistant-ui in Phase 27, (2) sweep the entire frontend for orphaned files using import tracing, and (3) add Playwright E2E test coverage for the new chat UI plus bundle analysis.

The ai-elements directory (69 files) has exactly one inbound import -- `chat/types.ts` re-exporting type interfaces. These types must be inlined (copied) into `chat/types.ts` before the directory deletion. Beyond ai-elements, a second wave of dead code exists in `frontend/components/ai/AiDashboard/` (26 files) plus old hooks (`use-voltagent-chat.ts`, `use-ai-chat.ts`, `use-email-chat-actions.ts`). The critical complication is `EmailChatPanel.tsx` which lazy-imports `ChatMessages` from the old AiDashboard -- this component is actively used in the email thread view and must be either updated or removed.

**Primary recommendation:** Delete in dependency order -- inline types first, delete ai-elements, then trace and delete AiDashboard + old hooks, update/remove EmailChatPanel, clean voltagent references, run type-check+lint to verify, then write Playwright E2E tests and do bundle analysis.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Playwright | Already in project | E2E testing | Already configured with multi-browser support |
| @next/bundle-analyzer | 16.1.6 | Bundle size treemaps | Already installed and wired in next.config.js |
| TypeScript tsc | In project | Dead code detection | `npm run type-check` catches all broken imports |
| ESLint | In project | Lint validation | `npm run lint` catches unused imports |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @playwright/test | In project | Test assertions and fixtures | For chat-e2e.spec.ts |

### Alternatives Considered
None -- all tools are already in the project. No new dependencies needed.

## Architecture Patterns

### Pattern 1: Type Inlining Before Directory Deletion
**What:** Copy type definitions from `ai-elements/tool-renderers/types.ts` (337 lines) directly into `chat/types.ts` before deleting the source file.
**When to use:** When a soon-to-be-deleted module exports types consumed by surviving code.
**Why:** All 15 chat tool-uis import types via `from '../types'` which re-exports from ai-elements. By inlining, the deletion becomes a no-op for downstream consumers.

**Current dependency chain:**
```
chat/tool-uis/*.tsx -> chat/types.ts -> ai-elements/tool-renderers/types.ts
```

**After inlining:**
```
chat/tool-uis/*.tsx -> chat/types.ts (self-contained)
```

**Specific types to inline (all from `ai-elements/tool-renderers/types.ts`):**
- ToolRendererProps, ArtifactAction
- EmailIndexItem, EmailIndexResult, EmailSearchItem, EmailSearchResult
- EmailContentItem, EmailContentResult
- FollowUpItem, FollowUpResult
- ContactItem, ContactSearchResult
- EventItem, EventResult
- CountResult
- FolderItem, FolderResult
- AnalysisResult
- MemoryItem, MemorySearchResult
- BriefingSectionItem, BriefingResult
- CrmContactStat, CrmResult
- BulkActionResult
- GenericToolResult

### Pattern 2: EmailChatPanel Cross-Reference Resolution
**What:** `EmailChatPanel.tsx` lazy-imports `ChatMessages` from old `AiDashboard` and uses `useVoltAgentChat` hook. This is a live cross-reference in the email thread view.
**When to use:** Must resolve before deleting AiDashboard.
**Strategy options:**
1. **Delete EmailChatPanel entirely** -- if the email-thread chat panel is not a core feature or can be replaced later. The email thread page imports `EmailChatFab` and `EmailChatPanel` from `@/components/email/thread`.
2. **Rewire to assistant-ui** -- update EmailChatPanel to use the new assistant-ui ChatRuntimeProvider/ChatThread instead of the old AiDashboard components. This is Phase 29+ work.
3. **Stub it** -- replace the lazy import with a "feature coming soon" placeholder.

**Recommendation:** Delete it. The main chat UI at `/dashboard/ai` is the primary interface now (Phase 27). EmailChatPanel was an old v3.0 feature that duplicates functionality. If needed later, it can be rebuilt cleanly using assistant-ui primitives. Phase 29 (Architecture Hardening) is the right time if it's needed.

### Pattern 3: Playwright Route Interception for Streaming Chat
**What:** Mock the `POST /api/v1/ai/chat` endpoint to return canned Data Stream format responses.
**When to use:** E2E testing of the assistant-ui chat without a running backend.

**Data Stream format** (what `pipeUIMessageStreamToResponse` produces):
The response is `text/plain` with line-delimited chunks. Each line is a JSON-encoded event prefixed with a type code. For Playwright testing, we can return a simple text response that the `AssistantChatTransport` will parse:

```typescript
// Simplified mock streaming response for Playwright
await page.route('**/api/v1/ai/chat', (route) => {
  // Data Stream format: type:content\n
  const body = [
    '0:"Hello "\n',           // text delta
    '0:"from the AI!"\n',     // text delta
    'd:{"finishReason":"stop","usage":{"inputTokens":10,"outputTokens":5}}\n',
  ].join('');

  route.fulfill({
    status: 200,
    contentType: 'text/plain; charset=utf-8',
    body,
  });
});
```

**For tool call mocking:**
```typescript
// Tool call chunk format
const toolBody = [
  '9:{"toolCallId":"call_1","toolName":"search_emails","args":{"query":"test"}}\n',
  'a:{"toolCallId":"call_1","result":{"success":true,"data":[]}}\n',
  '0:"Here are your results."\n',
  'd:{"finishReason":"stop","usage":{"inputTokens":20,"outputTokens":10}}\n',
].join('');
```

**Confidence: MEDIUM** -- The exact Data Stream type codes need verification against the actual AI SDK v6 implementation. The codes `0` (text), `9` (tool-call), `a` (tool-result), `d` (finish) are based on AI SDK v6 conventions, but the Playwright test should be validated by actually observing a real response first.

### Pattern 4: Bundle Analysis Before/After
**What:** Run `ANALYZE=true npm run build` before and after deletion to capture bundle size delta.
**Procedure:**
```bash
# Before deletion
set ANALYZE=true && npm run build
# Save generated .next/analyze/ reports

# After deletion
set ANALYZE=true && npm run build
# Compare reports, document delta
```

**Expected outcome:** If tree-shaking already eliminates unreferenced ai-elements from the production bundle, the delta may be minimal. The documentation captures this either way.

### Anti-Patterns to Avoid
- **Deleting before inlining types:** Will cause immediate type-check failure across 15 tool-ui files.
- **Partial ai-elements deletion:** CONTEXT.md says full directory delete, no selective audit. Don't cherry-pick files.
- **Skipping EmailChatPanel resolution:** It lazy-imports from AiDashboard. Deleting AiDashboard without addressing this will cause a runtime error (not a type-check error, because it's a dynamic `import()`).
- **Using `page.waitForTimeout()` in Playwright tests:** Playwright skill golden rule #2. Use `expect(locator).toBeVisible()` or `page.waitForURL()` instead.
- **Hardcoded URLs in Playwright tests:** Use `baseURL` from config. The existing tests follow this pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dead code detection | Manual file-by-file audit | `npm run type-check` + `npm run lint` | TypeScript compiler catches ALL broken imports; lint catches unused imports |
| Import tracing | Custom script | `tsc --noEmit` + grep for unused exports | Compiler is the ground truth |
| Bundle analysis | Custom webpack analysis | `@next/bundle-analyzer` (already installed) | Generates visual treemap automatically |
| Streaming mock format | Custom SSE mock | Playwright `page.route()` with Data Stream text body | `AssistantChatTransport` uses standard fetch, not EventSource |

**Key insight:** The TypeScript compiler is the most reliable dead-code detector. After deletion, `npm run type-check` will immediately surface every broken import. No need for a separate import-tracing tool.

## Common Pitfalls

### Pitfall 1: Dynamic Imports Survive Type-Check
**What goes wrong:** `lazy(() => import('...'))` and `await import('...')` are not checked by `tsc --noEmit` at compile time for module resolution. The module path could be wrong and type-check would pass.
**Why it happens:** Dynamic imports resolve at runtime, not compile time.
**How to avoid:** Grep for `import(` patterns targeting deleted paths after deletion. Specifically: `EmailChatPanel.tsx` has `lazy(() => import('@/components/ai/AiDashboard/ChatMessages'))`.
**Warning signs:** Type-check passes but runtime error "Cannot find module" in browser console.

### Pitfall 2: swagger.json Has ~90 Voltagent Endpoints
**What goes wrong:** swagger.json is 7000+ lines with ~90 `/api/v1/voltagent/*` path entries. These are dead references since Phase 26 migrated frontend to `/api/v1/ai/*`.
**Why it happens:** swagger.json was not regenerated after backend route changes.
**How to avoid:** Either regenerate swagger.json from backend (`npm run build` then copy), or delete the voltagent paths manually. Since swagger.json is a generated file, regeneration is preferred.
**Warning signs:** Frontend API client references that still point to voltagent endpoints.

### Pitfall 3: E2E Fixture Mocks Voltagent Endpoints
**What goes wrong:** `fixtures.ts` (line 186-193), `compose.spec.ts` (line 131), `search.spec.ts` (line 166), and `auth.spec.ts` (line 85) all mock `**/voltagent/**` routes. After deletion, these mocks are dead code but won't cause failures (they just never match).
**Why it happens:** E2E fixtures were set up before the migration.
**How to avoid:** Clean up voltagent mock routes in all E2E files. Replace with `/api/v1/ai/**` mocks if needed, or remove if the catch-all at bottom of fixtures already covers them.
**Warning signs:** None (they're harmless), but they're tech debt.

### Pitfall 4: components/ai/index.ts Barrel Exports
**What goes wrong:** `frontend/components/ai/index.ts` exports `TypingIndicator`, `StreamingMessage`, and re-exports from `use-voltagent-chat`. If any external consumer imports from `@/components/ai`, deletion breaks them.
**Why it happens:** Barrel re-exports hide the real dependency chain.
**How to avoid:** Grep for `from '@/components/ai'` or `from '@/components/ai/index'` across the entire frontend before deleting.
**Warning signs:** Type-check failures mentioning `@/components/ai`.

### Pitfall 5: use-voltagent-chat.ts Is Used by hooks/ai/use-ai-chat.ts
**What goes wrong:** `hooks/ai/use-ai-chat.ts` re-exports everything from `hooks/use-voltagent-chat.ts`. And `hooks/ai/index.ts` re-exports from `use-ai-chat.ts`. Anything importing from `@/hooks/ai` gets these.
**Why it happens:** Legacy compatibility layer from Phase 23-24.
**How to avoid:** Trace all consumers of `@/hooks/ai` that use `useVoltAgentChat`, `useAiChat`, `getMessageMetadata`, `getMessageText` before deleting. These are only used by old AiDashboard components and EmailChatPanel -- if those are deleted first, the hooks can safely go.
**Warning signs:** Type-check failures in `hooks/ai/index.ts`.

## Code Examples

### Type Inlining in chat/types.ts

After inlining, `chat/types.ts` will look like:

```typescript
/**
 * Shared types for assistant-ui chat components.
 * Tool output type definitions for chat tool UIs.
 */

// --- Action Types ---
export type ArtifactAction =
  | { type: 'navigate'; route: string }
  | { type: 'send-message'; message: string }
  | { type: 'api-call'; fn: () => Promise<unknown> };

// --- Renderer Props ---
export interface ToolRendererProps {
  output: unknown;
  errorText?: string;
  toolName?: string;
  onAction?: (action: ArtifactAction) => void;
}

// [... all other interfaces from ai-elements/tool-renderers/types.ts ...]

/** Backend conversation summary shape */
export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  isArchived: boolean;
  messageCount: number;
}
```

### Playwright Chat E2E Test Structure

```typescript
import { test, expect } from './fixtures';

test.describe('AI Chat E2E', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    // Mock chat API with Data Stream format
    await page.route('**/api/v1/ai/chat', (route) => {
      const body = '0:"Hello from the AI assistant!"\n' +
        'd:{"finishReason":"stop","usage":{"inputTokens":10,"outputTokens":5}}\n';
      route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body,
      });
    });

    // Mock conversations list
    await page.route('**/api/v1/ai/chat/conversations', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('sends message and receives streaming response', async ({ authedPage: page }) => {
    await page.goto('/dashboard/ai');
    // Use getByRole per Playwright skill golden rule #1
    const composer = page.getByRole('textbox');
    await expect(composer).toBeVisible();
    await composer.fill('Hello');
    await composer.press('Enter');
    await expect(page.getByText('Hello from the AI assistant!')).toBeVisible();
  });
});
```

### Bundle Analysis Command (Windows)

```powershell
# Before deletion
$env:ANALYZE="true"; npm run build
# After deletion
$env:ANALYZE="true"; npm run build
```

## Deletion Inventory

### Tier 1: ai-elements Directory (69 files)
**Path:** `frontend/src/components/ai-elements/`
**Prerequisite:** Inline types into `chat/types.ts`
**Files:** All 49 top-level `.tsx` files + 20 files in `tool-renderers/` subdirectory

### Tier 2: Old AiDashboard Directory (26 files)
**Path:** `frontend/components/ai/AiDashboard/`
**Prerequisite:** Resolve EmailChatPanel cross-reference
**Files:**
- AgentProgressIndicator.tsx, AiMemoryWidget.tsx, ArtifactPanel.tsx
- AskUserModal.tsx, ChatArea.tsx, ChatInput.tsx, ChatMessages.tsx
- ChatSessionList.tsx, CollapsibleWidget.tsx, DesktopLayout.tsx
- HitlPayloadEditor.tsx, HitlStatusBadge.tsx, index.tsx
- InlineActionCard.tsx, LearningWidget.tsx, MentionInput.tsx
- MobileChatDialog.tsx, MobileLayout.tsx, PendingActionsWidget.tsx
- QuickActions.tsx, SuggestedQuestions.tsx, ToolActivityCard.tsx
- TypingIndicator.tsx, useChatController.ts, useChatScroll.ts
- useHitlMutations.ts

### Tier 3: Old Hooks and Barrel Files
**Files to delete:**
- `frontend/hooks/use-voltagent-chat.ts` -- Old chat hook (336+ lines)
- `frontend/hooks/ai/use-ai-chat.ts` -- Re-export wrapper
- `frontend/hooks/use-email-chat-actions.ts` -- Email chat action hook (depends on use-voltagent-chat types)
- `frontend/components/ai/index.ts` -- Barrel re-exporting old components
- `frontend/components/ai/TypingIndicator.tsx` -- Old typing indicator
- `frontend/components/ai/StreamingMessage.tsx` -- Old streaming message

### Tier 4: Cross-Reference Resolution
**Files to update:**
- `frontend/components/email/thread/EmailChatPanel.tsx` -- DELETE (uses old AiDashboard)
- `frontend/components/email/thread/index.ts` -- Remove EmailChatPanel export
- `frontend/pages/dashboard/email/thread/[threadId].tsx` -- Remove EmailChatPanel import/usage
- `frontend/hooks/ai/index.ts` -- Remove old hook re-exports (keep AI action/compose/email-ai hooks)
- `frontend/e2e/fixtures.ts` -- Remove voltagent mock (line 186-193)
- `frontend/e2e/compose.spec.ts` -- Remove voltagent mock (line 131)
- `frontend/e2e/search.spec.ts` -- Remove voltagent mock (line 166)
- `frontend/e2e/auth.spec.ts` -- Remove voltagent mock (line 85)

### Tier 5: swagger.json Cleanup
- `frontend/src/api/swagger.json` -- Remove ~90 `/api/v1/voltagent/*` path entries. Prefer regeneration from backend if available.

## Recommended Deletion Order

1. Inline types from `ai-elements/tool-renderers/types.ts` into `chat/types.ts`
2. Delete `frontend/src/components/ai-elements/` (entire directory)
3. Run `npm run type-check` -- should pass (only chat/types.ts was the link)
4. Resolve EmailChatPanel -- delete it and update its consumers
5. Delete AiDashboard directory
6. Delete old hooks (use-voltagent-chat.ts, use-ai-chat.ts, use-email-chat-actions.ts)
7. Clean up barrel files (components/ai/index.ts, TypingIndicator, StreamingMessage)
8. Clean hooks/ai/index.ts (remove old re-exports, keep useAiActions, useAiCompose, etc.)
9. Run `npm run type-check` again
10. Clean voltagent references in E2E files and swagger.json
11. Run `npm run lint` -- should pass (shimmer.tsx error goes away with ai-elements deletion)
12. Bundle analysis (before/after comparison)
13. Write Playwright E2E tests

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (already configured) |
| Config file | `frontend/playwright.config.ts` |
| Quick run command | `npx playwright test e2e/chat-e2e.spec.ts --project=chromium` |
| Full suite command | `npx playwright test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FECLEAN-01 | ai-elements deleted | compilation | `npm run type-check` | N/A (compiler) |
| FECLEAN-02 | Bundle analyzed | manual | `ANALYZE=true npm run build` | N/A (report) |
| FECLEAN-03 | Dead code removed | compilation | `npm run type-check && npm run lint` | N/A (compiler) |
| MSDK-03 | Packages removed | CLI check | `npm ls @voltagent/core @voltagent/postgres @mistralai/mistralai` | N/A (already verified) |
| TEST-04 | Chat E2E | E2E | `npx playwright test e2e/chat-e2e.spec.ts --project=chromium` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run type-check && npm run lint`
- **Per wave merge:** `npx playwright test --project=chromium`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/e2e/chat-e2e.spec.ts` -- covers TEST-04 (chat flow, briefing widget, mobile viewport)

## Open Questions

1. **EmailChatPanel: delete vs rewire?**
   - What we know: It lazy-imports old AiDashboard/ChatMessages and uses useVoltAgentChat. It's used in the email thread view (`[threadId].tsx`).
   - What's unclear: Whether the email thread chat panel is considered a required feature for v3.2.
   - Recommendation: Delete it. The main chat at `/dashboard/ai` is the primary UI. If needed, it can be rebuilt with assistant-ui in Phase 29. The CONTEXT.md says "full dead-code sweep" which implies removing it.

2. **swagger.json: regenerate vs manual cleanup?**
   - What we know: ~90 voltagent paths are dead references.
   - What's unclear: Whether the backend has a swagger generation command that outputs a clean file.
   - Recommendation: Try `cd backend && npm run build && npm run start -- --swagger` or equivalent to regenerate. If no generation command exists, manual deletion of voltagent paths is acceptable since it's a JSON file with clear structure.

3. **Data Stream mock format for Playwright**
   - What we know: Backend uses `pipeUIMessageStreamToResponse` which writes Data Stream format.
   - What's unclear: Exact byte-level format of type codes (are they `0:`, `9:`, `a:`, `d:` or something else?).
   - Recommendation: Capture a real response once with `curl` or Playwright trace to get exact format, then replicate in mocks. Fallback: the `page.route()` can return any valid response and we verify the UI renders text, not the exact protocol.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `frontend/src/components/ai-elements/` -- 69 files confirmed
- Codebase analysis: `frontend/src/components/chat/types.ts` -- single import reference confirmed
- Codebase analysis: `frontend/components/ai/AiDashboard/` -- 26 files confirmed
- Codebase analysis: `frontend/next.config.js` -- bundle analyzer already wired
- Codebase analysis: `frontend/package.json` -- `@next/bundle-analyzer` v16.1.6 installed
- Codebase analysis: `npm ls` confirms all VoltAgent packages already removed
- Codebase analysis: `npm run type-check` passes clean, `npm run lint` has errors only in ai-elements/shimmer.tsx

### Secondary (MEDIUM confidence)
- AI SDK v6 Data Stream format codes from project skills (`streaming/references/data-stream.md`)
- Playwright network mocking patterns from project skills (`playwright-skill/core/network-mocking.md`)

### Tertiary (LOW confidence)
- Exact Data Stream type codes for Playwright mock (need runtime verification)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already in project, no new dependencies
- Architecture: HIGH -- deletion inventory verified against actual codebase with grep/glob
- Pitfalls: HIGH -- all cross-references traced and documented with file/line numbers
- Playwright E2E: MEDIUM -- streaming mock format needs runtime verification

**Research date:** 2026-03-03
**Valid until:** 2026-04-03 (stable -- deletion work, no moving targets)
