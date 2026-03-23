# Feature Landscape: PWA

**Domain:** PWA capabilities for an existing AI email client (PMSync)
**Researched:** 2026-03-23
**Confidence:** HIGH

## Scope Note

This document covers only PWA-specific features for v8.0. The following are already shipped and NOT re-listed:
- Full email client (VList, TipTap, kanban, keyboard nav, search, dark mode)
- AI chat with streaming, 20 tools, HITL approval, tool renderers
- Calendar, contacts, CRM, admin panel, settings
- All pages polished with loading/error/empty states
- Lighthouse CI with LCP/TTI/CLS budgets
- httpOnly cookie auth, AES-256-GCM encryption, tenant isolation

**Milestone scope boundary:** Frontend only. No backend push triggers (BullMQ -> web-push) in v8.0.

---

## Table Stakes (Users Expect These)

Features users assume exist once an app claims to be installable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Web App Manifest with full icon set | Required for installability. Chrome/Edge/Safari all require a valid manifest. | LOW | Next.js 16 has built-in `app/manifest.ts`. Need 192x192, 512x512 minimum. Use `display: standalone`, PMSync teal as `theme_color`. |
| Service worker registration | Required for installability on all platforms. Browser needs registered SW. | LOW | Serwist handles compilation of `app/sw.ts` -> `public/sw.js`. Registration via Serwist's client-side helper or manual `navigator.serviceWorker.register()`. |
| Offline fallback page | When user opens app offline and navigates to uncached route, they see branded PMSync page, not Chrome's dinosaur. | LOW | Serwist precaches `/~offline` page. SW serves it as fallback for failed navigation requests. |
| App shell caching (static assets) | JS/CSS/fonts must load from cache so app opens instantly. | MEDIUM | Serwist's `defaultCache` handles Next.js static assets with StaleWhileRevalidate. Precache manifest auto-generated at build time. |
| Install prompt UX | Users need to know they CAN install. Chrome shows mini-infobar but easy to miss. iOS has zero native prompt. | MEDIUM | `beforeinstallprompt` on Android/desktop Chrome/Edge. Manual instructions for iOS Safari (share > Add to Home Screen). MUI Snackbar banner. |
| Standalone display theming | Installed app title bar, status bar, splash screen must match PMSync branding. | LOW | `theme_color` and `background_color` in manifest. PMSync already has `viewport-fit=cover` and safe area tokens (v2.1). |

## Differentiators (Competitive Advantage)

Features that elevate PMSync from "installable website" to "feels like a native email app."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Offline email reading (cached inbox) | Users can read recently synced emails without network. Outlook PWA and Gmail offline both offer this. | HIGH | SW intercepts `/api/v1/emails` GET requests, caches with NetworkFirst (5s timeout). Email bodies cached with CacheFirst on read. idb-keyval for structured offline data. Must handle pagination (cache first N pages), skip attachments (too large). |
| Push notification frontend plumbing | Users can opt in to email notifications. Having VAPID subscription + SW push handler ready means it works when backend ships. | MEDIUM | VAPID key generation, `PushManager.subscribe()`, subscription sent to backend API. SW `push` event handler with `showNotification`. iOS requires installed PWA (iOS 16.4+). Settings page toggle. |
| Background sync for queued offline actions | Mark read, archive, star while offline. Actions queue and replay on reconnect. Makes app feel trustworthy. | HIGH | BackgroundSync API works in Chromium only (~70%). Fallback: store in idb-keyval, replay on `online` event. Must handle idempotent operations only. Integrates with existing Zustand optimistic update patterns. |
| SW update notification | "New version available" snackbar on deploy. User clicks to refresh. | LOW | SW `updatefound` event + MUI Snackbar. Prevents stale-app confusion. Professional touch. |
| Online/offline indicator | Subtle bar showing "Offline - changes will sync when reconnected." | LOW | `navigator.onLine` + events. MUI Alert at top of layout. Zustand `isOnline` state. |

## Anti-Features (Do NOT Build)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full offline compose-and-send | "Write emails offline" | Requires SMTP queue, attachment handling, draft conflict resolution. Outlook PWA does NOT reliably support this. PROJECT.md lists full offline-first as out of scope. | Show "offline" badge on compose. Queue simple idempotent actions only. |
| Cache all attachments offline | "Need attachments when traveling" | 100 emails with attachments = 2.5GB cache. Quota limits exist (~60% of disk on Chrome). | Cache text bodies only. Show "attachment available online" placeholder. |
| Periodic background sync | "Keep inbox updated when closed" | Chrome-only, requires engagement heuristic, minimum interval browser-decided (12+ hours). Unreliable. | Push notifications (future milestone) for alerts. TanStack Query refetches on app open via staleTime. |
| Full route precaching | "Instant navigation everywhere" | PMSync has 12+ pages. Precaching all wastes bandwidth. Most users live in inbox. | Precache app shell only. Runtime-cache pages on first visit. |
| Serwist bypass for manual SW | "Simpler without a library" | Manual SW for offline caching requires hand-rolling precache manifests, cache versioning, route matching, update lifecycle. Serwist provides all of this for Next.js. | Use Serwist. Next.js official docs recommend it for offline. |
| Badge API unread count | "Show unread on home screen icon" | `navigator.setAppBadge()` works Chrome/Edge/Android only. NOT iOS. Needs backend push or periodic sync to keep current while closed. | Document title `(5) PMSync - Inbox` works everywhere. Progressive enhancement only. |

