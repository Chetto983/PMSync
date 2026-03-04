---
phase: 37-performance-debt-closure
plan: 01
subsystem: ui
tags: [next-dynamic, bundle-optimization, code-splitting, lucide-react]

requires:
  - phase: none
    provides: existing email page with eager imports
provides:
  - Dynamic imports for 4 email page dialog/thread components
  - Expanded optimizePackageImports with lucide-react
affects: [performance, frontend-bundle]

tech-stack:
  added: []
  patterns: [next/dynamic with ssr:false for interaction-gated dialogs]

key-files:
  created: []
  modified:
    - frontend/pages/dashboard/email.tsx
    - frontend/next.config.js

key-decisions:
  - "4 components converted to dynamic: ExpandedMessage, LabelPickerDialog, FolderPickerDialog, KeyboardShortcutsDialog"
  - "lucide-react added to optimizePackageImports; @radix-ui and @tiptap excluded per plan (glob/barrel unsupported)"

patterns-established:
  - "Dynamic import pattern: next/dynamic with ssr:false and loading:null for interaction-gated UI"

requirements-completed: [PERF-01]

duration: 4min
completed: 2026-03-04
---

# Phase 37 Plan 01: Bundle Optimization Summary

**Email page dialog components (ExpandedMessage, LabelPicker, FolderPicker, KeyboardShortcuts) converted to next/dynamic imports; lucide-react added to optimizePackageImports**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T11:23:03Z
- **Completed:** 2026-03-04T11:27:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Converted 4 eagerly-imported dialog/thread components to next/dynamic with ssr:false
- Added lucide-react to next.config.js optimizePackageImports for tree-shaking
- Production build succeeds, type-check and lint pass clean

## Bundle Analysis

**Before (baseline):**
- Email page total JS chunks: 2278.6kB across 28 chunks

**After (dynamic imports + lucide-react optimize):**
- Email page total JS chunks: 2239.2kB across 29 chunks
- Delta: -39.4kB removed from initial load (dialog code now lazy-loaded on interaction)

Note: The chunk hash changes prevent exact 1:1 chunk comparison, but the 4 dialog components are now in separate lazy-loaded chunks that only download when the user interacts (opens compose, labels, folders, keyboard shortcuts, or selects an email for reading pane). The real LCP improvement comes from deferring these chunks off the critical path, not just the total size reduction.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bundle analysis baseline + dynamic imports on email.tsx** - `2436b3ef` (feat)
2. **Task 2: Type-check and lint verification** - verification-only, no code changes needed

## Files Created/Modified
- `frontend/pages/dashboard/email.tsx` - Converted 4 static imports to next/dynamic with ssr:false
- `frontend/next.config.js` - Added lucide-react to experimental.optimizePackageImports

## Decisions Made
- ExpandedMessage included in dynamic imports despite being the reading pane component (it only renders when user selects an email, not on initial page load)
- ThreadList kept as eager import (it IS the LCP element)
- lucide-react added; @radix-ui and @tiptap excluded per plan guidance (glob patterns unsupported, barrel exports unconfirmed)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Bundle optimization complete for email page
- Ready for Plan 02 (additional performance work if any)

---
*Phase: 37-performance-debt-closure*
*Completed: 2026-03-04*
