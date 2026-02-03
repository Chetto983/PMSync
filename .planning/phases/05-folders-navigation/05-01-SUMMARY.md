---
phase: 05-folders-navigation
plan: 01
subsystem: frontend-email
tags: [zustand, selection, bulk-actions, shift-click]
requires:
  - 03 (email-ui-store infrastructure)
provides:
  - Store-integrated multi-select
  - Shift+click range selection
  - Bulk action API integration
affects:
  - 05-02 (keyboard navigation uses same selection)
  - 05-03 (drag selection for move)
tech-stack:
  added: []
  patterns:
    - "Zustand store for selection state"
    - "MouseEvent modifier key detection"
key-files:
  created: []
  modified:
    - frontend/components/email/list/ThreadList.tsx
    - frontend/components/email/list/ThreadListItem.tsx
    - frontend/components/email/list/DraggableThreadListItem.tsx
    - frontend/pages/dashboard/email.tsx
decisions:
  - key: selection-state-location
    choice: "Zustand store (email-ui-store)"
    rationale: "Selection persists across re-renders, shared with bulk actions"
  - key: modifier-key-detection
    choice: "Pass MouseEvent from checkbox to parent"
    rationale: "Native browser event has shiftKey/ctrlKey/metaKey"
metrics:
  duration: ~21 minutes
  completed: 2026-02-03
---

# Phase 05 Plan 01: Multi-select with Bulk Actions Summary

## One-liner

Zustand store-backed email selection with Shift+click range and bulk action API wiring.

## What Was Done

### Task 1: Wire ThreadList to Zustand Store
- Replaced local `useState<Set<string>>` with `useEmailUIStore`
- Selection now persists across component re-renders
- Uses store methods: `selectEmail`, `toggleSelection`, `selectRange`, `selectAll`, `clearSelection`

### Task 2: Update ThreadListItem Click Handlers
- Updated `onSelect` signature to accept optional `MouseEvent`
- Checkbox click now passes event to parent for modifier key detection
- Updated both `ThreadListItem` and `DraggableThreadListItem` interfaces

### Task 3: Wire Bulk Actions to API
- Already had TanStack Query mutations in place
- Added `clearSelection()` calls after successful bulk operations
- Updated dependency arrays to include `clearSelection`

## Key Implementation Details

### Shift+Click Range Selection
```typescript
if (event?.shiftKey && lastSelectedId) {
  selectRange(lastSelectedId, id, threadIds);
} else if (event?.ctrlKey || event?.metaKey) {
  toggleSelection(id);
} else {
  selectEmail(id);
}
```

### Bulk Action Completion
Each bulk handler (`handleBulkMarkAsRead`, `handleBulkMarkAsUnread`, `handleBulkArchive`, `handleBulkDelete`) now calls `clearSelection()` after the mutation succeeds.

## Commits

| Hash | Message | Files |
|------|---------|-------|
| 29a621e4 | feat(05-01): wire ThreadList to Zustand store with Shift+click range selection | ThreadList.tsx, ThreadListItem.tsx, DraggableThreadListItem.tsx |
| 54c0f632 | docs(05-03): includes clearSelection wiring | email.tsx |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

1. Type-check: `npm run type-check` passes
2. Lint: Pre-existing unrelated error in EditorMenuControls.tsx (not from this plan)
3. Code verification:
   - `useEmailUIStore` imported in ThreadList.tsx
   - `e.shiftKey` check present in handleSelect
   - `clearSelection()` called in all bulk handlers

## Next Phase Readiness

**05-02 (Keyboard Navigation):** Ready - can use same `useEmailUIStore` for selection state
**05-03 (Nested Folders):** Ready - selection state available for drag operations