## Feature Dependencies

```
Web App Manifest
    |
    +---> Install Prompt UX (requires valid manifest for beforeinstallprompt)
    |
    +---> Standalone Display Theming (manifest theme_color/background_color)

Service Worker Registration (Serwist)
    |
    +---> Offline Fallback Page (SW intercepts failed navigations)
    |
    +---> App Shell Caching (SW caches static assets via precache manifest)
    |         |
    |         +---> Offline Email Reading (extends SW with API response caching)
    |
    +---> Push Notification Subscription (SW handles push events)
    |
    +---> Background Sync (SW handles sync events)
              |
              +---> Queued Actions Replay (idb-keyval queue + sync/online handler)

Online/Offline Detection (browser API)
    |
    +---> Offline Indicator UI
    |
    +---> Background Sync trigger (online event -> flush queue)
```

## MVP Definition

### Launch With (v8.0)

- [ ] Web App Manifest (`app/manifest.ts`) with 192/512/maskable icons -- LOW effort
- [ ] Service Worker via Serwist with app shell caching + offline fallback -- MEDIUM effort
- [ ] Install prompt UX (beforeinstallprompt + iOS instructions) -- MEDIUM effort
- [ ] Offline email reading (NetworkFirst inbox, CacheFirst bodies) -- HIGH effort, core value
- [ ] Push notification frontend plumbing (VAPID, subscription UI, SW handler) -- MEDIUM effort
- [ ] Background sync for queued offline mutations -- HIGH effort

### Defer (v8.x+)

- [ ] TanStack Query `persistQueryClient` bridge to IndexedDB -- add when cold start latency is measurable problem
- [ ] Notification action buttons (Reply, Archive) -- add when backend push triggers ship
- [ ] Badge API unread count -- progressive enhancement, low priority
- [ ] Explicit "pin for offline" per-email -- future based on usage data

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Web App Manifest | HIGH | LOW | P1 |
| Service Worker + app shell cache | HIGH | MEDIUM | P1 |
| Offline fallback page | MEDIUM | LOW | P1 |
| Install prompt UX | HIGH | MEDIUM | P1 |
| Offline email reading | HIGH | HIGH | P1 |
| Push notification frontend | HIGH | MEDIUM | P1 |
| Background sync queued actions | MEDIUM | HIGH | P1 |
| SW update notification | MEDIUM | LOW | P1 |
| Online/offline indicator | MEDIUM | LOW | P1 |
| TanStack Query persistence | MEDIUM | HIGH | P2 |
| Notification action buttons | LOW | MEDIUM | P3 |
| Badge API unread count | LOW | LOW | P3 |

## Existing Feature Integration Points

| Existing Feature | PWA Integration | Notes |
|------------------|-----------------|-------|
| TanStack Query (`staleTime: 5min`, `gcTime: 30min`) | SW caching mirrors TQ strategy. NetworkFirst in SW matches TQ behavior. | TQ handles refetch-on-focus. SW adds disk persistence. |
| Zustand email-ui-store (optimistic updates) | Background sync integrates with existing optimistic patterns. Offline: Zustand updates UI; action queues to idb-keyval for SW replay. | Extend existing patterns, don't replace them. |
| VList virtualization | Offline cached inbox must work with VList. Cache enough metadata for 100-200 items. | VList renders from TQ cache; if SW serves cached API response, VList works unchanged. |
| Dark mode + MUI theming | Manifest `theme_color` must work in both light and dark mode. | PMSync teal `hsl(189, 70%, 50%)` is theme-neutral. |
| httpOnly cookie auth | SW fetch requests automatically include cookies (same-origin). Cross-origin API needs CORS to allow credentials. | Session expiry while offline = redirect to login on reconnect. |
| Lighthouse CI | Add PWA audit category to existing pipeline. | Already have LCP/TTI/CLS budgets. Add installability + offline checks. |

## Sources

- [Next.js PWA Guide (official, v16)](https://nextjs.org/docs/app/guides/progressive-web-apps) -- HIGH confidence
- [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) -- HIGH confidence
- [MDN: Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) -- HIGH confidence
- [Serwist Next.js docs](https://serwist.pages.dev/docs/next/getting-started) -- HIGH confidence
- [Workbox Background Sync](https://developer.chrome.com/docs/workbox/retrying-requests-when-back-online/) -- HIGH confidence

---
*Feature research for: PWA capabilities in AI email client*
*Researched: 2026-03-23*
