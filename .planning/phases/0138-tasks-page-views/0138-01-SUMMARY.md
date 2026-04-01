---
phase: 0138-tasks-page-views
plan: 01
subsystem: frontend
tags: [api-module, query-hooks, translations, tasks]
dependency_graph:
  requires: []
  provides: [tasks-api-module, tasks-query-hooks, tasks-translations]
  affects: [frontend/lib/api, frontend/hooks/queries, frontend/locales]
tech_stack:
  added: []
  patterns: [tanstack-query-options, query-key-factory, api-module-pattern]
key_files:
  created:
    - frontend/lib/api/tasks.ts
    - frontend/hooks/queries/tasks-keys.ts
    - frontend/hooks/queries/use-tasks.ts
  modified:
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
    - frontend/hooks/queries/index.ts
    - frontend/lib/api/index.ts
decisions:
  - "Mirrored backend DTOs as TypeScript interfaces rather than importing (frontend/backend boundary)"
  - "Used standard axios params serialization for array query params (sourceType[], status[], priority[])"
metrics:
  duration: 142s
  completed: "2026-04-01T21:10:38Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 5
---

# Phase 0138 Plan 01: Tasks Data Layer Summary

Tasks API module, query key factory, TanStack Query hooks, and full i18n translations for the unified Tasks page data layer.

## Completed Tasks

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Create tasks API module, query keys, and query hooks | `9d890f8d` | 3 new files: API client with 5 methods, query key factory, 6 query hooks |
| 2 | Add translations and wire barrel exports | `438c0d52` | Expanded en/it tasks translations (sourceTypes, statuses, priorities, kanban, filters, dialog, counts), updated type defs, barrel re-exports |

## Key Artifacts

**frontend/lib/api/tasks.ts** -- API module with `tasksApi` object exposing `list`, `create`, `update`, `delete`, `complete` methods. Types mirror backend `UnifiedTaskDto`, `ListTasksQueryDto`, `CreateManualTaskDto`, `UpdateManualTaskDto`.

**frontend/hooks/queries/tasks-keys.ts** -- Query key factory: `tasksKeys.all`, `tasksKeys.list(filters)`.

**frontend/hooks/queries/use-tasks.ts** -- TanStack Query hooks: `useTasks`, `useCreateTask`, `useUpdateTask`, `useDeleteTask`, `useCompleteTask`, `taskListOptions`. All mutations invalidate `tasksKeys.all`. staleTime 5min, gcTime 30min, retry 1.

**Translations** -- Both `en.ts` and `it.ts` expanded with 60+ new keys covering sourceTypes, statuses, priorities, kanban messages, filter labels, create/edit dialog labels, count templates, and CRUD feedback messages.

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all data layer modules are fully wired.
