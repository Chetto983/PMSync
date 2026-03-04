# Phase 39: Code Quality & CI Hygiene - Research

**Researched:** 2026-03-04
**Domain:** Frontend file splitting, GitHub Actions CI workflow, dead code removal
**Confidence:** HIGH

## Summary

Phase 39 closes 4 specific tech debt items flagged by the v4.0 milestone audit. None require new libraries, architectural changes, or complex research. All 4 items are surgical edits to existing files with well-understood scope.

The items are: (1) split `email.tsx` from 1035 lines to under 500 per file, (2) fix Lighthouse CI trigger to include mixed backend+frontend PRs, (3) fix OpenAPI CI `continue-on-error` masking real failures, (4) delete `auth-token.ts` deprecation stub with zero remaining callers.

**Primary recommendation:** Execute all 4 items in a single plan. No new dependencies. No new patterns. Just disciplined code hygiene.

## Standard Stack

No new libraries needed. All work uses existing project infrastructure:

### Core (already in project)
| Library | Purpose | Relevance |
|---------|---------|-----------|
| Next.js (pages router) | Frontend framework | email.tsx lives in `pages/dashboard/` |
| GitHub Actions | CI/CD | Workflow files in `.github/workflows/` |
| @lhci/cli | Lighthouse CI | Already configured in `frontend-ci.yml` |
| openapi-typescript | Type generation from OpenAPI | Already in `ci.yml` backend job |

### Alternatives Considered
None. This is pure refactoring of existing code.

## Architecture Patterns

### Pattern 1: Email Page File Split Strategy

**What:** Split `frontend/pages/dashboard/email.tsx` (1035 lines) into the page file + extracted hooks/helpers.

**Current structure analysis (line counts):**
- Lines 1-56: Imports (56 lines)
- Lines 58-106: Helper functions `extractEmailAddress` + `formatEmailToThread` (49 lines)
- Lines 108-1031: `EmailPage` component (923 lines)
  - Lines 108-284: State + query setup + mutations (176 lines)
  - Lines 286-337: Optimistic update helpers (51 lines)
  - Lines 339-393: Click/keyboard handlers (54 lines)
  - Lines 395-652: Reading pane + email action handlers (257 lines)
  - Lines 654-924: Bulk handlers + drag-drop + folder reorder (270 lines)
  - Lines 926-1031: JSX render (105 lines)
- Lines 1033-1035: getServerSideProps (3 lines)

**Recommended split:**

| File | Content | Est. Lines |
|------|---------|------------|
| `pages/dashboard/email.tsx` | Page component (state, JSX, wiring) | ~350 |
| `components/email/hooks/use-email-page-actions.ts` | All action handlers (reply, forward, flag, delete, archive, move, download, bulk ops) | ~350 |
| `components/email/utils/email-formatters.ts` | `extractEmailAddress`, `formatEmailToThread` | ~60 |

**Why this split works:**
- The page component keeps state declarations, query wiring, and JSX
- Action handlers are pure callbacks that depend on mutations/toast/queryClient -- easily extractable as a custom hook
- Helper functions have zero coupling to React state

**Anti-pattern: Do NOT split into more than 3 files.** Over-splitting creates navigation overhead worse than the original problem. The goal is "under 500 lines each," not "every function in its own file."

### Pattern 2: Custom Hook Extraction for Page Actions

**What:** Extract action handlers into a single `useEmailPageActions` hook.

**Interface shape:**
```typescript
// components/email/hooks/use-email-page-actions.ts
interface UseEmailPageActionsParams {
  emails: Email[];
  selectedEmail: Email | null;
  selectedEmailData: SelectedEmailData | null;
  emailQueryParams: ListEmailsParams;
  optimisticUpdateEmail: (id: string, updates: Partial<Email>) => void;
  optimisticRemoveEmail: (id: string) => void;
  setSelectedThreadId: (id: string | null) => void;
  setLabelPickerOpen: (open: boolean) => void;
  setLabelPickerEmailIds: (ids: string[]) => void;
  setFolderPickerOpen: (open: boolean) => void;
  setFolderPickerEmailId: (id: string | null) => void;
}

export function useEmailPageActions(params: UseEmailPageActionsParams) {
  // All useCallback handlers defined here
  return {
    handleReply, handleReplyAll, handleForward,
    handleFlagMessage, handleLabelsMessage,
    handleDeleteMessage, handleArchiveMessage,
    handleMoveMessage, handleMoveMessageToFolder,
    handleDownloadAttachment,
    handleBulkMarkAsRead, handleBulkMarkAsUnread,
    handleBulkArchive, handleBulkDelete,
    handleBulkMove, handleBulkLabel,
    handleFlag, handleArchive, handleDelete,
    handleLabelPickerSuccess, handleLabelPickerClose,
    getCurrentLabelIds,
    handleEmailDrop, handleFolderReorder,
  };
}
```

