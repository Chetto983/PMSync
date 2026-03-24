# Phase 105: Push Plumbing & Polish - Research

**Researched:** 2026-03-24
**Domain:** Web Push API, Service Worker update lifecycle, Serwist (@serwist/next 9.x)
**Confidence:** HIGH

## Summary

This phase covers two distinct areas: (1) push notification frontend plumbing (PUSH-01 through PUSH-04) and (2) SW update UX polish (PLSH-01, PLSH-02). Both are purely frontend concerns -- the backend push trigger integration (PUSHB-01) is explicitly deferred to v9+.

Push notification infrastructure requires: a `usePushSubscription` hook managing PushManager subscription lifecycle, a settings panel section for opt-in/opt-out, a SW `push` event handler displaying notifications, and a `notificationclick` handler for deep-linking. The VAPID public key is exposed via `NEXT_PUBLIC_VAPID_KEY` env var. The backend needs a minimal `POST /api/push/subscribe` endpoint to store subscriptions and `DELETE /api/push/subscribe` to remove them, plus a `PushSubscription` Prisma model.

The SW update snackbar (PLSH-01) requires changing the existing `skipWaiting: true` to `false` in `sw.ts`, wiring `SerwistProvider` or using `@serwist/window` directly to detect the `waiting` event, and showing a "New version available" snackbar with a reload button that calls `messageSkipWaiting()`.

**Primary recommendation:** Follow the existing `useSyncExternalStore` + module-state pattern (established in `use-install-prompt.ts` and `use-online-status.ts`) for push subscription state management. Use `@serwist/next`'s built-in `SerwistProvider` + `useSerwist` for SW update detection.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PUSH-01 | User can opt into push from settings (VAPID subscription via PushManager) | `usePushSubscription` hook + NotificationSettings component in settings page |
| PUSH-02 | SW handles push events and displays notifications with app icon | SW `push` event listener in `sw.ts` with `self.registration.showNotification()` |
| PUSH-03 | Tapping notification opens PMSync to relevant view | SW `notificationclick` handler using `clients.openWindow()` with deep link URL from push data |
| PUSH-04 | Push UI gated behind browser support (hidden on unsupported/iOS Safari non-standalone) | Feature detection: `'PushManager' in window` + `'Notification' in window` + standalone check for iOS |
| PLSH-01 | "New version available" snackbar with user-triggered reload | Change `skipWaiting: false`, use `SerwistProvider`/`useSerwist` for `waiting` event, snackbar with `messageSkipWaiting()` |
| PLSH-02 | Lighthouse PWA audit passes | Verify installable + SW + offline fallback criteria; manifest already correct |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@serwist/next` | 9.5.7 | SW compilation + Next.js integration | Already used; provides `SerwistProvider`, `useSerwist` |
| `serwist` | 9.5.7 | SW runtime (precaching, routing) | Already used in `sw.ts` |
| `@serwist/window` | 9.5.7 | Client-side SW lifecycle management | Transitive dep of `@serwist/next`; provides `Serwist` class with `waiting` event + `messageSkipWaiting()` |
| `@mui/material` | 7.3.7 | UI components (Snackbar, Switch, etc.) | Project standard |
| `idb-keyval` | 6.2.2 | IndexedDB key-value storage | Already used for offline queue |

### New (to install)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `web-push` | 3.6.7 | VAPID key generation + push sending (backend only) | Backend needs this for VAPID keypair generation and future push sending |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `web-push` (backend) | Manual VAPID signing | `web-push` handles RFC 8291 encryption correctly; hand-rolling is error-prone |
| `SerwistProvider` | Raw `navigator.serviceWorker` API | `SerwistProvider` integrates with existing @serwist/next config; no need to duplicate registration logic |

**Installation:**
```bash
# Backend only - for VAPID key generation
cd backend && npm install web-push
npm install --save-dev @types/web-push
```

No new frontend packages needed -- `@serwist/window` is already a transitive dependency.

## Architecture Patterns

### Recommended File Structure
```
frontend/
  hooks/
    use-push-subscription.ts       # PushManager lifecycle hook (useSyncExternalStore pattern)
    use-push-subscription.test.ts
    use-sw-update.ts               # SW waiting state hook
    use-sw-update.test.ts
  components/
    settings/NotificationSettings.tsx  # Push opt-in/out UI for settings page
    layout/UpdateSnackbar.tsx          # "New version available" snackbar
  lib/
    api/push.ts                    # API module for push subscription CRUD
    logout-cleanup.ts              # Add push unsubscribe to existing cleanup

  sw.ts                            # Add push + notificationclick handlers

