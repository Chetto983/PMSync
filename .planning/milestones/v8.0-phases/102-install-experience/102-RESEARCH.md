# Phase 102: Install Experience - Research

**Researched:** 2026-03-23
**Domain:** PWA Installation UX (beforeinstallprompt, iOS manual install, standalone detection)
**Confidence:** HIGH

## Summary

This phase implements the install experience for PMSync as a PWA. The work splits cleanly into three parts: (1) capturing the `beforeinstallprompt` event on Chromium browsers to show a custom install banner with accept/dismiss, (2) detecting iOS Safari and showing manual "Add to Home Screen" instructions since iOS has no `beforeinstallprompt` support, and (3) suppressing all install prompts when the app is already running in standalone display mode.

The project already has `ua-parser-js` installed (used in SecuritySessionsSection.tsx for parsing browser/OS info), the `useSyncExternalStore` pattern established (use-online-status.ts), MUI component library, and a translations system. No new dependencies are needed. The existing `OfflineBanner` in the Layout provides a reference pattern for a dismissible banner wired into the main layout.

**Primary recommendation:** Create a `useInstallPrompt` hook using `useSyncExternalStore` (matching the existing `useOnlineStatus` pattern), an `InstallPromptBanner` MUI component, and wire it into `Layout.tsx` alongside the existing `OfflineBanner`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INST-01 | User on Android/desktop Chrome sees install prompt via beforeinstallprompt with dismiss/accept | `beforeinstallprompt` event capture + deferred `prompt()` call; MUI Snackbar/Alert with two action buttons |
| INST-02 | User on iOS sees "Add to Home Screen" instructions with share icon guidance | `ua-parser-js` OS detection for iOS + custom instructional dialog with share icon visual |
| INST-03 | Install prompt hidden when app already running in standalone mode | `window.matchMedia('(display-mode: standalone)')` check + `navigator.standalone` fallback for Safari |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mui/material` | ^7.3.7 | UI components (Snackbar, Alert, Dialog, Button, IconButton) | Project UI framework |
| `ua-parser-js` | ^2.0.9 | iOS/browser detection | Already in project deps, used in SecuritySessionsSection |
| `react` | ^19.2.4 | `useSyncExternalStore` for browser event subscriptions | Established pattern in use-online-status.ts |
| `zustand` | ^5.0.11 | Optional: persist dismiss state across sessions | Already in project deps |
| `lucide-react` | ^0.563.0 | Icons (Download, Share, X/Close) | Already in project deps |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `localStorage` | Browser API | Persist "dismissed" state so prompt doesn't reappear every session | Always -- user dismissed = stay dismissed for 30 days |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ua-parser-js for iOS detection | `navigator.userAgent` regex | ua-parser-js already in deps, more reliable than hand-rolled regex |
| Snackbar for install banner | Custom floating banner | Snackbar matches existing sync status pattern in Layout.tsx |
| localStorage for dismiss state | Zustand persist | localStorage is simpler; no store infrastructure needed for a single boolean+timestamp |

## Architecture Patterns

### Recommended Project Structure

```
frontend/
  hooks/
    use-install-prompt.ts       # Core hook: captures beforeinstallprompt, detects iOS, checks standalone
    __tests__/
      use-install-prompt.test.ts  # Unit tests
  components/
    layout/
      InstallPromptBanner.tsx   # MUI banner component (Chromium install + iOS instructions)
      Layout.tsx                # Wire InstallPromptBanner (existing file, add import)
  locales/
    en.ts                       # Add pwa.install.* translation keys
    it.ts                       # Add pwa.install.* translation keys
    index.ts                    # Add PwaTranslations interface
```

### Pattern 1: useInstallPrompt Hook (useSyncExternalStore)

**What:** A custom hook that follows the exact same `useSyncExternalStore` pattern as `use-online-status.ts`. Captures `beforeinstallprompt`, exposes `promptEvent`, detects iOS, detects standalone mode, and tracks dismiss state.

**When to use:** In InstallPromptBanner and anywhere install state is needed.

**Example:**
```typescript
// Source: MDN BeforeInstallPromptEvent + existing use-online-status.ts pattern
import { useSyncExternalStore, useCallback } from 'react';

