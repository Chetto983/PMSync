---
created: 2026-02-04T10:30
title: Add backend API for kanban column persistence
area: api
files:
  - frontend/components/productivity/KanbanBoard/index.tsx
  - frontend/stores/email-ui-store.ts
---

## Problem

Kanban column assignments (which follow-ups are in which column) are stored in **localStorage only** via Zustand persist. This means:

1. Users lose their kanban arrangement when switching devices
2. No cross-device sync for follow-up status organization
3. Column state is browser-specific, not user-specific

Current implementation uses `FollowupsKanbanBoard` from `components/productivity/KanbanBoard/` which is feature-complete (snooze, keyboard shortcuts, drag-drop) but lacks server-side persistence.

The email page now reuses this component via `EmailKanbanBoard` re-export.

## Solution

TBD - Possible approaches:

1. Add PATCH `/api/v1/voltagent/follow-ups/:id` to update column assignment
2. Store column position in `FollowUp` model
3. Or store as user preference in Settings table

Note: Already documented as blocker in STATE.md (Low severity, Phase 06-02)