backend/
  prisma/schema.prisma             # Add PushSubscription model
  src/modules/push/
    push.module.ts
    push.controller.ts             # POST/DELETE /api/push/subscribe
    push.service.ts
    dto/push-subscription.dto.ts
```

### Pattern 1: Push Subscription Hook (useSyncExternalStore)
**What:** Module-state hook following the established `use-install-prompt.ts` pattern
**When to use:** Managing PushManager subscription state across components
**Example:**
```typescript
// Source: Follows existing use-install-prompt.ts pattern
import { useSyncExternalStore, useCallback } from 'react';

// Module-level state
let currentSubscription: PushSubscription | null = null;
let permissionState: NotificationPermission = 'default';
const listeners = new Set<() => void>();

function notify() { listeners.forEach(cb => cb()); }

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

interface PushSnapshot {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission;
}

function getSnapshot(): PushSnapshot { ... }
function getServerSnapshot(): PushSnapshot {
  return { isSupported: false, isSubscribed: false, permission: 'default' };
}

export function usePushSubscription() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const subscribeToPush = useCallback(async () => { ... }, []);
  const unsubscribeFromPush = useCallback(async () => { ... }, []);
  return { ...state, subscribeToPush, unsubscribeFromPush };
}

export function _resetForTesting() { ... }
```

### Pattern 2: SW Push Event Handler
**What:** Handles incoming push messages in the service worker
**When to use:** Displaying notifications from push events
**Example:**
```typescript
// In sw.ts - after existing sync handler
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;
  const data = event.data.json() as {
    title: string;
    body: string;
    icon?: string;
    url?: string;
    tag?: string;
  };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if ('focus' in client) {
          (client as WindowClient).focus();
          (client as WindowClient).navigate(url);
          return;
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});
```

### Pattern 3: SW Update Detection (PLSH-01)
**What:** Detect waiting SW and show update snackbar
**When to use:** After deploy, when new SW is installed but waiting
**Critical change:** Must change `skipWaiting: true` to `skipWaiting: false` in `sw.ts`. But also add a `SKIP_WAITING` message handler so the snackbar can trigger activation.
**Example:**
```typescript
// In sw.ts - add message handler for SKIP_WAITING
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Remove: skipWaiting: true from Serwist constructor
// Keep: clientsClaim: true
```

```typescript
// In _app.tsx or Layout - wrap with SerwistProvider
import { SerwistProvider } from '@serwist/next/react';