**Why a single hook, not many:** These handlers share `toast`, `t`, `queryClient`, `emails`, mutation instances. Splitting into individual hooks would cause prop-drilling or duplicated hook calls.

### Pattern 3: GitHub Actions Path Trigger Fix

**What:** The `frontend-ci.yml` Lighthouse job only triggers on `paths: ['frontend/**']`. Mixed PRs (touching both `backend/` and `frontend/`) skip Lighthouse entirely.

**Current trigger (BROKEN for mixed PRs):**
```yaml
on:
  pull_request:
    paths:
      - 'frontend/**'
```

**Fix options (ranked):**

1. **Remove `paths` filter entirely** -- Lighthouse runs on ALL PRs. Simple, correct, but wastes CI minutes on backend-only PRs.

2. **Add `paths-ignore` instead** -- Trigger on everything EXCEPT docs-only changes:
   ```yaml
   on:
     pull_request:
       paths-ignore:
         - '*.md'
         - 'docs/**'
         - '.planning/**'
   ```
   Still runs on backend-only PRs (wasteful but safe).

3. **Keep `paths` filter but add backend paths** -- Won't catch all mixed PRs (e.g. config changes).

**Recommendation:** Option 1 (remove paths filter). Lighthouse runs are cheap (~2 min). Missing a regression on a mixed PR is expensive. The `needs: [build-and-test]` dependency already ensures frontend builds first, so if the frontend build step itself has paths filtering, consider removing there too or keeping it to avoid running Lighthouse when zero frontend files changed.

**Actually, on closer inspection:** The `build-and-test` job ALSO has the `paths: ['frontend/**']` filter. Both jobs are in the same workflow file with the same `on:` trigger. The fix must be at the workflow `on:` level, not individual jobs. Remove `paths` from the workflow trigger -- both jobs will run on all PRs. The build step is fast, and Lighthouse only adds ~2 min.

### Pattern 4: OpenAPI CI continue-on-error Fix

**Current state (in `.github/workflows/ci.yml`):**
```yaml
- name: Generate OpenAPI spec
  id: openapi-gen
  run: |
    npx ts-node scripts/generate-openapi.ts || echo "OpenAPI generation requires database -- skipping in CI for now"
  continue-on-error: true
```

**Problem:** The `|| echo` fallback AND `continue-on-error: true` together mean that ANY failure (syntax error, import crash, real bug) is silently swallowed. The intent was to handle "no database in CI" gracefully, but it masks everything.

**Fix:**
```yaml
- name: Generate OpenAPI spec
  id: openapi-gen
  run: |
    npx ts-node scripts/generate-openapi.ts
  continue-on-error: true
```

