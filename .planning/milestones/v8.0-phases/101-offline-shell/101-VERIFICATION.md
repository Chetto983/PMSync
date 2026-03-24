---
phase: 101-offline-shell
verified: 2026-03-23T12:15:00Z
status: human_needed
score: 3/3 must-haves verified (automated checks pass; manual DevTools test required for full confidence)
human_verification:
  - test: "Navigate to uncached route while offline"
    expected: "Branded PMSync offline.html page appears instead of browser error"
    why_human: "Requires built app, DevTools SW offline toggle, and a URL the SW hasn't cached yet — cannot simulate SW fetch interception in static analysis"
  - test: "Toggle DevTools Network offline tab while app is open"
    expected: "Warning banner with WifiOff icon appears immediately and disappears on reconnect"
    why_human: "Requires live browser environment to dispatch real online/offline events and confirm MUI Collapse animation renders"
  - test: "Open app offline after visiting at least one page online"
    expected: "Sidebar, header, and layout chrome load instantly from cache (OFFL-04 shell caching)"
    why_human: "OFFL-04 relies on Serwist precache from Phase 100 build output — requires production build and DevTools Application > Service Workers offline mode to verify cache hit"
---

# Phase 101: Offline Shell Verification Report

**Phase Goal:** PMSync opens from home screen and renders its shell even without network, with clear offline status indication
**Verified:** 2026-03-23T12:15:00Z
**Status:** human_needed (all automated checks pass; three manual DevTools tests required)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User navigating to an uncached route without network sees branded PMSync offline page instead of browser error | ? HUMAN | `offline.html` exists in `public/` with correct title/branding; SW `fallbacks` config routes failed document navigations to `/offline.html`; `additionalPrecacheEntries` ensures it is precached — SW interception cannot be verified without a real browser |
| 2 | User sees a visible warning banner when connection drops and the banner disappears when connection restores | ? HUMAN | `useOnlineStatus` hook verified (useSyncExternalStore, 5/5 unit tests pass); `OfflineBanner` renders `<Collapse in={!isOnline}>` with MUI `warning` Alert; wired as first child of `<Box component="main">` in Layout — live browser needed to confirm DOM rendering |
| 3 | OFFL-04: App shell loads instantly from cache when opening offline | ? HUMAN | Phase 100 Serwist precaching + `cacheOnNavigation: true` remain in `next.config.js`; `offline.html` confirmed in `additionalPrecacheEntries` — cache hit verification requires build + DevTools |