// OR use a custom hook approach:
// hooks/use-sw-update.ts
export function useSwUpdate() {
  const [waitingSw, setWaitingSw] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const reg = navigator.serviceWorker.getRegistration();
    // Listen for new SW waiting...
  }, []);

  const activateUpdate = useCallback(() => {
    waitingSw?.postMessage({ type: 'SKIP_WAITING' });
    // Reload after controllerchange
  }, [waitingSw]);

  return { updateAvailable: !!waitingSw, activateUpdate };
}
```

### Anti-Patterns to Avoid
- **Keeping `skipWaiting: true` while adding update snackbar:** These are contradictory. `skipWaiting: true` auto-activates; the snackbar never appears.
- **Subscribing to push in the SW:** The SW cannot make authenticated API calls (httpOnly cookies). Push subscription must go through the main thread.
- **Using `Notification.requestPermission()` without user gesture:** Must be triggered by user action (button click), not on page load. Browsers block permission requests without user gesture.
- **Storing VAPID private key in frontend:** Only the public key goes to `NEXT_PUBLIC_VAPID_KEY`. Private key stays in backend `.env`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VAPID key generation | Manual crypto | `web-push.generateVAPIDKeys()` CLI | RFC 8291 compliance is fiddly |
| SW lifecycle events | Raw `navigator.serviceWorker` listeners | `@serwist/window` Serwist class / `SerwistProvider` | Handles edge cases (already waiting on register, update found timing) |
| Push payload encryption | Manual ECDH | `web-push` library | Encryption spec is non-trivial; library handles it correctly |
| Notification permission UX | Custom permission dialog | Browser native `Notification.requestPermission()` | Custom pre-permission dialogs add complexity; the settings page toggle IS the user gesture |

## Common Pitfalls

### Pitfall 1: iOS Safari Push Limitations
**What goes wrong:** Push API is available in iOS Safari 16.4+, but ONLY in standalone (Add to Home Screen) mode. In regular Safari, `PushManager` exists but `subscribe()` throws.
**Why it happens:** Apple restricts Web Push to installed PWAs only.
**How to avoid:** Check both `'PushManager' in window` AND `window.matchMedia('(display-mode: standalone)').matches` on iOS. Hide the push settings section entirely when unsupported.
**Warning signs:** Users report push toggle appears but fails silently on iOS Safari.

### Pitfall 2: skipWaiting Race Condition
**What goes wrong:** Changing from `skipWaiting: true` to `false` means existing users' SWs will auto-activate one more time (the deploy that removes skipWaiting), then subsequent deploys will show the snackbar.
**Why it happens:** The SW that removes `skipWaiting: true` itself still has `skipWaiting: true`.
**How to avoid:** This is expected behavior -- the first deploy after the change will auto-activate. Document this as a one-time transition. Add the `SKIP_WAITING` message handler alongside removing `skipWaiting: true`.
**Warning signs:** None -- this is fine. First deploy auto-activates, subsequent ones prompt.

### Pitfall 3: Push Subscription Expiration
**What goes wrong:** Push subscriptions can expire or be revoked by the push service. The backend stores a stale endpoint and push delivery fails silently.
**Why it happens:** Push services (FCM, Mozilla Push) may rotate endpoints.
**How to avoid:** On each app load, call `registration.pushManager.getSubscription()` and compare with what the backend has. Re-subscribe if different. Also handle `pushsubscriptionchange` event in SW.
**Warning signs:** Push notifications stop arriving after weeks/months.

### Pitfall 4: Notification Permission Denied is Permanent
**What goes wrong:** Once user denies notification permission, `Notification.requestPermission()` returns `'denied'` immediately without showing a prompt. User must manually change browser settings.
**Why it happens:** Browser security model -- denied permissions are sticky.
**How to avoid:** Show a pre-permission explanation in the settings UI. If permission is `'denied'`, show a help message explaining how to re-enable in browser settings instead of a toggle.
**Warning signs:** Toggle click does nothing, no error shown.

### Pitfall 5: Forgetting to Unsubscribe on Logout
**What goes wrong:** User signs out but push subscription remains active. New user on same device receives old user's notifications.
**Why it happens:** `clearOfflineData()` doesn't unsubscribe from push.
**How to avoid:** Add `pushSubscription.unsubscribe()` + backend DELETE to `clearOfflineData()`.
**Warning signs:** Notifications arrive for wrong user after sign-out/sign-in cycle.

## Code Examples

### VAPID Key Generation (one-time setup)
```bash
# Run once to generate keypair, store in .env
npx web-push generate-vapid-keys
# Output:
# Public Key: BNx...
# Private Key: abc...

# backend/.env
VAPID_PUBLIC_KEY=BNx...
VAPID_PRIVATE_KEY=abc...
VAPID_SUBJECT=mailto:admin@pmsync.local

# frontend/.env
NEXT_PUBLIC_VAPID_KEY=BNx...
```

### PushSubscription Prisma Model
```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  endpoint  String
  p256dh    String   // Encryption key
  auth      String   // Auth secret
  userAgent String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, endpoint])
  @@index([tenantId, userId])
  @@map("push_subscriptions")
}
```

### Push Subscribe API Module (Frontend)
```typescript
// frontend/lib/api/push.ts
import { apiClient } from '../api-client';

export interface PushSubscriptionDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const pushApi = {
  subscribe: (dto: PushSubscriptionDto) =>
    apiClient.post('/push/subscribe', dto),
  unsubscribe: (endpoint: string) =>
    apiClient.delete('/push/subscribe', { data: { endpoint } }),
};
```

### Feature Detection for PUSH-04
```typescript
function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (!('Notification' in window)) return false;

  // iOS Safari: Push only works in standalone mode
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    const isStandalone =
      ('standalone' in navigator && (navigator as any).standalone) ||
      window.matchMedia('(display-mode: standalone)').matches;
    if (!isStandalone) return false;
  }

  return true;
}
```

### Update Snackbar with SerwistProvider
```typescript
// Option A: Use SerwistProvider in _app.tsx
// Wrap app with <SerwistProvider swUrl="/sw.js" register cacheOnNavigation>
// Then use useSerwist() in UpdateSnackbar component

