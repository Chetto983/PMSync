---
gsd_state_version: 1.0
milestone: v8.0
milestone_name: Progressive Web App
status: planning
stopped_at: Phase 100 UI-SPEC approved
last_updated: "2026-03-23T09:24:15.079Z"
last_activity: 2026-03-23 -- Roadmap created with 6 phases, 21 requirements mapped
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-03-23)

**Core value:** The best professional AI mail client -- fast, intelligent, and secure
**Current focus:** v8.0 Progressive Web App -- Phase 100 (PWA Foundation)

## Current Position

Phase: 100 of 105 (PWA Foundation)
Plan: -- (not yet planned)
Status: Ready to plan
Last activity: 2026-03-23 -- Roadmap created with 6 phases, 21 requirements mapped

Progress: [..........] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: --
- Total execution time: 0 hours

## Accumulated Context

### Decisions

- PWA is frontend-only scope (no backend push trigger in v8.0)
- SW must NOT intercept /api/* (httpOnly cookie auth, TQ caching, SSE)
- Serwist (@serwist/next) for SW compilation, not next-pwa
- Offline email reading via TanStack Query persist to IndexedDB (not SW API caching)
- Background sync: online event as primary, BackgroundSync API as Chromium-only enhancement
- iOS has no beforeinstallprompt, no BackgroundSync -- needs separate code paths
- Manifest via static public/manifest.json (Pages Router, not App Router app/manifest.ts)

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 103: Verify TQ v5 experimental_createPersister compatibility with existing config before implementation
- Phase 104: Safari has zero BackgroundSync support -- online event is the primary replay path
- Phase 105: Check Prisma schema for PushSubscription storage -- may need new model + migration

## Session Continuity

Last session: 2026-03-23T09:24:15.074Z
Stopped at: Phase 100 UI-SPEC approved
Resume file: .planning/phases/100-pwa-foundation/100-UI-SPEC.md