interface InstallPromptState {
  /** The deferred beforeinstallprompt event (Chromium only) */
  deferredPrompt: BeforeInstallPromptEvent | null;
  /** Whether the device is iOS (needs manual install instructions) */
  isIOS: boolean;
  /** Whether the app is already running in standalone/installed mode */
  isStandalone: boolean;
  /** Whether the user has dismissed the prompt (persisted to localStorage) */
  isDismissed: boolean;
  /** Whether to show the install banner (derived: has prompt or iOS, not standalone, not dismissed) */
  shouldShow: boolean;
}

// Module-level state (same pattern as use-online-status)
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  // Attach beforeinstallprompt listener on first subscribe
  // ... (see Code Examples below for full implementation)
  return () => { listeners.delete(callback); };
}
```

### Pattern 2: Standalone Detection (INST-03)

**What:** Check `display-mode: standalone` via matchMedia, plus Safari-specific `navigator.standalone`.

**When to use:** On mount, to determine if install prompt should be suppressed.

**Example:**
```typescript
// Source: web.dev/articles/customize-install
function getIsStandalone(): boolean {
  // Safari on iOS uses navigator.standalone
  if ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone) {
    return true;
  }
  // Standard check via matchMedia
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  return false;
}
```

### Pattern 3: iOS Detection

**What:** Use ua-parser-js (already in project) to detect iOS devices.

**When to use:** To switch between Chromium install prompt and iOS manual instructions.

**Example:**
```typescript
// Source: existing SecuritySessionsSection.tsx pattern
import UAParser from 'ua-parser-js';

function getIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const parser = new UAParser(navigator.userAgent);
  const os = parser.getOS();
  return os.name === 'iOS';
}
```

### Pattern 4: Dismiss Persistence

**What:** Store dismiss timestamp in localStorage. Re-show after 30 days.

**When to use:** When user clicks "Not now" / dismiss button.

**Example:**
```typescript
const DISMISS_KEY = 'pmsync:install-prompt-dismissed';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function isDismissedByUser(): boolean {
  try {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) return false;
    const timestamp = parseInt(dismissed, 10);
    return Date.now() - timestamp < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

function dismissPrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  } catch { /* localStorage unavailable */ }
}
```

### Anti-Patterns to Avoid

- **Showing install prompt immediately on first visit:** Users need context before being asked to install. Show after first meaningful interaction or on second visit. However, for this phase the requirement says "sees a dismissible install prompt" -- so show it, but make it non-intrusive (bottom Snackbar, not modal).
- **Using `window.navigator.standalone` without `in` check:** The `standalone` property only exists in Safari. Always guard with `'standalone' in navigator`.
- **Calling `prompt()` without user gesture:** The `prompt()` method MUST be called from a user-activated event handler (click). Calling it programmatically will throw.
- **Storing the BeforeInstallPromptEvent in React state:** The event object is non-serializable and should be stored in module-level variable, not useState/Zustand.
- **Re-showing prompt after `appinstalled` fires:** Listen for `appinstalled` to permanently hide the banner.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| iOS device detection | Custom regex on userAgent | `ua-parser-js` (already installed) | userAgent parsing is fragile; ua-parser-js handles edge cases |
| Snackbar/banner UI | Custom positioned div | MUI `Snackbar` + `Alert` | Matches existing Layout sync status pattern |
| Dialog for iOS instructions | Custom modal | MUI `Dialog` | Consistent with project UI patterns |

## Common Pitfalls

### Pitfall 1: beforeinstallprompt fires before React mounts

**What goes wrong:** The event fires early (sometimes before the React app hydrates), and the handler misses it.
**Why it happens:** The browser checks installability criteria asynchronously. On fast connections with good SW, the event can fire very early.
**How to avoid:** Register the `beforeinstallprompt` listener at module scope (outside React), not inside useEffect. Store the event in a module-level variable. The hook reads from this variable via `useSyncExternalStore`.
**Warning signs:** Install prompt never appears on desktop Chrome despite valid manifest.

### Pitfall 2: prompt() called without user gesture

**What goes wrong:** Browser silently ignores or throws when `prompt()` is called without a user-initiated event.
**Why it happens:** Security restriction -- install must be user-initiated.
**How to avoid:** Only call `prompt()` inside a click handler on the "Install" button.
**Warning signs:** `prompt()` returns undefined or throws DOMException.

### Pitfall 3: iOS detection includes iPadOS

**What goes wrong:** iPadOS 13+ reports itself as macOS in userAgent (desktop-class browsing).
**Why it happens:** Apple changed iPadOS to use Mac userAgent string.
**How to avoid:** Check for `navigator.maxTouchPoints > 1` combined with Mac platform to catch iPadOS. ua-parser-js v2 handles this.
**Warning signs:** iPad users never see iOS install instructions.

### Pitfall 4: Standalone detection fails on iOS

**What goes wrong:** `matchMedia('(display-mode: standalone)')` is unreliable on some Safari versions.
**Why it happens:** Safari historically had inconsistent support for display-mode media queries.
**How to avoid:** Use `navigator.standalone` as primary check for Safari, `matchMedia` as fallback.
**Warning signs:** Users who installed the app still see the install prompt.

### Pitfall 5: localStorage throws in private browsing

**What goes wrong:** `localStorage.setItem()` throws QuotaExceededError in some Safari private browsing modes.
**Why it happens:** Safari private browsing historically had zero-quota localStorage.
**How to avoid:** Wrap all localStorage calls in try/catch (shown in patterns above).
**Warning signs:** Dismiss button click causes uncaught error.

## Code Examples

### Complete useInstallPrompt Hook

```typescript
// Source: MDN BeforeInstallPromptEvent + web.dev/articles/customize-install
// Pattern: use-online-status.ts (useSyncExternalStore)

