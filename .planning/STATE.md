---
gsd_state_version: 1.0
milestone: v8.0
milestone_name: Progressive Web App
status: unknown
stopped_at: Completed 104-01-PLAN.md
last_updated: "2026-03-23T16:17:54.692Z"
progress:
  total_phases: 6
  completed_phases: 4
  total_plans: 9
  completed_plans: 8
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-23)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** Phase 104 — background-sync

## Current Position

Phase: 104 (background-sync) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Velocity:**

- Total plans completed: 7
- Average duration: ~5min
- Total execution time: ~33 min

## Accumulated Context

### Decisions

- PWA is frontend-only scope (no backend push trigger in v8.0)
- SW must NOT intercept /api/* (httpOnly cookie auth, TQ caching, SSE)
- Serwist (@serwist/next) for SW compilation, not next-pwa
- Offline email reading via TanStack Query persist to IndexedDB (not SW API caching)
- Background sync: online event as primary, BackgroundSync API as Chromium-only enhancement
- iOS has no beforeinstallprompt, no BackgroundSync -- needs separate code paths
- Manifest via static public/manifest.json (Pages Router, not App Router app/manifest.ts)
- [Phase 100]: PWA icons generated from SVG source using sharp, maskable icons use #0c1017 background with 80% safe zone
- [Phase 100]: Serwist 9.x uses matcher/handler pattern (not urlPattern/string), navigateFallbackDenylist in precacheOptions
- [Phase 101]: useSyncExternalStore for browser API subscriptions (online status)
- [Phase 101]: OFFL-04 confirmed via Phase 100 precaching + cacheOnNavigation, not newly implemented
- [Phase 102]: _resetForTesting pattern for module-state hooks (avoids jest.isolateModules React duplication)
- [Phase 102]: Functional localStorage mock needed in tests (jest.setup.ts provides bare stubs)
- [Phase 102]: Positioned InstallPromptBanner after sync status Snackbar and before CookieConsent in Layout.tsx
- [Phase 103]: Return persisterFn (not whole persister object) to match QueryPersister type expected by QueryClient
- [Phase 103]: Updated @tanstack/react-query to 5.95.1 to deduplicate query-core
- [Phase 103]: Selective gcTime -- only email list/detail get 24h; other queries keep short gcTime
- [Phase 103]: Wire clearOfflineData into all 5 signOut call sites, not just Header.tsx
- [Phase 104]: QueuedAction.dto typed as Record<string, unknown> | object to accept UpdateEmailDto without index signature
- [Phase 104]: Separate idb-keyval store (pmsync-action-queue) from query cache (pmsync-query-cache) in same DB

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 103: TQ v5 experimental_createQueryPersister verified compatible (RESOLVED)
- Phase 104: Safari has zero BackgroundSync support -- online event is the primary replay path
- Phase 105: Check Prisma schema for PushSubscription storage -- may need new model + migration

## Session Continuity

Last session: 2026-03-23T16:17:54.686Z
Stopped at: Completed 104-01-PLAN.md
Resume file: None