Remove the `|| echo` fallback. Keep `continue-on-error: true` because OpenAPI generation genuinely needs a database (which CI doesn't have). The step will fail with a clear error visible in CI logs. The downstream Spectral lint and type generation steps already check `steps.openapi-gen.outcome == 'success'`, so they correctly skip when generation fails.

**Why not remove `continue-on-error` entirely:** Without a database, the step WILL fail every time. Making it a hard failure would block ALL CI runs. The correct long-term fix is providing a CI database or generating the spec at build time, but that is out of scope for this phase.

**The real improvement:** Remove the `|| echo` that swallows stderr. With only `continue-on-error`, the step shows as failed (orange) in GitHub Actions UI, not passed (green). Engineers can see it failed and inspect the error. Currently, the `|| echo` makes it look like it succeeded.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File splitting | Custom module system | Simple hook extraction | React hooks are the standard pattern for extracting logic from components |
| CI path filtering | Custom scripts | GitHub Actions `paths`/`paths-ignore` | Native workflow syntax, well-documented |

## Common Pitfalls

### Pitfall 1: Breaking Hook Dependency Arrays During Extraction
**What goes wrong:** Extracting callbacks into a separate hook but forgetting to pass all closure dependencies, causing stale closures.
**How to avoid:** The extracted hook must receive ALL mutable state and setters it references. Run `npm run type-check` after extraction -- TypeScript will catch missing params if types are strict.
**Warning signs:** Tests pass but UI doesn't update after actions, or actions use stale data.

### Pitfall 2: Circular Imports in Hook Extraction
**What goes wrong:** New hook file imports from `@/hooks/queries` and `@/lib/api/emails` which might transitively import the page.
**How to avoid:** Page files in `pages/` should never be imported by components or hooks. Verify no circular dependency exists by checking that the new hook only imports from `@/hooks`, `@/lib`, and `@/stores` -- never from `@/pages`.

### Pitfall 3: GitHub Actions `paths` Filter Inheritance
**What goes wrong:** Assuming `paths` on individual jobs overrides the workflow-level trigger. It doesn't -- `paths` only works on the `on:` block.
**How to avoid:** Change the `on:` block. Individual jobs use `if:` conditions if you want per-job filtering.

### Pitfall 4: Deleting auth-token.ts While Callers Exist
**What goes wrong:** Hidden import sites crash at runtime.
**How to avoid:** Already verified: `grep -r "getAuthToken" frontend/` shows ONLY the definition in `auth-token.ts` itself. No import sites remain. Safe to delete. But verify again before deleting -- a stale grep result is possible.

## Code Examples

### Hook Extraction Pattern (verified from project codebase)
```typescript
// Source: existing pattern in frontend/hooks/queries/use-*.ts

// 1. Define params interface with all dependencies
interface UseEmailPageActionsParams {
  emails: Email[];
  // ... all needed state
}

// 2. Return object with all handlers
export function useEmailPageActions(params: UseEmailPageActionsParams) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations();
  const queryClient = useQueryClient();
  // ... all handlers using useCallback
  return { handleReply, handleForward, /* ... */ };
}
```

### GitHub Actions paths-ignore (verified syntax)
```yaml
# Source: GitHub Actions docs
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
    # No paths filter = runs on ALL PRs
```

## State of the Art

No technology changes relevant to this phase. All items are code hygiene on existing infrastructure.

## Open Questions

1. **Should the frontend-ci.yml Lighthouse job run on ALL PRs or use conditional logic?**
   - What we know: Currently skipped on mixed PRs. Running on all PRs costs ~2 min extra.
   - Recommendation: Run on all PRs. The cost is negligible vs the risk of missing a regression. If CI budget is a concern, use `paths-ignore` to skip docs-only PRs.

2. **Should the OpenAPI generation step have a database in CI eventually?**
   - What we know: It requires a running database, which CI doesn't provide.
   - Recommendation: Out of scope for this phase. Note as future improvement. The `continue-on-error` approach is acceptable for now.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + TypeScript (frontend) |
| Config file | `frontend/jest.config.js` |
| Quick run command | `cd frontend && npx jest --passWithNoTests --ci` |
| Full suite command | `cd frontend && npm run type-check && npm run lint && npx jest --passWithNoTests --ci` |

### Phase Requirements to Test Map

No formal requirement IDs (tech debt closure). Validation is behavioral:

| Item | Behavior | Test Type | Automated Command | File Exists? |
|------|----------|-----------|-------------------|-------------|
| email.tsx split | Page renders identically after split | type-check + lint | `cd frontend && npm run type-check && npm run lint` | N/A (existing tests) |
| email.tsx split | Each file under 500 lines | manual check | `wc -l frontend/pages/dashboard/email.tsx frontend/components/email/hooks/use-email-page-actions.ts frontend/components/email/utils/email-formatters.ts` | N/A |
| Lighthouse CI | Workflow triggers on mixed PRs | manual (CI trigger test) | `git diff .github/workflows/frontend-ci.yml` | N/A |
| OpenAPI CI | Step fails visibly on real errors | manual (CI log inspection) | `git diff .github/workflows/ci.yml` | N/A |
| auth-token.ts | No remaining callers | grep verification | `grep -r "getAuthToken\|auth-token" frontend/src frontend/pages frontend/components frontend/lib frontend/hooks --include="*.ts" --include="*.tsx"` | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npm run type-check && npm run lint`
- **Per wave merge:** Full frontend type-check + lint + jest
- **Phase gate:** All 4 success criteria verified

### Wave 0 Gaps
None -- no new test infrastructure needed. Validation is via type-check, lint, line counts, and grep.

## Sources

### Primary (HIGH confidence)
- `D:/PMSync/frontend/pages/dashboard/email.tsx` -- actual file content, 1035 lines confirmed
- `D:/PMSync/.github/workflows/ci.yml` -- actual CI config, continue-on-error on line 52
- `D:/PMSync/.github/workflows/frontend-ci.yml` -- actual CI config, paths filter on lines 9-11/14-16
- `D:/PMSync/frontend/lib/utils/auth-token.ts` -- 16-line stub, zero import sites confirmed via grep
- `D:/PMSync/.planning/v4.0-MILESTONE-AUDIT.md` -- audit document defining all 4 items

### Secondary (MEDIUM confidence)
- GitHub Actions `paths` documentation -- filter behavior on workflow triggers

## Metadata

**Confidence breakdown:**
- email.tsx split: HIGH -- file fully read, split boundaries identified, line counts verified
- Lighthouse CI fix: HIGH -- workflow file read, trigger semantics well-understood
- OpenAPI CI fix: HIGH -- workflow file read, `continue-on-error` + `|| echo` interaction clear
- auth-token.ts removal: HIGH -- file read, zero callers confirmed via grep

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable -- no external dependencies)
