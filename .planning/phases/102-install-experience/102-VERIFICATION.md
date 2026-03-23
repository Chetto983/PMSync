---
phase: 102-install-experience
verified: 2026-03-23T14:10:00Z
status: human_needed
score: 9/9 must-haves verified
human_verification:
  - test: "Chromium install Snackbar appears on desktop Chrome"
    expected: "Bottom-center Snackbar visible with 'Install PMSync for a faster, native-like experience', Install App button, and X dismiss icon"
    why_human: "beforeinstallprompt only fires when Chrome deems app installable (valid manifest + SW). Cannot simulate in static analysis."
  - test: "Install App button triggers Chrome native install dialog"
    expected: "Clicking Install App calls triggerInstall(), Chrome shows OS-level install dialog"
    why_human: "Requires live browser interaction with BeforeInstallPromptEvent.prompt()"
  - test: "Dismiss persists across page reload"
    expected: "After clicking X, refresh page, Snackbar does not reappear (localStorage pmsync:install-prompt-dismissed present)"
    why_human: "Requires live browser DevTools inspection of localStorage"
  - test: "iOS path on simulated iPhone UA"
    expected: "With iPhone UA in DevTools device toolbar: Snackbar shows 'Add PMSync to your home screen' and 'Learn how' button; clicking Learn how opens Dialog with 3 numbered steps"
    why_human: "Requires DevTools device simulation and visual confirmation of Dialog content"
  - test: "Standalone mode suppresses all install UI"
    expected: "When app is open as installed PWA (standalone), no Snackbar appears"
    why_human: "Requires actually installing the PWA to test standalone detection branch"
---

# Phase 102: Install Experience Verification Report

**Phase Goal:** beforeinstallprompt for Android/desktop, iOS instructions, standalone detection
**Verified:** 2026-03-23T14:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | useInstallPrompt captures beforeinstallprompt and exposes shouldShow=true on Chromium | VERIFIED | Hook registers listener at module scope (line 38), sets deferredPrompt, calls notify(). Test "returns shouldShow=true when beforeinstallprompt fires" passes. |
| 2 | useInstallPrompt detects iOS and sets isIOS=true | VERIFIED | getIsIOS() uses ua-parser-js + navigator.maxTouchPoints iPadOS fallback (lines 70-81). Tests "returns isIOS=true on iOS userAgent" and "detects iPadOS via maxTouchPoints" pass. |
| 3 | useInstallPrompt detects standalone mode and returns shouldShow=false | VERIFIED | getIsStandalone() checks navigator.standalone and matchMedia (lines 56-68). shouldShow formula at line 122-123 gates on !isStandalone. Tests "returns shouldShow=false in standalone mode" and "returns shouldShow=false when navigator.standalone is true" pass. |
| 4 | User dismiss persists to localStorage for 30 days | VERIFIED | DISMISS_KEY='pmsync:install-prompt-dismissed', DISMISS_DURATION_MS=30 days (lines 24-25). isDismissedByUser() parses timestamp and compares. Tests "dismiss persists to localStorage" and "dismiss expires after 30 days" pass. |
| 5 | All user-facing strings are in translation files | VERIFIED | pwa.install.* section exists in en.ts (line 4128+), it.ts (line 4105+), and AppTranslations type in index.ts (lines 3959+). Component uses t.pwa?.install?.* with hardcoded fallbacks only as safety net. |
| 6 | Chromium users see install Snackbar with accept/dismiss | VERIFIED | InstallPromptBanner.tsx lines 18-47: Snackbar open={shouldShow && !isIOS}, contains Install App button (triggerInstall) and X IconButton (dismiss). |
| 7 | iOS users see Snackbar with Learn how button opening 3-step Dialog | VERIFIED | Lines 50-100: iOS Snackbar open={shouldShow && isIOS}, Learn how button sets iosDialogOpen=true, Dialog renders iosStep1/iosStep2/iosStep3. |
| 8 | No install UI when app in standalone mode | VERIFIED | shouldShow=false when standalone (hook logic). Both Snackbars have open prop gated on shouldShow. Component renders nothing visible. |
| 9 | InstallPromptBanner rendered in Layout.tsx | VERIFIED | Layout.tsx line 18: import statement confirmed. Line 185: <InstallPromptBanner /> confirmed. |