// Option B: Direct navigator.serviceWorker (simpler, no provider needed)
// Since register: true in next.config.js already registers the SW,
// just listen for waiting state via navigator.serviceWorker events
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next-pwa` | `@serwist/next` | 2024 | Already migrated in Phase 100 |
| `skipWaiting: true` (auto-update) | `skipWaiting: false` + user prompt | This phase | User controls when to reload |
| No push support | Web Push API + VAPID | This phase | Frontend push plumbing ready for backend triggers |

## Open Questions

1. **SerwistProvider vs manual SW update detection**
   - What we know: `@serwist/next` exports `SerwistProvider` and `useSerwist` hook. The current app uses `register: true` in next.config.js for auto-registration.
   - What's unclear: Whether switching to `SerwistProvider` (which handles registration) conflicts with `register: true` config. They may double-register.
   - Recommendation: Set `register: false` in next.config.js and let `SerwistProvider` handle registration + update detection. OR keep `register: true` and use a simpler custom hook with `navigator.serviceWorker` directly. The simpler custom hook approach avoids restructuring `_app.tsx`.

2. **Backend push module scope**
   - What we know: Requirements say "VAPID subscription sent to backend." Backend needs to store subscriptions.
   - What's unclear: How minimal the backend can be. Full CRUD or just store/delete?
   - Recommendation: Minimal -- just `POST /api/push/subscribe` (upsert) and `DELETE /api/push/subscribe` (remove). No send capability (deferred to PUSHB-01 in v9+).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 (frontend), Jest 29 (backend) |
| Config file | `frontend/jest.config.js`, `backend/jest.config.ts` |
| Quick run command | `cd frontend && npx jest --testPathPattern=use-push --no-coverage` |
| Full suite command | `cd frontend && npx jest --no-coverage` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PUSH-01 | Push subscribe/unsubscribe lifecycle | unit | `cd frontend && npx jest use-push-subscription --no-coverage` | Wave 0 |
| PUSH-02 | SW push event shows notification | manual-only | N/A (SW runs in browser) | N/A |
| PUSH-03 | Notification click opens correct URL | manual-only | N/A (SW runs in browser) | N/A |
| PUSH-04 | Feature detection hides UI on unsupported | unit | `cd frontend && npx jest use-push-subscription --no-coverage` | Wave 0 |
| PLSH-01 | SW update detection + snackbar | unit | `cd frontend && npx jest use-sw-update --no-coverage` | Wave 0 |
| PLSH-02 | Lighthouse PWA audit passes | manual | `npx lighthouse https://pmsync.vercel.app --only-categories=pwa` | N/A |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit && npx jest --no-coverage --testPathPattern="push\|sw-update"`
- **Per wave merge:** `cd frontend && npx jest --no-coverage`
- **Phase gate:** Full suite green + Lighthouse PWA audit

### Wave 0 Gaps
- [ ] `frontend/hooks/use-push-subscription.test.ts` -- covers PUSH-01, PUSH-04
- [ ] `frontend/hooks/use-sw-update.test.ts` -- covers PLSH-01
- [ ] Backend push module tests if backend endpoint is implemented

## Sources

### Primary (HIGH confidence)
- `@serwist/window` Serwist.d.ts -- SW lifecycle events (waiting, controlling), `messageSkipWaiting()` API
- `@serwist/next` index.react.d.ts -- `SerwistProvider`, `useSerwist` hook API
- Existing codebase: `sw.ts`, `use-install-prompt.ts`, `use-online-status.ts`, `Layout.tsx`, `Settings.tsx`
- MDN Web Push API documentation (training data, stable API)

### Secondary (MEDIUM confidence)
- [Serwist getting started docs](https://serwist.pages.dev/docs/next/getting-started) -- registration options
- Web Push VAPID spec (RFC 8292) -- well-established standard

### Tertiary (LOW confidence)
- iOS Safari push support details -- rapidly evolving; verify current state on target iOS versions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed or well-known
- Architecture: HIGH - follows existing codebase patterns exactly
- Pitfalls: HIGH - well-documented browser API limitations
- iOS push quirks: MEDIUM - Apple changes push behavior between iOS versions

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable APIs, low churn)
