---
phase: 144-ai-assistant-overlay
plan: "01"
subsystem: frontend
tags: [zustand, i18n, hooks, ai-overlay]
dependency_graph:
  requires: []
  provides: [ai-overlay-store, use-page-context, ai-overlay-translations]
  affects: [frontend/locales/en.ts, frontend/locales/it.ts, frontend/locales/index.ts]
tech_stack:
  added: []
  patterns: [zustand-persist-middleware, react-usememo-route-detection]
key_files:
  created:
    - frontend/stores/ai-overlay-store.ts
    - frontend/hooks/use-page-context.ts
  modified:
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
decisions:
  - "Width-only persistence via Zustand persist partialize; isOpen always ephemeral (D-12)"
  - "usePageContext reads Zustand stores only, no API calls (D-09)"
  - "Deal label left empty: deal name lives in TanStack Query cache, not Zustand"
  - "Calendar metadata includes attendees from selectedEvent (D-08)"
metrics:
  duration: 255s
  tasks_completed: 2
  tasks_total: 2
  completed_date: "2026-04-16"
---

# Phase 144 Plan 01: Foundation Contracts Summary

Zustand AI overlay store with width-only localStorage persistence, reactive usePageContext hook detecting 5 route types via router + store selectors, and 15 i18n keys in en/it under ai.overlay namespace.

## Commits

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Zustand store and i18n translations | 8a519363 | ai-overlay-store.ts, en.ts, it.ts, index.ts |
| 2 | usePageContext hook | 7438a3e4 | use-page-context.ts |

## What Was Built

### Task 1: Zustand Store + i18n

- **ai-overlay-store.ts**: Zustand store with `devtools` + `persist` middleware following email-ui-store pattern. Exports `useAiOverlay`, `DEFAULT_WIDTH` (420), `MIN_WIDTH` (320), `MAX_WIDTH` (600). Width persisted to `pmsync:ai-overlay-width` localStorage key. `isOpen` is ephemeral (per D-12). `setWidth` clamps between MIN/MAX.
- **i18n**: Added `overlay` key under `ai:` in en.ts (15 keys), it.ts (15 keys), and index.ts (type definitions). Keys cover: title, shortcutHint, resizeHandle, commandLabel, commandDescription, close, newConversation, emptyTitle, emptyBody, errorConnection, errorGeneric, and 5 context sub-keys.

### Task 2: usePageContext Hook

- **use-page-context.ts**: Reactive hook using `useRouter()` for pathname/query and Zustand store selectors for `activeThreadId`/`activeEmailId` (email), `selectedContact` (contact), `selectedEvent` (calendar). Returns typed `PageContext` with `type`, `entityId`, `label`, `metadata`. Covers 5 route categories: email, contact, deal, calendar, general. Wrapped in `useMemo` with all reactive dependencies. No API calls per D-09.

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (only pre-existing @serwist/next/typings error, unrelated)
- All exports verified: `useAiOverlay`, `DEFAULT_WIDTH`, `MIN_WIDTH`, `MAX_WIDTH`, `usePageContext`, `PageContext`, `PageContextType`
- Translation keys verified in en.ts, it.ts, and index.ts under `ai.overlay` namespace

## Self-Check: PASSED

- All created files exist on disk
- Both commit hashes found in git log
- Translation overlay keys present in all 3 locale files
- All required exports verified in store and hook files
