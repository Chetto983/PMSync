---
phase: 03-email-list-thread-display
plan: 01
subsystem: ui
tags: [tanstack-query, prefetch, toast, mui, react]

# Dependency graph
requires:
  - phase: 02-frontend-core-setup
    provides: Email list components, TanStack Query hooks, folder sidebar
provides:
  - Prefetch-on-hover for email threads and folders
  - Global toast context for mutation error feedback
  - Optimistic update rollback notifications
affects: [04-email-composer, 05-advanced-features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Debounced prefetch (300ms) with cleanup on mouse leave
    - Global toast singleton via useEffect for non-React contexts

key-files:
  created:
    - frontend/lib/context/toast-context.tsx
  modified:
    - frontend/components/email/list/ThreadListItem.tsx
    - frontend/components/email/sidebar/FolderItem.tsx
    - frontend/components/email/sidebar/SortableFolderItem.tsx
    - frontend/components/email/sidebar/FolderSidebar.tsx
    - frontend/hooks/queries/use-emails.ts
    - frontend/pages/_app.tsx

key-decisions:
  - "300ms debounce for prefetch to avoid API flood on fast mouse movements"
  - "staleTime 30s prevents redundant prefetch of recently fetched data"
  - "Global toast via useEffect to satisfy React hooks lint rules"
  - "Map JUNK to SPAM for API compatibility in folder prefetch"

patterns-established:
  - "Prefetch pattern: setTimeout 300ms + cleanup on mouse leave + staleTime guard"
  - "Global toast pattern: useMemo for context value + useEffect to set singleton ref"

# Metrics
duration: 11min
completed: 2026-02-02
---

# Phase 03 Plan 01: Email List Prefetch + Toast Summary

**Prefetch-on-hover for email threads and folders with global toast notifications on mutation errors**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-02T20:53:53Z
- **Completed:** 2026-02-02T21:04:45Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Thread data prefetches when user hovers email row for 300ms
- Folder emails prefetch when user hovers sidebar folder for 300ms
- All email mutations show toast notification on error (14 mutation hooks updated)
- Optimistic updates roll back and notify user on failure

## Task Commits

Each task was committed atomically:

1. **Task 1: Add prefetch-on-hover to ThreadListItem** - `d5f67b42` (feat)
2. **Task 2: Add prefetch-on-hover to FolderSidebar** - `8cf63816` (feat)
3. **Task 3: Create global toast context and add toast to mutation onError handlers** - `1c7fc871` (feat)

## Files Created/Modified
- `frontend/lib/context/toast-context.tsx` - Global toast provider with getGlobalToast() for TanStack Query callbacks
- `frontend/components/email/list/ThreadListItem.tsx` - Added prefetchQuery on 300ms hover
- `frontend/components/email/sidebar/FolderItem.tsx` - Added onMouseEnter/onMouseLeave props
- `frontend/components/email/sidebar/SortableFolderItem.tsx` - Added onMouseEnter/onMouseLeave props
- `frontend/components/email/sidebar/FolderSidebar.tsx` - Added prefetch handlers for aggregated and provider folders
- `frontend/hooks/queries/use-emails.ts` - Added onError with getGlobalToast().error() to 14 mutations
- `frontend/pages/_app.tsx` - Wrapped app with ToastProvider

## Decisions Made
- **300ms debounce for prefetch:** Prevents API flood when user quickly moves mouse across list items
- **staleTime 30s guard:** Prevents redundant prefetch of recently fetched data (within 30s)
- **useMemo + useEffect pattern for global toast:** Satisfies React hooks lint rules while still exposing global singleton
- **Map JUNK to SPAM:** API only accepts specific specialUse values; JUNK is frontend alias

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed TypeScript error: SpecialFolder type mismatch**
- **Found during:** Task 2 (FolderSidebar prefetch)
- **Issue:** SpecialFolder includes JUNK, but API specialUse only accepts INBOX/SENT/DRAFTS/TRASH/SPAM/ARCHIVE
- **Fix:** Added type check and mapping of JUNK to SPAM before API call
- **Files modified:** frontend/components/email/sidebar/FolderSidebar.tsx
- **Verification:** type-check passes
- **Committed in:** 8cf63816

**2. [Rule 3 - Blocking] Fixed TypeScript error: folderId vs folder param name**
- **Found during:** Task 2 (FolderSidebar prefetch)
- **Issue:** Plan used `folderId` but API param is `folder`
- **Fix:** Changed param name to `folder`
- **Files modified:** frontend/components/email/sidebar/FolderSidebar.tsx
- **Verification:** type-check passes
- **Committed in:** 8cf63816

**3. [Rule 3 - Blocking] Fixed React hooks lint errors in toast-context**
- **Found during:** Task 3 (toast context creation)
- **Issue:** Initial implementation assigned globalToast during render (side effect) and accessed ref during render
- **Fix:** Used useMemo for context value, useEffect to set global ref, ref object pattern for singleton
- **Files modified:** frontend/lib/context/toast-context.tsx
- **Verification:** lint passes with --max-warnings=0
- **Committed in:** 1c7fc871

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None - deviations were handled automatically via deviation rules.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PERF-05 (optimistic updates with toast) and PERF-06 (query prefetching) now complete
- Frontend email list and folder navigation ready for Phase 04 (Email Composer)
- No blockers

---
*Phase: 03-email-list-thread-display*
*Completed: 2026-02-02*