import { useSyncExternalStore, useCallback, useRef } from 'react';

// --- Types ---
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

// --- Module state (survives React re-renders, captured before mount) ---
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

// Attach ASAP at module load (catches early-firing events)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

// --- localStorage dismiss persistence ---
const DISMISS_KEY = 'pmsync:install-prompt-dismissed';
const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function isDismissedByUser(): boolean {
  try {
    const val = localStorage.getItem(DISMISS_KEY);
    if (!val) return false;
    return Date.now() - parseInt(val, 10) < DISMISS_DURATION_MS;
  } catch { return false; }
}

// --- Platform detection ---
function getIsStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if ('standalone' in navigator && (navigator as Record<string, unknown>).standalone) return true;
  return window.matchMedia('(display-mode: standalone)').matches;
}

function getIsIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// --- Hook ---
export interface UseInstallPromptReturn {
  /** Whether to show the install banner */
  shouldShow: boolean;
  /** Whether this is an iOS device (show manual instructions) */
  isIOS: boolean;
  /** Trigger the Chromium install prompt (call from click handler) */
  triggerInstall: () => Promise<'accepted' | 'dismissed' | null>;
  /** Dismiss the prompt (persists to localStorage) */
  dismiss: () => void;
}
```

### InstallPromptBanner Component (Chromium path)

```typescript
// MUI Snackbar at bottom, matching existing Layout sync status pattern
<Snackbar open={shouldShow && !isIOS} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
  <Alert
    severity="info"
    icon={<Download size={20} />}
    action={
      <>
        <Button size="small" onClick={handleInstall}>{t.pwa.install.accept}</Button>
        <IconButton size="small" onClick={handleDismiss}><X size={16} /></IconButton>
      </>
    }
  >
    {t.pwa.install.chromiumMessage}
  </Alert>
</Snackbar>
```

### InstallPromptBanner Component (iOS path)

```typescript
// MUI Dialog with step-by-step instructions
<Dialog open={showIOSDialog} onClose={handleDismiss}>
  <DialogTitle>{t.pwa.install.iosTitle}</DialogTitle>
  <DialogContent>
    <Typography>1. {t.pwa.install.iosStep1}</Typography>  {/* Tap the Share icon */}
    <Typography>2. {t.pwa.install.iosStep2}</Typography>  {/* Select "Add to Home Screen" */}
    <Typography>3. {t.pwa.install.iosStep3}</Typography>  {/* Tap "Add" */}
  </DialogContent>
  <DialogActions>
    <Button onClick={handleDismiss}>{t.common.cancel}</Button>
  </DialogActions>
