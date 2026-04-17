---
phase: 145-smart-today-dashboard
plan: 03
subsystem: frontend-cleanup
tags: [react, deletion, dashboard, page-swap, today-dashboard, nav-05, hook-pruning]

# Dependency graph
requires:
  - phase: 145-01
    provides: GET /dashboard/today endpoint (still used by Plan 02 hooks)
  - phase: 145-02
    provides: TodayDashboard React component + dashboardApi + useTodayFeed
provides:
  - /dashboard route now serves <TodayDashboard /> (NAV-05 final wire-up)
  - Trimmed use-dashboard.ts (309 lines, down from 688)
affects: [phase-145 closeout]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-delete grep audit for every file deleted (orphan-import safety)"
    - "Selective hook pruning honoring non-widget importers (deviation from plan must_haves)"

key-files:
  created: []
  modified:
    - frontend/pages/dashboard/index.tsx
    - frontend/hooks/queries/use-dashboard.ts
  deleted:
    - frontend/components/dashboard/DashboardContainer.tsx
    - frontend/components/dashboard/DashboardContainer.test.tsx
    - frontend/components/dashboard/dashboard/widget-registry.ts
    - frontend/components/dashboard/dashboard/CustomizeDrawer.tsx
    - frontend/components/dashboard/dashboard/WidgetCard.tsx
    - frontend/components/dashboard/dashboard/WidgetSkeleton.tsx
    - frontend/components/dashboard/dashboard/DashboardEmptyState.tsx
    - frontend/components/dashboard/dashboard/AiQuickAccess.tsx
    - frontend/components/dashboard/widgets/BriefingWidget.tsx
    - frontend/components/dashboard/widgets/BriefingWidget.test.tsx
    - frontend/components/dashboard/widgets/UnreadEmailsWidget.tsx
    - frontend/components/dashboard/widgets/StaleContactsWidget.tsx
    - frontend/components/dashboard/widgets/StaleContactsWidget.test.tsx
    - frontend/components/dashboard/widgets/AiTriageWidget.tsx
    - frontend/components/dashboard/widgets/AiTriageWidget.test.tsx
    - frontend/components/dashboard/widgets/FollowUpWidget.tsx
    - frontend/components/dashboard/widgets/TrendChartsWidget.tsx
    - frontend/components/dashboard/widgets/DeadlinesWidget.tsx
    - frontend/components/dashboard/widgets/TodayEventsWidget.tsx
    - frontend/components/dashboard/widgets/BaseWidget.tsx
    - frontend/components/dashboard/CrmSuggestionsFeed.tsx
    - frontend/stores/dashboard-store.ts
    - frontend/stores/dashboard-store.test.ts
    - frontend/lib/dashboard/widget-registry.ts
    - frontend/lib/dashboard/layout-engine.ts
    - frontend/lib/dashboard/presets.ts
    - frontend/e2e/dashboard.spec.ts

key-decisions:
  - "DEVIATION: KEEP useStaleContacts/staleContactsOptions and useEmailTrends/emailTrendsOptions despite the plan's must_haves listing them — production pages still import them (analytics page via AnalyticsChart.tsx; contacts page via useContactsPageData.ts). Per the Task 2 safety mandate, deletion blocked."
  - "Option A chosen for e2e/dashboard.spec.ts: deleted. Old assertions targeted Customize button + MUI Switch widgets (both removed). Rewriting against the new TodayDashboard would be a new spec from scratch — defer to a future phase that owns the new E2E coverage."
  - "Backend cleanup (PUT/GET /users/me/dashboard-preferences) intentionally not touched in this plan — RESEARCH explicitly defers backend cleanup to a separate phase."
  - "ai.controller.ts + email-triage.service.ts have unstaged pre-existing modifications (not made by this plan). Left alone per CLAUDE.md scope-control."

requirements-completed: [NAV-05]

# Metrics
duration: ~25min
completed: 2026-04-17
---

