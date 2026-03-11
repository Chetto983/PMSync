---
phase: 70-frontend-unit-tests
plan: 02
subsystem: frontend/hooks
tags: [testing, tanstack-query, hooks, unit-tests]
dependency_graph:
  requires: []
  provides: [FTEST-02]
  affects: [frontend/hooks/queries]
tech_stack:
  added: []
  patterns:
    - "Query key tests: pure queryOptions() call + toEqual assertion, no QueryClient wrapper"
    - "isError tests: waitFor with { timeout: 5000 } when query has retry:1 at options level"
    - "Mutation tests: act(async () => mutateAsync()) + jest.spyOn(queryClient, 'invalidateQueries')"
    - "better-auth ESM block: mock @/lib/auth-client in any test whose import chain reaches it"
key_files:
  created:
    - frontend/hooks/queries/use-emails.test.ts
    - frontend/hooks/queries/use-folders.test.ts
    - frontend/hooks/queries/use-contacts.test.ts
    - frontend/hooks/queries/use-organizations.test.ts
    - frontend/hooks/queries/use-settings.test.ts
    - frontend/hooks/queries/use-providers.test.ts
    - frontend/hooks/queries/use-labels.test.ts
    - frontend/hooks/queries/use-folder-metadata.test.ts
    - frontend/hooks/queries/use-billing.test.ts
    - frontend/hooks/queries/use-subscription-limits.test.ts
  modified: []
decisions:
  - "waitFor timeout: 5000ms for queries with retry:1 at options level — default 1000ms insufficient for exponential backoff"
  - "better-auth ESM mock: any test file whose import chain reaches @/lib/auth-client needs jest.mock('@/lib/auth-client') to prevent SyntaxError"
  - "use-emails mock chain: requires @/lib/api/folders + @/lib/auth-client mocks because use-emails.ts imports folderKeys from use-folders.ts"
  - "Task 1 files (use-emails, use-folders, use-contacts, use-organizations) were committed by parallel 70-03 agent — verified identical content, adopted as-is"
metrics:
  duration: 18min
  completed_date: "2026-03-11"
  tasks_completed: 2
  files_created: 10
---

# Phase 70 Plan 02: Query Hook Unit Tests Summary

10 TanStack Query hook test files, 58 tests total, covering query key construction, loading/error/success states, and cache invalidation after mutations.

## What Was Built

10 test files co-located with source hooks in `frontend/hooks/queries/`. Each file tests:
1. **Query key construction** — calls `xyzOptions()` directly, asserts `.queryKey` shape. No wrapper needed.
2. **Error states** — `renderHook` + `waitFor(isError, { timeout: 5000 })` for queries with `retry:1`.
3. **Success states** — mock API returns resolved value, `waitFor(data)`.
4. **Mutations** (emails, settings) — `act(mutateAsync)` + `jest.spyOn(invalidateQueries)`.

## Test Results

```
Test Suites: 10 passed, 10 total
Tests:       58 passed, 58 total
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] better-auth ESM import chain breaks tests**
- **Found during:** Task 1 (use-emails, use-folders)
- **Issue:** `use-emails.ts` imports `folderKeys` from `use-folders.ts`, which imports `@/lib/api/folders`, which imports `@/lib/auth-client` (better-auth ESM — `SyntaxError: Cannot use import statement outside a module`)
- **Fix:** Added `jest.mock('@/lib/auth-client', ...)` and `jest.mock('@/lib/api/folders', ...)` to `use-emails.test.ts`. Added `jest.mock('@/lib/auth-client', ...)` to `use-folder-metadata.test.ts` and `use-subscription-limits.test.ts`
- **Files modified:** use-emails.test.ts, use-folder-metadata.test.ts, use-subscription-limits.test.ts

**2. [Rule 1 - Bug] isError tests timing out with default waitFor**
- **Found during:** Task 1 (use-organizations) and Task 2 (use-settings, use-billing, use-folder-metadata)
- **Issue:** Queries with `retry: 1` in their options override the QueryClient's `retry: false` default. With exponential backoff, retrying once takes > 1s, exceeding `waitFor`'s 1000ms default timeout.
- **Fix:** Added `{ timeout: 5000 }` to all `waitFor(isError)` calls on hooks with `retry: 1` query options.
- **Files modified:** use-organizations.test.ts, use-settings.test.ts, use-billing.test.ts, use-folder-metadata.test.ts

**3. [Rule 1 - Bug] UpdatePreferencesData type — `locale` field doesn't exist**
- **Found during:** Task 2 (use-settings), TypeScript check
- **Issue:** Plan example used `{ locale: 'en' }` but `UpdatePreferencesData` uses `language` not `locale`
- **Fix:** Changed mutation test args to `{ language: 'en' }` / `{ language: 'it' }`
- **Files modified:** use-settings.test.ts

### Parallel Agent Note

Task 1 files (use-emails, use-folders, use-contacts, use-organizations) were committed by the parallel 70-03 agent at `63f11a1b`. Content verified identical to what this agent wrote. Task 2 commit at `3d13afab`.

## Self-Check: PASSED

All 10 test files exist on disk. Task 1 commit `63f11a1b` and Task 2 commit `3d13afab` verified in git log.
