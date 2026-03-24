---
phase: 105-push-plumbing-polish
verified: 2026-03-24T08:16:11Z
status: human_needed
score: 9/10 must-haves verified
human_verification:
  - test: "Lighthouse PWA audit in Chrome DevTools"
    expected: "PWA category passes — installable, service worker registered, offline fallback responds"
    why_human: "Lighthouse requires a live browser session; cannot run headlessly against localhost from this environment"
---

# Phase 105: Push Plumbing & Polish Verification Report

**Phase Goal:** Push notification plumbing and polish — backend subscription storage, frontend hooks, SW handlers, notification settings UI, SW update snackbar, logout cleanup
**Verified:** 2026-03-24T08:16:11Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | PushManager.subscribe() with VAPID key produces a subscription persisted to the backend | VERIFIED | `use-push-subscription.ts:123` uses `NEXT_PUBLIC_VAPID_KEY`; calls `pushApi.subscribe()` at line 127; backend upserts via `prisma.pushSubscription.upsert` |
| 2 | SW receives a push event and displays a notification with app icon | VERIFIED | `sw.ts:101` — `self.addEventListener('push', ...)` calls `self.registration.showNotification(data.title, { icon: data.icon || '/icons/icon-192x192.png', ... })` |
| 3 | Tapping a push notification opens PMSync to the URL from push data | VERIFIED | `sw.ts:123` — `notificationclick` handler reads `event.notification.data.url` and calls `clients.openWindow(url)` |
| 4 | usePushSubscription returns isSupported=false on browsers without PushManager or on iOS Safari outside standalone | VERIFIED | `use-push-subscription.ts:21-38` — `isPushSupported()` checks PushManager, Notification, and iOS UA + standalone mode; test suite confirms with 7 passing tests |
| 5 | User sees NotificationSettings section in Settings page with push toggle when browser supports push | VERIFIED | `Settings.tsx:103,232` — 'notifications' section added with `<NotificationSettings />` rendering; `NotificationSettings.tsx` renders `<Switch>` bound to `isSubscribed` |
| 6 | NotificationSettings section is hidden entirely when browser does not support push | VERIFIED | `NotificationSettings.tsx:14` — `if (!isSupported) return null` |
| 7 | User sees "New version available" snackbar after deploy when a waiting SW is detected | VERIFIED | `UpdateSnackbar.tsx` — `open={updateAvailable}` from `useSwUpdate()`; `useSwUpdate` detects `reg.waiting` and `updatefound` events |
| 8 | Clicking "Reload page" in snackbar posts SKIP_WAITING to waiting SW and reloads | VERIFIED | `use-sw-update.ts:45-48` — `waitingSw.postMessage({ type: 'SKIP_WAITING' })` + `controllerchange` reloads; `sw.ts:144-147` handles the message |
| 9 | Push subscription is unsubscribed on logout (clearOfflineData) | VERIFIED | `logout-cleanup.ts:27-33` — `reg.pushManager?.getSubscription()`, `sub.unsubscribe()`, `pushApi.unsubscribe(sub.endpoint)` |
| 10 | Lighthouse PWA audit criteria are met (installable + SW + offline fallback) | HUMAN NEEDED | SW registered (`next.config.js register:true`), offline fallback at `/offline.html` with SW handler confirmed in `sw.ts:73-80`. Actual Lighthouse pass requires live browser run. |