**Score:** 9/9 truths verified (automated)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/hooks/use-install-prompt.ts` | Hook with useSyncExternalStore, INST-01/02/03 | VERIFIED | 173 lines, exports useInstallPrompt + UseInstallPromptReturn + _resetForTesting. All required patterns present. |
| `frontend/hooks/__tests__/use-install-prompt.test.ts` | 9 unit tests, min 80 lines | VERIFIED | 201 lines, 9 test cases, all passing (confirmed by test run). |
| `frontend/locales/en.ts` | English pwa.install translations | VERIFIED | pwa.install section present at line 4128. Contains chromiumMessage, accept, dismiss, dismissAriaLabel, iosMessage, iosLearnHow, iosTitle, iosStep1, iosStep2, iosStep3. |
| `frontend/locales/it.ts` | Italian pwa.install translations | VERIFIED | pwa.install section present at line 4105. All 10 keys present in Italian. |
| `frontend/locales/index.ts` | PwaTranslations type in AppTranslations | VERIFIED | pwa?: { install?: { ... } } present at lines 3959-3973. All fields typed as optional strings. |
| `frontend/components/layout/InstallPromptBanner.tsx` | PWA install banner, min 50 lines | VERIFIED | 104 lines. Named export InstallPromptBanner. Chromium Snackbar, iOS Snackbar, iOS Dialog all present. |
| `frontend/components/layout/Layout.tsx` | Contains InstallPromptBanner import and render | VERIFIED | Import at line 18, render at line 185. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| use-install-prompt.ts | window beforeinstallprompt event | addEventListener at module scope | WIRED | Line 38: `window.addEventListener('beforeinstallprompt', ...)` inside `typeof window !== 'undefined'` guard |
| use-install-prompt.ts | localStorage | pmsync:install-prompt-dismissed key | WIRED | DISMISS_KEY constant at line 24, used in isDismissedByUser() and dismissPrompt() |
| InstallPromptBanner.tsx | use-install-prompt.ts | import { useInstallPrompt } | WIRED | Line 7: `import { useInstallPrompt } from '@/hooks/use-install-prompt'`. Hook called at line 11. |
| InstallPromptBanner.tsx | locales | useTranslations() t.pwa.install.* | WIRED | Line 8: import. Line 12: const t = useTranslations(). t.pwa?.install?.* used throughout. |
| Layout.tsx | InstallPromptBanner.tsx | import { InstallPromptBanner } | WIRED | Line 18 import, line 185 render confirmed. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| INST-01 | 102-01, 102-02 | User on Android/desktop Chrome sees install prompt via beforeinstallprompt with dismiss/accept | SATISFIED | Hook captures beforeinstallprompt (line 38), deferredPrompt.prompt() called on accept (triggerInstall), dismiss() persists to localStorage. InstallPromptBanner renders Chromium Snackbar with both actions. |
| INST-02 | 102-01, 102-02 | User on iOS sees "Add to Home Screen" instructions with share icon guidance | SATISFIED | getIsIOS() detects iOS via ua-parser-js + iPadOS fallback. iOS Snackbar with "Learn how" opens Dialog with 3-step instructions including Share button reference. |
| INST-03 | 102-01, 102-02 | Install prompt hidden when app already running in standalone mode | SATISFIED | getIsStandalone() gates shouldShow. Both Snackbars use shouldShow in open prop. appinstalled event also hides prompt permanently. |

No orphaned requirements: REQUIREMENTS.md maps only INST-01, INST-02, INST-03 to Phase 102. Both plans claim exactly these three IDs. Full coverage.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| use-install-prompt.ts | 151 | `return null` in triggerInstall | INFO | Intentional guard — no deferred prompt available. Not a stub. |

No TODO/FIXME/HACK/PLACEHOLDER comments found in any phase 102 files. No empty implementations. No console.log-only handlers.

### Human Verification Required

#### 1. Chromium Install Snackbar Appears

**Test:** Open PMSync in desktop Chrome at http://localhost:3001. Ensure the app has a valid manifest + service worker from Phase 100 (prerequisites for beforeinstallprompt).
**Expected:** Bottom-center Snackbar: "Install PMSync for a faster, native-like experience" with "Install App" button and X icon.
**Why human:** beforeinstallprompt only fires when Chrome's installability criteria are met. Static analysis cannot simulate this browser heuristic.

#### 2. Install App Button Triggers Native Dialog

**Test:** Click the "Install App" button in the Snackbar.
**Expected:** Chrome OS-level install dialog appears. After accepting or dismissing, the Snackbar disappears.
**Why human:** Requires live BeforeInstallPromptEvent.prompt() browser API invocation.

#### 3. Dismiss Persists Across Reload

**Test:** Click X (dismiss). Reload the page.
**Expected:** Snackbar does not reappear. Open DevTools > Application > Local Storage and confirm key `pmsync:install-prompt-dismissed` is set with a recent timestamp.
**Why human:** Requires live browser session and DevTools inspection.

#### 4. iOS Path via DevTools Device Simulation

**Test:** Open DevTools > device toolbar > select an iPhone UA. Reload.
**Expected:** Snackbar shows "Add PMSync to your home screen" with "Learn how" button. Clicking "Learn how" opens a Dialog with three numbered steps referencing the Share button and "Add to Home Screen" menu item.
**Why human:** Requires DevTools device mode and visual confirmation of Dialog rendering.

#### 5. Standalone Mode Suppresses All UI

**Test:** Install the PWA from Chromium (see test 2). Open it from the OS launcher/home screen (standalone mode).
**Expected:** No Snackbar visible anywhere on any page within the installed PWA.
**Why human:** Requires the app to actually be installed and launched in standalone mode.

### Gaps Summary

No automated gaps found. All 9 observable truths verified against the codebase. All 7 artifacts exist and are substantive. All 5 key links are wired. All 3 requirement IDs (INST-01, INST-02, INST-03) are covered with implementation evidence. 9/9 unit tests pass. TypeScript type-check passes clean. 5 documented commits (b756bdbc, 4c65c094, 5935f2b3, 34d23376, 53081267) all confirmed in git history.

Status is human_needed — not gaps_found — because the 5 human verification items are browser-interaction checks (install prompt trigger, iOS simulation, standalone mode) that cannot be verified programmatically. The code paths for all three behaviors are fully implemented and wired.

---

_Verified: 2026-03-23T14:10:00Z_
_Verifier: Claude (gsd-verifier)_