**Score:** 3/3 truths supported by implementation (automated); all three require human DevTools confirmation

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/public/offline.html` | Branded offline fallback page with dark/light mode | VERIFIED | 97 lines; contains `<title>PMSync - Offline</title>`, gradient brand text (`linear-gradient(135deg, #55cae5, #7650ce)`), `@media (prefers-color-scheme: light)` override, `window.location.reload()` button; no external deps |
| `frontend/sw.ts` | SW fallbacks config for offline navigation | VERIFIED | `fallbacks.entries[0]` maps `request.destination === 'document'` to `/offline.html`; existing `runtimeCaching` and `precacheOptions` unchanged |
| `frontend/next.config.js` | additionalPrecacheEntries for offline.html | VERIFIED | `additionalPrecacheEntries: [{ url: '/offline.html', revision: Date.now().toString() }]` present after `cacheOnNavigation: true` |
| `frontend/hooks/use-online-status.ts` | React hook for online/offline detection | VERIFIED | 22 lines; `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`; exports `useOnlineStatus(): boolean`; server snapshot returns `true` |
| `frontend/components/layout/OfflineBanner.tsx` | Persistent MUI Alert banner for offline state | VERIFIED | 24 lines; MUI `<Collapse in={!isOnline}>`; `severity="warning"`; `WifiOff` icon from lucide-react; `borderRadius: 0`; `t.common?.offlineBanner` translation lookup with English fallback |
| `frontend/hooks/__tests__/use-online-status.test.ts` | Unit tests for online status hook | VERIFIED | 5 tests: returns true/false from `navigator.onLine`, updates on `offline`/`online` events, cleans up listeners on unmount; all 5 pass (Jest 30, jsdom) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/sw.ts` | `/offline.html` | `fallbacks.entries[0].url` | WIRED | Line 46: `url: '/offline.html'` |
| `frontend/next.config.js` | `/offline.html` | `additionalPrecacheEntries` | WIRED | Line 15-16: `{ url: '/offline.html', revision: Date.now().toString() }` |
| `frontend/components/layout/OfflineBanner.tsx` | `use-online-status.ts` | `import useOnlineStatus` | WIRED | Line 3: `import { useOnlineStatus } from '@/hooks/use-online-status'` |
| `frontend/components/layout/Layout.tsx` | `OfflineBanner.tsx` | import + render | WIRED | Line 17 import; line 133 `<OfflineBanner />` as first child of `<Box component="main">`, above `<ImpersonationBanner />` |
| `frontend/components/layout/OfflineBanner.tsx` | `frontend/locales/index.ts` | `t.common?.offlineBanner` | WIRED | Line 20: `t.common?.offlineBanner`; key exists in `en.ts:125`, `it.ts:125`; type `offlineBanner?: string` at `index.ts:393` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OFFL-01 | 101-01-PLAN.md | User sees branded offline fallback page instead of browser error for uncached routes | ? HUMAN | `offline.html` exists and is precached; SW fallbacks configured — requires DevTools offline navigation test |
| OFFL-02 | 101-01-PLAN.md | User sees online/offline indicator banner when connection drops or restores | ? HUMAN | `OfflineBanner` wired into Layout with `useOnlineStatus` — requires live browser test |
| OFFL-04 | 101-01-PLAN.md | App shell loads from cache for instant startup without network | ? HUMAN | Phase 100 Serwist precaching confirmed; `offline.html` in `additionalPrecacheEntries` — requires production build + DevTools offline test |

No orphaned requirements: OFFL-03 is mapped to Phase 103, not Phase 101.

### TypeScript Check

Two pre-existing errors unrelated to phase 101:
- `locales/en.ts:3811` — `consentRequired` key has no matching type in `index.ts` (introduced in commit `dcd4b840`, before phase 101)
- `locales/it.ts:3788` — same `consentRequired` issue

Phase 101 only added `offlineBanner` to locales (commit `8480425f`) and its type at `index.ts:393`. The pre-existing errors do not affect offline shell functionality.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments in any phase 101 files. No empty implementations or stub handlers.

### Commit Verification

All four documented commits exist in git history:
- `8850382b` — offline.html + SW fallbacks + additionalPrecacheEntries
- `b9482c38` — TDD RED: failing tests
- `8480425f` — TDD GREEN: hook + translation strings
- `70c4001b` — OfflineBanner + Layout wiring

### Human Verification Required

#### 1. OFFL-01: Branded offline page for uncached navigation

**Test:** Build the frontend (`npm run build`), serve it, open in browser, go to Application > Service Workers > check "Offline", then navigate to a route not in the precache manifest (e.g., `/settings/unknown`).
**Expected:** The browser shows `offline.html` with "PMSync" gradient brand, "You're Offline" heading, description paragraph, and "Try Again" button — not a browser ERR_INTERNET_DISCONNECTED page.
**Why human:** Service worker fetch interception cannot be simulated via static grep; requires a real SW registration in a browser.

#### 2. OFFL-02: Online/offline banner appears and disappears

**Test:** Open the app in a browser. Go to DevTools > Network tab > toggle "Offline". Watch the top of the main content area.
**Expected:** A full-width amber MUI warning Alert with a WifiOff icon slides in at the top of the content area (above the header). When toggled back online, the banner animates away within ~300ms.
**Why human:** `useSyncExternalStore` and React state transitions require a live DOM; unit tests confirm the hook logic but not the rendered MUI component.

#### 3. OFFL-04: App shell loads from cache when offline

**Test:** Build and serve the app. Visit the dashboard normally (populates SW cache). Go to Application > Service Workers > check "Offline". Reload the page.
**Expected:** Sidebar, top header/nav bar, and layout chrome render instantly — no spinner waiting for network. Content areas may show loading states but structural chrome is visible immediately.
**Why human:** Cache population depends on Serwist precache manifest generated at build time; verification requires a real build + SW activation cycle.

### Gaps Summary

No automated gaps found. All artifacts exist, are substantive, and are correctly wired. The three human verification items are standard PWA/SW behaviors that cannot be confirmed through static analysis — they require a production build and browser DevTools.

---

_Verified: 2026-03-23T12:15:00Z_
_Verifier: Claude (gsd-verifier)_
