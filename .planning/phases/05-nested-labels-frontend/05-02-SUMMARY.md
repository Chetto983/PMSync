---
phase: 05-nested-labels-frontend
plan: 02
status: complete
started: 2026-02-07
completed: 2026-02-07
---

## What was done

### Task 1: LabelTreeDndWrapper — drag-drop with projection + move mutation

Created `LabelTreeDndWrapper.tsx` (~335 lines) with a separate DndContext from EmailLayout to avoid collision. Uses the @dnd-kit flattened tree pattern with `getProjection()` for depth calculation from horizontal drag offset.

Key implementation:
- `SortableContext` + `verticalListSortingStrategy` for ordering
- `PointerSensor` with 8px distance activation constraint
- Projection-based depth calculation during `DragMove` events
- `DragOverlay` with red tint for MAX_DEPTH (5) violation feedback
- `SortableLabelItem` wrapper using `useSortable` hook
- Calls `useMoveLabel` mutation on drag end for persistence
- Calls `useReorderSiblings` for sibling order updates

Updated `LabelTreeItem.tsx` with `forwardRef` for dnd-kit ref passing, `style` and `dragProps` props, and `isDragging` opacity.

Wired `LabelTreeDndWrapper` into `LabelsSidebar.tsx`, replacing raw map with DnD-wrapped rendering.

### Task 2: Context menu enhancements + label search filter

Enhanced `LabelContextMenu.tsx` (~307 lines) with 5 menu items: Edit, Add child label, Change color, Move to..., Delete.

- Internal `MoveToDialog` component (~60 lines) with Select dropdown for target parent
- Pattern: close menu → `setTimeout(0)` → open dialog (avoids MUI portal conflicts)
- `handleMenuClose` deliberately does NOT clear `selectedLabel` so dialogs can reference it

Added label search filter to `LabelsSidebar.tsx`:
- Visible when 6+ labels exist
- Filters tree to matching labels + ancestors via `getAncestorIds`
- Auto-expands ancestors of matches via `expandTo`
- Clear button to restore full tree

### Task 3: Human-verify checkpoint + filter toggle fix

User-reported issue: clicking a label filters emails but clicking again didn't deselect. Fixed toggle behavior on ALL sidebar filters:
- `LabelsSidebar.tsx`: `handleLabelClick` now checks if same label is selected and clears
- `FolderSidebar.tsx`: `handleFolderClick` toggles aggregated folder back to INBOX
- `FolderSidebar.tsx`: `handleProviderFolderClick` toggles provider folder back to INBOX
- Quick filters (Important, VIP) already had toggle behavior

## Commits

- `5c9c5cb1` feat(05-02): drag-drop nesting and reordering for label tree
- `ed720599` feat(05-02): context menu enhancements and label search filter
- `4655dc91` feat(planning): add phase 07 and toggle label filtering
- `597a005b` fix(05-02): toggle deselect on folder sidebar filters

## Key outputs

| File | What it provides |
|------|-----------------|
| `frontend/components/email/labels/LabelTreeDndWrapper.tsx` | DnD context, SortableContext, overlay, drag handlers |
| `frontend/components/email/labels/LabelContextMenu.tsx` | Full context menu (Edit, Add child, Color, Move, Delete) |
| `frontend/components/email/sidebar/LabelsSidebar.tsx` | Tree rendering with search filter + toggle deselect |
| `frontend/components/email/sidebar/FolderSidebar.tsx` | Toggle deselect on all folder filters |

## Verification

- `tsc --noEmit` passes cleanly
- All must_haves from plan satisfied
- User checkpoint approved with filter toggle fix applied
