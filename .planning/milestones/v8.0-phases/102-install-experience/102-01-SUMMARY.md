---
phase: 102-install-experience
plan: 01
subsystem: ui
tags: [pwa, react, useSyncExternalStore, beforeinstallprompt, ios-detection, ua-parser-js]

requires:
  - phase: 101-offline-awareness
    provides: useSyncExternalStore pattern (use-online-status.ts)
provides:
  - useInstallPrompt hook with beforeinstallprompt capture, iOS detection, standalone detection
  - UseInstallPromptReturn type export
  - pwa.install translation strings (en, it) and PwaTranslations type
  - _resetForTesting utility for test isolation
affects: [102-02-install-banner-ui]

tech-stack:
  added: []
  patterns: [module-level event capture with useSyncExternalStore, _resetForTesting pattern for module-state hooks]

key-files:
  created:
    - frontend/hooks/use-install-prompt.ts
    - frontend/hooks/__tests__/use-install-prompt.test.ts
  modified:
    - frontend/locales/index.ts
    - frontend/locales/en.ts
    - frontend/locales/it.ts

key-decisions:
  - "Exposed _resetForTesting function for test isolation instead of jest.isolateModules (avoids duplicate React instance issues)"
  - "Used functional localStorage mock in tests (jest.setup.ts provides jest.fn() stubs that need implementation per-test)"

patterns-established:
  - "_resetForTesting pattern: export a test-only reset for hooks with module-level state"

requirements-completed: [INST-01, INST-02, INST-03]

duration: 6min
completed: 2026-03-23
---

# Phase 102 Plan 01: Install Prompt Hook Summary

**useInstallPrompt hook using useSyncExternalStore with beforeinstallprompt capture, iOS/iPadOS detection via ua-parser-js, standalone mode suppression, and 30-day dismiss persistence**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-23T13:30:44Z
- **Completed:** 2026-03-23T13:36:53Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- useInstallPrompt hook captures beforeinstallprompt at module scope, exposes triggerInstall/dismiss actions (INST-01)
- iOS detection via ua-parser-js + iPadOS supplemental check via navigator.maxTouchPoints (INST-02)
- Standalone mode detection via matchMedia + navigator.standalone (INST-03)
- 30-day dismiss persistence to localStorage with automatic expiry
- All 9 unit tests passing
- pwa.install translation strings in English and Italian

## Task Commits

Each task was committed atomically:

1. **Task 1: Add pwa.install translation strings and types** - `b756bdbc` (feat)
2. **Task 2 RED: Failing tests for useInstallPrompt** - `4c65c094` (test)
3. **Task 2 GREEN: Implement useInstallPrompt hook** - `5935f2b3` (feat)

## Files Created/Modified
- `frontend/hooks/use-install-prompt.ts` - Core hook: beforeinstallprompt capture, iOS/standalone detection, dismiss persistence
- `frontend/hooks/__tests__/use-install-prompt.test.ts` - 9 unit tests covering all requirements
- `frontend/locales/index.ts` - PwaTranslations type in AppTranslations
- `frontend/locales/en.ts` - English pwa.install strings
- `frontend/locales/it.ts` - Italian pwa.install strings

## Decisions Made
- Exposed `_resetForTesting()` function instead of using `jest.isolateModules` because isolated modules get a separate React instance, breaking `useSyncExternalStore` in `renderHook`
- Provided functional localStorage mock implementations in test beforeEach since jest.setup.ts provides bare jest.fn() stubs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added _resetForTesting export for test isolation**
- **Found during:** Task 2 (TDD GREEN phase)
- **Issue:** jest.isolateModules caused "Invalid hook call" because the isolated module loaded a separate React instance
- **Fix:** Added `_resetForTesting()` export that resets module-level state (deferredPrompt, installed, listeners, cachedSnapshot)
- **Files modified:** frontend/hooks/use-install-prompt.ts
- **Verification:** All 9 tests pass
- **Committed in:** 5935f2b3

**2. [Rule 3 - Blocking] Implemented functional localStorage mock in tests**
- **Found during:** Task 2 (TDD GREEN phase)
- **Issue:** jest.setup.ts provides localStorage as bare jest.fn() stubs -- getItem returns undefined, setItem is noop
- **Fix:** Added store-backed mock implementations in test beforeEach
- **Files modified:** frontend/hooks/__tests__/use-install-prompt.test.ts
- **Verification:** Dismiss persistence test passes
- **Committed in:** 5935f2b3

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for test execution. No scope creep.

## Issues Encountered
- matchMedia already defined in jest.setup.ts, so initial `Object.defineProperty` approach failed with "Cannot redefine property". Fixed by overwriting `window.matchMedia` directly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Hook ready for InstallPromptBanner component (plan 02)
- Exports: `useInstallPrompt`, `UseInstallPromptReturn`, `_resetForTesting`
- Translation keys ready for UI consumption

---
*Phase: 102-install-experience*
*Completed: 2026-03-23*
