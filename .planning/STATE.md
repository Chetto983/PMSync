---
gsd_state_version: 1.0
milestone: v8.0
milestone_name: Progressive Web App
status: unknown
stopped_at: Completed 102-02-PLAN.md
last_updated: "2026-03-23T13:58:00.590Z"
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-23)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** Phase 102 — install-experience

## Current Position

Phase: 102 (install-experience) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: ~5min
- Total execution time: ~21 min

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

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 103: Verify TQ v5 experimental_createPersister compatibility with existing config before implementation
- Phase 104: Safari has zero BackgroundSync support -- online event is the primary replay path
- Phase 105: Check Prisma schema for PushSubscription storage -- may need new model + migration

## Session Continuity

Last session: 2026-03-23T13:46:55.852Z
Stopped at: Completed 102-02-PLAN.md
Resume file: None