**Score:** 9/10 truths verified automatically

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/prisma/schema.prisma` | PushSubscription model | VERIFIED | `model PushSubscription` at line 1635; `@@map("push_subscriptions")` at line 1651; relations on Tenant (line 59) and User (line 111) |
| `backend/src/modules/push/push.controller.ts` | POST/DELETE /push/subscribe endpoints | VERIFIED | `@Post('subscribe')` line 31, `@Delete('subscribe')` line 46; auth guard applied |
| `backend/src/modules/push/push.service.ts` | Subscribe/unsubscribe with Prisma | VERIFIED | `prisma.pushSubscription.upsert` line 15; `prisma.pushSubscription.deleteMany` line 37 |
| `backend/src/modules/push/dto/push-subscription.dto.ts` | Validated DTOs | VERIFIED | `CreatePushSubscriptionDto`, `DeletePushSubscriptionDto` present |
| `backend/src/app.module.ts` | PushModule registered | VERIFIED | Import line 42, array entry line 106 |
| `frontend/hooks/use-push-subscription.ts` | Push subscription lifecycle hook | VERIFIED | `useSyncExternalStore`, `isPushSupported`, `_resetForTesting`, VAPID key, `pushApi` calls all present |
| `frontend/lib/api/push.ts` | Push API module | VERIFIED | `export const pushApi` with `apiClient.post('/push/subscribe')` and `apiClient.delete('/push/subscribe')` |
| `frontend/sw.ts` | Push + notificationclick handlers, SKIP_WAITING | VERIFIED | `push` listener line 101, `notificationclick` line 123, `message/SKIP_WAITING` line 144-147; `skipWaiting:true` absent from constructor |
| `frontend/hooks/use-sw-update.ts` | SW waiting state detection hook | VERIFIED | `useSwUpdate` with `getRegistration`, `postMessage SKIP_WAITING`, `controllerchange` |
| `frontend/components/layout/UpdateSnackbar.tsx` | SW update notification snackbar | VERIFIED | `export function UpdateSnackbar`, `severity="info"`, `RefreshCw`, `t.pwa?.update?.reload` |
| `frontend/components/dashboard/settings/NotificationSettings.tsx` | Push notification settings section | VERIFIED | `usePushSubscription`, `if (!isSupported) return null`, `severity="warning"`, `<Switch>`, `<CircularProgress size={20}>` |
| `frontend/locales/en.ts` | EN push + update translations | VERIFIED | `push:` block with `'Push Notifications'`, `update:` block with `'A new version...'` |
| `frontend/locales/it.ts` | IT push + update translations | VERIFIED | `push:` block with `'Notifiche Push'`, `update:` block present |
| `frontend/locales/index.ts` | pwa type expanded | VERIFIED | `push?:` at line 3975, `update?:` at line 3984 |
| `frontend/lib/logout-cleanup.ts` | Push unsubscribe on logout | VERIFIED | `pushManager`, `sub.unsubscribe()`, `pushApi.unsubscribe` all present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `frontend/hooks/use-push-subscription.ts` | `frontend/lib/api/push.ts` | `pushApi.subscribe()` and `pushApi.unsubscribe()` | WIRED | Import line 2; calls at lines 127 and 144 |
| `frontend/lib/api/push.ts` | `backend/src/modules/push/push.controller.ts` | `POST/DELETE /api/v1/push/subscribe` | WIRED | `apiClient.post('/push/subscribe')` and `apiClient.delete('/push/subscribe')` match controller routes |
| `frontend/components/dashboard/settings/NotificationSettings.tsx` | `frontend/hooks/use-push-subscription.ts` | `usePushSubscription` hook | WIRED | Import + destructuring at line 8 |
| `frontend/components/layout/UpdateSnackbar.tsx` | `frontend/hooks/use-sw-update.ts` | `useSwUpdate` hook | WIRED | Import + usage at lines 3-7 |
| `frontend/components/layout/Layout.tsx` | `frontend/components/layout/UpdateSnackbar.tsx` | `<UpdateSnackbar />` JSX | WIRED | Import line 19; `<UpdateSnackbar />` at line 191, between `<InstallPromptBanner />` and `<CookieConsent />` |
| `frontend/lib/logout-cleanup.ts` | PushManager API | `pushManager.getSubscription()` + `unsubscribe()` | WIRED | Lines 27-33; imports `pushApi` dynamically for backend cleanup |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|---------|
| PUSH-01 | 105-01, 105-02 | User can opt into push notifications from settings page (VAPID subscription via PushManager) | SATISFIED | `NotificationSettings.tsx` toggle calls `subscribeToPush`; `usePushSubscription` uses VAPID key; backend stores subscription |
| PUSH-02 | 105-01 | SW handles push events and displays notifications with app icon | SATISFIED | `sw.ts:101-122` — push listener, `showNotification` with icon |
| PUSH-03 | 105-01 | User tapping notification opens PMSync to relevant view | SATISFIED | `sw.ts:123-140` — `notificationclick` with deep-link URL from `data.url` |
| PUSH-04 | 105-01, 105-02 | Push UI gated behind browser support check (hidden on unsupported browsers/iOS Safari non-standalone) | SATISFIED | `isPushSupported()` iOS guard; `if (!isSupported) return null` in component |
| PLSH-01 | 105-02 | "New version available" snackbar appears on deploy with user-triggered reload (skipWaiting) | SATISFIED | `useSwUpdate` + `UpdateSnackbar` + `sw.ts` SKIP_WAITING message handler; `skipWaiting:true` removed from constructor |
| PLSH-02 | 105-02 | Lighthouse PWA audit category passes (installable + SW + offline fallback) | NEEDS HUMAN | SW registered, offline fallback present in `sw.ts:73-80` — Lighthouse run required |

**All 6 requirement IDs from plan frontmatter are accounted for. No orphaned requirements found.**

### Anti-Patterns Found

None. Scanned all phase-created/modified files for TODO/FIXME/placeholder/empty implementations. Clean.

### Human Verification Required

#### 1. Lighthouse PWA Audit

**Test:** Open Chrome DevTools > Lighthouse tab. Run a PWA audit against the running app (localhost:3001 or production URL).
**Expected:** PWA category passes with: "Installable" check green, "Service worker" registered, offline fallback page responds when network is disabled.
**Why human:** Lighthouse requires a live browser session against a running server. The SW, offline fallback entry (`/offline.html`), and registration config (`register: true`) are all in place programmatically, but a real Lighthouse run is the only definitive confirmation.

### Gaps Summary

No gaps found. All 9 automatically-verifiable truths pass. The sole human verification item (PLSH-02 Lighthouse audit) is a runtime behavior check, not a code deficiency — the static artifacts supporting it are complete and correct.

---

_Verified: 2026-03-24T08:16:11Z_
_Verifier: Claude (gsd-verifier)_
