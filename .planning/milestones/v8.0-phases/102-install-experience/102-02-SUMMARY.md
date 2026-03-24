---
phase: 102-install-experience
plan: 02
subsystem: ui
tags: [pwa, mui, snackbar, dialog, install-prompt, ios-instructions]

requires:
  - phase: 102-01-install-prompt-hook
    provides: useInstallPrompt hook (shouldShow, isIOS, triggerInstall, dismiss)
provides:
  - InstallPromptBanner component with Chromium Snackbar and iOS Snackbar + Dialog
  - Layout.tsx integration for install prompt on all authenticated pages
affects: []

tech-stack:
  added: []
  patterns: [MUI Snackbar/Alert for conditional banners, Dialog for iOS step-by-step instructions]

key-files:
  created:
    - frontend/components/layout/InstallPromptBanner.tsx
  modified:
    - frontend/components/layout/Layout.tsx

key-decisions:
  - "Positioned InstallPromptBanner after sync status Snackbar and before CookieConsent in Layout.tsx"

patterns-established:
  - "Conditional Snackbar pattern: MUI Snackbar open prop driven by hook state, two Snackbars for platform branching"

requirements-completed: [INST-01, INST-02, INST-03]

duration: 4min
completed: 2026-03-23
---

# Phase 102 Plan 02: Install Banner UI Summary

**InstallPromptBanner component with Chromium install Snackbar (accept/dismiss) and iOS instructions Snackbar + Dialog, wired into Layout.tsx**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-23T13:38:00Z
- **Completed:** 2026-03-23T13:55:00Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- Chromium users see bottom-center Snackbar with "Install App" button and dismiss icon (INST-01)
- iOS users see Snackbar with "Learn how" button opening a 3-step Dialog with instructions (INST-02)
- Standalone mode suppresses all install UI via hook logic (INST-03)
- Component integrated into Layout.tsx alongside OfflineBanner
- Human verification passed on desktop Chrome

## Task Commits

Each task was committed atomically:

1. **Task 1: Create InstallPromptBanner component** - `34d23376` (feat)
2. **Task 2: Wire InstallPromptBanner into Layout.tsx** - `53081267` (feat)
3. **Task 3: Verify install experience on desktop Chrome** - checkpoint:human-verify (approved, no commit)

## Files Created/Modified
- `frontend/components/layout/InstallPromptBanner.tsx` - PWA install banner: Chromium Snackbar with accept/dismiss, iOS Snackbar with learn-how, iOS Dialog with 3-step instructions
- `frontend/components/layout/Layout.tsx` - Added InstallPromptBanner import and render before CookieConsent

## Decisions Made
- Positioned InstallPromptBanner after sync status Snackbar and before CookieConsent in Layout render order

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 102 (install-experience) is complete -- all plans executed
- PWA install prompt fully functional for Chromium and iOS
- Ready for Phase 103 (offline data persistence) or next milestone phase

## Self-Check: PASSED

- [x] frontend/components/layout/InstallPromptBanner.tsx exists
- [x] frontend/components/layout/Layout.tsx exists
- [x] Commit 34d23376 found
- [x] Commit 53081267 found

---
*Phase: 102-install-experience*
*Completed: 2026-03-23*