</Dialog>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Show browser's default mini-infobar | Capture `beforeinstallprompt` + custom UI | Chrome 76 (2019) | Full control over install UX |
| `userChoice` as separate property | `prompt()` returns `{ outcome }` directly | Chrome 93+ | Cleaner API, but both still work |
| iPadOS detected as iOS | iPadOS sends Mac userAgent | iPadOS 13 (2019) | Must check maxTouchPoints for iPad detection |
| iOS needs complex standalone detection | iOS 26: "Open as Web App" toggle default | iOS 26 (2025) | Every site added to home screen opens as web app by default |

**Deprecated/outdated:**
- Chrome's automatic mini-infobar is still shown if you don't call `preventDefault()` on `beforeinstallprompt`, but best practice is to capture and control it yourself.

## Open Questions

1. **iOS Snackbar vs Dialog for instructions**
   - What we know: iOS requires manual steps (Share > Add to Home Screen). A Snackbar is too small for multi-step instructions.
   - What's unclear: Whether to show a Snackbar that opens a Dialog, or a Dialog directly.
   - Recommendation: Show a Snackbar with "Learn how to install" that opens a Dialog with step-by-step instructions. This keeps the initial prompt non-intrusive.

2. **When to first show the prompt**
   - What we know: Requirements say "sees install prompt" but don't specify timing.
   - What's unclear: Show on first authenticated page load, or after some engagement threshold.
   - Recommendation: Show on first authenticated page load (Layout mount) unless dismissed. Keep it as a non-blocking Snackbar so it's not disruptive.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 30.2.0 + React Testing Library 16.3.2 |
| Config file | `frontend/jest.config.ts` (assumed, standard location) |
| Quick run command | `cd frontend && npx jest hooks/__tests__/use-install-prompt.test.ts --no-coverage` |
| Full suite command | `cd frontend && npm test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INST-01 | beforeinstallprompt captured, prompt() callable from click | unit | `cd frontend && npx jest hooks/__tests__/use-install-prompt.test.ts -t "chromium" --no-coverage` | No -- Wave 0 |
| INST-02 | iOS detected, instructions shown | unit | `cd frontend && npx jest hooks/__tests__/use-install-prompt.test.ts -t "iOS" --no-coverage` | No -- Wave 0 |
| INST-03 | Standalone mode detected, shouldShow=false | unit | `cd frontend && npx jest hooks/__tests__/use-install-prompt.test.ts -t "standalone" --no-coverage` | No -- Wave 0 |

### Sampling Rate

- **Per task commit:** `cd frontend && npx jest hooks/__tests__/use-install-prompt.test.ts --no-coverage`
- **Per wave merge:** `cd frontend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `frontend/hooks/__tests__/use-install-prompt.test.ts` -- covers INST-01, INST-02, INST-03
- [ ] Mock `BeforeInstallPromptEvent` and `matchMedia` in test setup (Jest JSDOM lacks both)

## Sources

### Primary (HIGH confidence)
- [MDN BeforeInstallPromptEvent](https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent) - Full API reference, browser compat
- [web.dev: Customize Install](https://web.dev/articles/customize-install) - Complete implementation pattern with code
- [MDN: Trigger Install Prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt) - PWA install trigger guide
- Existing codebase: `use-online-status.ts` (useSyncExternalStore pattern), `SecuritySessionsSection.tsx` (ua-parser-js usage), `Layout.tsx` (banner wiring pattern)

### Secondary (MEDIUM confidence)
- [PWA iOS Limitations 2026](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) - iOS Safari PWA support status
- [web.dev: Installation Prompt](https://web.dev/learn/pwa/installation-prompt) - General PWA install best practices

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new deps needed, all libraries already in project
- Architecture: HIGH - Follows established patterns (useSyncExternalStore, MUI components, Layout wiring)
- Pitfalls: HIGH - beforeinstallprompt is well-documented; iOS quirks are well-known
- iOS detection: MEDIUM - iPadOS detection via maxTouchPoints is reliable but edge cases exist

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable APIs, no expected breaking changes)