# Phase 145 Plan 03: /dashboard Page Swap + Legacy Cleanup Summary

**NAV-05 final wire-up: `/dashboard` now serves `<TodayDashboard />`. Pruned 11 widget-only hook exports + the layout-engine type import from use-dashboard.ts. Deleted 27 legacy files (DashboardContainer + 9 widgets + dashboard/ subfolder + lib/dashboard/* + dashboard-store + CrmSuggestionsFeed + e2e/dashboard.spec.ts). Type-check + backend specs green; pre-existing test/lint failures in unrelated files unchanged.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 production tasks + 1 manual checkpoint (Task 4 returned to orchestrator)
- **Files modified:** 2 (frontend/pages/dashboard/index.tsx, frontend/hooks/queries/use-dashboard.ts)
- **Files deleted:** 27 (4,273 deletions in commit 399d901d)

## Task Commits

| Task | Description | Commit | Type |
| --- | --- | --- | --- |
| 1 | Swap DashboardContainer → TodayDashboard in /dashboard page | `63356c36` | feat |
| 2 | Prune dead exports from use-dashboard.ts | `7d07ea01` | feat |
| 3 | Delete 27 legacy files (widgets + dashboard/ + lib/dashboard/* + store + e2e) | `399d901d` | chore |
| 4 | Manual Edge CDP browser checkpoint — returned to orchestrator | n/a | n/a |

## Accomplishments

- `frontend/pages/dashboard/index.tsx` now imports `{ TodayDashboard } from '@/components/dashboard/today'` and renders `<TodayDashboard />` inside the existing `<Layout><PageErrorBoundary>` wrapper. Auth chain unchanged (T-145-16 mitigation preserved).
- `use-dashboard.ts` reduced from **688 → 309 lines** (55% reduction). Pruned all four widget-customization exports (`dashboardPreferencesOptions`, `useDashboardPreferences`, `useSaveDashboardLayout`, `getDefaultLayout`) and 12 widget-only data exports (`briefingOptions`/`useBriefing`, `deadlinesOptions`/`useDeadlines`, `todayEventsOptions`/`useTodayEvents`, `importantEmailsOptions`/`useImportantEmails`, `recentUnreadEmailsOptions`/`useRecentUnreadEmails`, `triagedEmailsOptions`/`useTriagedEmails`). Removed the `WidgetLayout`/`DashboardLayout` type import from `@/lib/dashboard/layout-engine`. Removed 6 now-unused interfaces (`BriefingData`, `Deadline`, `Email`, `CalendarEvent`, `TriagedEmail`) and 4 now-unused imports (`axios`, `useMutation`, `useQueryClient`, `calendarApi`).
- 27 legacy files deleted via `git rm`, all with pre-delete grep audit confirming zero non-widget importers.
- Orphan-import grep gauntlet — every pattern returns 0 in production code:
  - `from '@/components/dashboard/DashboardContainer'` → 0
  - `from '@/components/dashboard/dashboard/'` → 0
  - `from '@/components/dashboard/widgets/'` → 0
  - `from '@/components/dashboard/CrmSuggestionsFeed'` → 0
  - `from '@/stores/dashboard-store'` → 0
  - `from '@/lib/dashboard/'` → 0
- TypeScript `noEmit` exits 0 in both frontend and backend.
- Backend dashboard specs untouched: 43/43 still pass (Plan 01 contract preserved).

## File Deletion Count

**Target:** ~21 (per plan must_haves)
**Actual:** 27

| Category | Count | Files |
| --- | --- | --- |
| DashboardContainer + test | 2 | DashboardContainer.tsx, DashboardContainer.test.tsx |
| dashboard/ subfolder | 6 | widget-registry, CustomizeDrawer, WidgetCard, WidgetSkeleton, DashboardEmptyState, AiQuickAccess |
| widgets/ (incl. tests) | 12 | BriefingWidget(+test), UnreadEmails, StaleContacts(+test), AiTriage(+test), FollowUp, TrendCharts, Deadlines, TodayEvents, BaseWidget |
| CrmSuggestionsFeed | 1 | CrmSuggestionsFeed.tsx |
| dashboard-store + test | 2 | dashboard-store.ts, dashboard-store.test.ts |
| lib/dashboard/* | 3 | widget-registry.ts, layout-engine.ts, presets.ts (entire dir removed) |
| obsolete e2e | 1 | e2e/dashboard.spec.ts |

## Hook Export Cleanup Count

**Target:** 11+ exports + 1 type import

**Removed from use-dashboard.ts:**

| Export type | Count | Names |
| --- | --- | --- |
| `Options` factories | 6 | briefingOptions, deadlinesOptions, importantEmailsOptions, recentUnreadEmailsOptions, todayEventsOptions, triagedEmailsOptions |
| `use*` hooks | 6 | useBriefing, useDeadlines, useImportantEmails, useRecentUnreadEmails, useTodayEvents, useTriagedEmails |
| Layout/preferences | 4 | dashboardPreferencesOptions, useDashboardPreferences, useSaveDashboardLayout, getDefaultLayout |
| Type imports | 1 | `import type { WidgetLayout, DashboardLayout } from '@/lib/dashboard/layout-engine'` |
| Interfaces (now-unused) | 5 | BriefingData, Deadline, Email, CalendarEvent, TriagedEmail |
| Module imports (now-unused) | 4 | axios, useMutation, useQueryClient, calendarApi |

**Total: 16 exports + 1 type import + 5 interfaces + 4 module imports.**

## E2E Spec Resolution Choice

**Choice: Option A — DELETED.**

`frontend/e2e/dashboard.spec.ts` (104 lines) asserted against:
- `getByRole('button', { name: /customize/i })` — Customize button is gone (D-02).
- `page.locator('[class*="MuiCard-root"]')` — widget grid is gone (D-01).
- `page.locator('.MuiDrawer-root')` — CustomizeDrawer is gone.
- `page.locator('.MuiSwitch-root input[type="checkbox"]')` — widget toggle switches are gone.
- Layout persistence on reload — backend preferences endpoint unused (frontend no longer calls it).

Every single assertion targets a UI element this plan deletes. Rewriting to assert against TodayDashboard would be a fresh spec from scratch (different selectors, different interactions, different network calls) — that's a separate work item that should own its own E2E coverage. Deferred to whichever future phase wants to own the new dashboard E2E suite.

## Final Orphan-Import Grep Gauntlet Results

```bash
$ cd D:/MailAgent && \
> echo "=== DashboardContainer ==="            && grep -rln "from '@/components/dashboard/DashboardContainer'" frontend/ --include="*.tsx" --include="*.ts" | wc -l && \
> echo "=== dashboard/dashboard ==="            && grep -rln "from '@/components/dashboard/dashboard/" frontend/ --include="*.tsx" --include="*.ts" | wc -l && \
> echo "=== widgets ==="                        && grep -rln "from '@/components/dashboard/widgets/" frontend/ --include="*.tsx" --include="*.ts" | wc -l && \
> echo "=== CrmSuggestionsFeed ==="             && grep -rln "from '@/components/dashboard/CrmSuggestionsFeed'" frontend/ --include="*.tsx" --include="*.ts" | wc -l && \
> echo "=== dashboard-store ==="                && grep -rln "from '@/stores/dashboard-store'" frontend/ --include="*.tsx" --include="*.ts" | wc -l && \
> echo "=== lib/dashboard ==="                  && grep -rln "from '@/lib/dashboard/" frontend/ --include="*.tsx" --include="*.ts" | wc -l

=== DashboardContainer ===
0
=== dashboard/dashboard ===
0
=== widgets ===
0
=== CrmSuggestionsFeed ===
0
=== dashboard-store ===
0
=== lib/dashboard ===
0
```

**All zero.** No orphan imports anywhere in `frontend/`.

## Verification Results

| Check | Command | Result |
| --- | --- | --- |
| Frontend type-check | `cd frontend && npx tsc --noEmit` | exit 0 (clean) |
| Frontend lint (this plan's files) | `cd frontend && npm run lint` filtered to `(use-dashboard.ts\|today/\|pages/dashboard/index.tsx)` | 0 errors / 0 warnings in touched files |
| Frontend lint (project-wide) | `cd frontend && npm run lint` | 118 errors / 62 warnings (down from pre-deletion baseline 121/64; net reduction from deleting widget files that contained errors) — all remaining errors in unrelated files, logged in `deferred-items.md` |
| Frontend Jest (today/use-today) | `npx jest --testPathPatterns="(today\|use-today)"` | 4 suites / 30 tests, all pass |
| Frontend Jest (dashboard/today pattern) | `npx jest --testPathPatterns="(dashboard\|today)"` | 8/9 suites pass, 48/50 tests pass; 1 suite has 2 failures in `__tests__/pages/dashboard/invitations/accept.test.tsx` (verified pre-existing via `git stash` — failures exist on commit 7d07ea01 before Task 3 deletions) |
| Frontend Jest (full suite) | `npx jest --no-coverage --runInBand` | Aborts on `idb-keyval` `indexedDB is not defined` (Layout.test.tsx) — pre-existing Jest environment bug, NOT caused by this plan |
| Backend type-check | `cd backend && npx tsc --noEmit` | exit 0 (clean) |
| Backend dashboard specs | `cd backend && npx jest --testPathPatterns="dashboard"` | 4 suites / 43 tests, all pass (Plan 01 unaffected) |

## Deviations from Plan

### Auto-fixed / Plan-Override Issues

**1. [Rule 1 — Bug] Plan must_haves listed `useStaleContacts` and `useEmailTrends` as deletable, but Task 2 safety mandate required keeping them**

- **Found during:** Task 2 grep audit (before any deletion in `use-dashboard.ts`)
- **Issue:** The plan's `must_haves.truths` and Task 2 acceptance grep listed `useStaleContacts`, `staleContactsOptions`, `useEmailTrends`, and `emailTrendsOptions` as targets for deletion. The grep audit found two production importers OUTSIDE the safe widget-deletion set:
  - `useEmailTrends` ← `frontend/components/dashboard/AnalyticsChart.tsx` ← `frontend/pages/dashboard/analytics.tsx` (entire `/dashboard/analytics` page)
  - `useStaleContacts` ← `frontend/components/dashboard/contacts-page/useContactsPageData.ts` ← contacts page data hook (entire `/dashboard/contacts` data layer)
- The plan's Task 2 action block contains a safety mandate that overrides the must_haves: "If any importer outside the safe list appears, STOP and report — that hook may be needed elsewhere. Do NOT proceed with that hook's deletion."
- **Fix:** Kept `useStaleContacts`/`staleContactsOptions` and `useEmailTrends`/`emailTrendsOptions` in `use-dashboard.ts`. Documented the keep with inline JSDoc citing the importer. Updated my Task 2 commit message to call out the deviation.
- **Verification:** `grep useStaleContacts` and `grep useEmailTrends` in `frontend/` confirms both production pages still resolve their imports. Frontend type-check exits 0 — no broken imports anywhere.
- **Files modified:** `frontend/hooks/queries/use-dashboard.ts`
- **Committed in:** `7d07ea01` (Task 2)

**2. [Rule 1 — Bug] Plan delete list listed 21 files but actual count is 27**

- **Found during:** Task 3 staging
- **Issue:** Plan must_haves says "9 widget files + 6 dashboard/ subfolder files + dashboard-store + lib/dashboard/* + CrmSuggestionsFeed.tsx are deleted" = 9 + 6 + 1 + 3 + 1 = 20 (or 21 if you count both dashboard-store + .test.ts as one item or two). Actual deletions: 27 (8 entry chain + 9 widget production files + 4 widget tests + dashboard-store.ts + dashboard-store.test.ts + 1 CrmSuggestionsFeed + 3 lib/dashboard/* + 1 e2e spec).
- The plan's Task 3 file list (line 189) actually enumerates all 27 files explicitly, and the action block also includes the e2e spec as Step 7. The discrepancy is between the must_haves prose summary (≈21) and the actual itemized list (27).
- **Fix:** Followed the action block's itemized list (27 files), not the prose summary (21).
- **Verification:** `git status --short | grep -c "^D " = 27` after staging. `git diff --stat` shows 4,273 deletions across 27 files.

**3. [Rule 4-adjacent — Documented choice] e2e spec resolution = Option A (delete)**

- See "E2E Spec Resolution Choice" section above. Plan explicitly required documenting the choice in SUMMARY; Option A chosen because every assertion targets deleted UI.

**Total deviations:** 2 plan-overrides (Rule 1 safety > literal must_haves; deletion count discrepancy is just plan-internal inconsistency) + 1 documented choice (Option A).

## Issues Encountered

- **Stash/unstaged backend modifications:** When verifying that `accept.test.tsx` failure was pre-existing (`git stash`), the stash also surfaced two backend file modifications (`ai.controller.ts:716` change `status as FollowUpStatus` → `status`; `email-triage.service.ts:298,308` non-null assertion removals) that were ALREADY uncommitted before Task 3 started. These were NOT made by this plan — they're pre-existing dirty working-tree state. Left alone per CLAUDE.md SCOPE CONTROL. The post-stash-pop git status correctly shows them as unstaged ` M` entries while my deletions show as staged `D ` entries.
- **`indexedDB is not defined` blocks full Jest suite run:** Pre-existing Jest environment configuration issue with `idb-keyval` (which is a transitive dep of `serwist` via the offline-first PWA stack). The failure aborts the runner before printing summary numbers. NOT introduced by this plan — the same error occurs against commit `7d07ea01` (post-Task-2, pre-Task-3). Filtered runs (`--testPathPatterns`) work fine and show all dashboard/today tests pass.
- **Worktree was NOT used for this plan.** I am running directly in `D:/MailAgent` (cwd matches repo root, not a `.claude/worktrees/agent-*` path). The `<worktree_branch_check>` step in my prompt would have re-based against `6ae29a72` if my HEAD didn't have it as an ancestor — it does, so no reset needed. All commits (Task 1: `63356c36`, Task 2: `7d07ea01`, Task 3: `399d901d`) are on `main` directly.

## Known Stubs

None. All deletions are surgical and complete.

## Threat Flags

None. Trust boundaries unchanged:
- T-145-13 (deletion safety): mitigated by pre-delete grep audit on every file + post-delete orphan-import grep gauntlet (all 6 patterns return 0).
- T-145-14 (hook deletion safety): mitigated by per-hook grep before delete; surfaced two non-widget importers and kept those hooks.
- T-145-15 (stale e2e): mitigated by deleting the obsolete spec entirely.
- T-145-16 (auth bypass risk): mitigated — `<Layout><PageErrorBoundary>` wrapper preserved verbatim in Task 1.
- T-145-17 (cross-tenant data leak): pending — see Browser Checkpoint below.

## Deferred Issues

- **Backend cleanup of `PUT/GET /users/me/dashboard-preferences`** — deferred per plan's RESEARCH § State of the Art. The endpoint becomes unused once frontend stops calling it (which this plan accomplishes), but its server-side code is still live. Future cleanup phase should drop the controller + service + DB columns.
- **`AnalyticsChart.tsx` and `useContactsPageData.ts` still depend on `useEmailTrends`/`useStaleContacts`** — these hooks live in `use-dashboard.ts` despite no longer being "dashboard hooks". A future tidy-up could relocate them to `use-analytics.ts` and `use-contacts.ts` respectively, but that's out of scope here.
- **Pre-existing lint errors (118 errors / 62 warnings)** in unrelated files — already logged in `.planning/phases/145-smart-today-dashboard/deferred-items.md` from Plan 02.
- **Pre-existing `accept.test.tsx` failure (2 tests)** in `frontend/__tests__/pages/dashboard/invitations/accept.test.tsx` — confirmed unrelated to this plan via `git stash` test. Should be filed as a separate bug.
- **Pre-existing `indexedDB is not defined` Jest environment bug** in suites importing `serwist`/`idb-keyval` (Layout.test.tsx and others). Should be filed as a separate Jest config bug.

## Browser Checkpoint Status

**Cannot fully automate.** The Edge CDP E2E checkpoint required by `feedback_e2e_validation_mandatory.md` needs three live processes that are not currently running:

1. Frontend dev server on `:3001` — `curl http://localhost:3001` returned exit 7 (connection refused).
2. Backend dev server on `:3000` — `curl http://localhost:3000/api/v1/dashboard/today` returned exit 7.
3. Edge with `--remote-debugging-port=9222` — `curl http://127.0.0.1:9222/json/version` returned exit 7.

**Why I'm not auto-starting them:**
- Backend `npm run start:dev` requires Postgres + Redis + 100+ env vars (better-auth secrets, encryption keys, AI provider tokens). Starting it from a long-lived background bash is risky — env-driven misconfig could write to the wrong DB.
- Frontend dev server on Next.js 16 in dev mode can be launched safely, but without backend it just shows auth errors.
- Edge CDP requires the user to first close their existing Edge windows so the new process can bind 9222 (per `reference_playwright_debug.md`). Doing this from the executor would close the user's active browser session.

**Returning to orchestrator with a `human-verify` checkpoint** so the user can either:
- Approve based on the automated checks (type-check + scoped Jest + grep gauntlet all green; backend Plan 01 specs untouched) — appropriate if local stack is not running
- Run the manual E2E flow per the plan's 11-step verification list

## Phase 145 Closeout (per plan's `<output>` section)

The plan instructs that this SUMMARY should also note:
- **NAV-05 marked Complete in REQUIREMENTS.md** — orchestrator owns this write per executor prompt instructions ("Do NOT update STATE.md or ROADMAP.md")
- **Phase 145 marked Complete in ROADMAP.md** — same; orchestrator-owned

Both are deferred to the orchestrator step that follows browser-checkpoint approval.

## Self-Check: PASSED

Verified at execution time:

- File existence: `frontend/pages/dashboard/index.tsx` (modified) and `frontend/hooks/queries/use-dashboard.ts` (modified) confirmed via `git log --stat`. All 27 deletion targets confirmed gone via `ls` and the orphan-import grep gauntlet.
- Commits on main: `63356c36` (Task 1), `7d07ea01` (Task 2), `399d901d` (Task 3) — verified via `git log --oneline`.
- Type-check: frontend exit 0; backend exit 0.
- Jest scoped: today/use-today 30/30 pass; backend dashboard 43/43 pass.
- Orphan-import grep gauntlet: all 6 patterns return 0.
- Acceptance criterion greps for Task 1: `TodayDashboard` count = 2, `DashboardContainer` count = 0, `from '@/components/dashboard/today'` count = 1, file is 21 lines.
- Acceptance criterion greps for Task 2: only `useEmailTrends` and `emailTrendsOptions` remain in the literal regex (intentional keeps; `useStaleContacts` was not in the regex but also kept). File is 309 lines (target was "under ~300", close enough; the 9-line overage is the JSDoc comments justifying the kept exports).
- Acceptance criterion checks for Task 3: all file-existence checks negative (`ls X` returns "No such file"); all grep gauntlet patterns return 0.

---
*Phase: 145-smart-today-dashboard*
*Plan: 03*
*Completed: 2026-04-17 (pending Task 4 browser checkpoint approval)*
