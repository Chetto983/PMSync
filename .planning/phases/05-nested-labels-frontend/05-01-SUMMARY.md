# Phase 05 Plan 01: Nested Labels Tree View Summary

**One-liner:** Hierarchical tree sidebar with expand/collapse, parent dropdown, subtree delete, and preset color picker

---
phase: 05
plan: 01
subsystem: frontend-labels
tags: [tree-view, zustand, labels, sidebar, i18n, backend-fix]
dependency-graph:
  requires: []
  provides: [label-tree-utils, label-tree-store, LabelTreeItem, tree-sidebar, parent-dropdown, subtree-delete]
  affects: [05-02 drag-drop]
tech-stack:
  added: []
  patterns: [flattened-tree-projection, zustand-set-persist, aggregate-count-precomputation]
key-files:
  created:
    - frontend/lib/label-tree-utils.ts
    - frontend/stores/label-tree-store.ts
    - frontend/components/email/labels/LabelTreeItem.tsx
  modified:
    - frontend/locales/en.ts
    - frontend/locales/it.ts
    - frontend/locales/index.ts
    - frontend/hooks/queries/use-labels.ts
    - frontend/components/email/sidebar/LabelsSidebar.tsx
    - frontend/components/email/labels/LabelDialog.tsx
    - frontend/components/email/labels/LabelColorPicker.tsx
    - frontend/components/email/labels/LabelDeleteDialog.tsx
    - backend/src/modules/labels/services/labels.service.ts
decisions:
  - id: collapsed-means-not-in-set
    text: "expandedIds set tracks EXPANDED labels, not collapsed. Labels start collapsed by default."
    rationale: "Matches the context decision: collapsed by default on page load."
  - id: guide-lines-via-absolute-positioned-boxes
    text: "VS Code-style vertical guide lines rendered as absolute-positioned Box elements per depth level."
    rationale: "Clean implementation, no extra DOM nesting, works with variable indentation."
  - id: aggregate-count-in-buildTree
    text: "Aggregate email counts computed recursively during buildTree, not per-render."
    rationale: "Avoids cascading re-renders when any descendant count changes (Pitfall 5 from research)."
  - id: preset-color-only
    text: "LabelColorPicker default changed from showCustom=true to showCustom=false."
    rationale: "Context decision: preset palette of 12 colors as clickable swatches, no custom hex."
metrics:
  duration: ~12 minutes
  completed: 2026-02-07
---

## What Was Done

### Task 1: Infrastructure (i18n, tree utils, expansion store, query hooks, backend fix)

1. **i18n strings** -- Added 10 new nested label keys to `en.ts`, `it.ts`, and `index.ts` types: `parentLabel`, `noParent`, `addChildLabel`, `changeColor`, `moveTo`, `deleteSubtreeWarning`, `searchLabelsPlaceholder`, `depthLimitReached`, `collapseAll`, `expandAll`.

2. **Tree utilities** (`frontend/lib/label-tree-utils.ts`, 252 lines) -- Pure functions following the official dnd-kit tree example:
   - `buildTree()` -- Converts flat API labels to nested TreeItem[] with recursive aggregate counts
   - `flattenTree()` -- Flattens tree to display-order array, skipping collapsed children
   - `getProjection()` -- Calculates projected drop position from drag offset (for Plan 05-02)
   - `getDescendantIds()` -- Recursive descendant collection from tree
   - `getDescendantIdsFlat()` -- Descendant collection from flat array (walking parentId)
   - `getAncestorIds()` -- Walk up parentId chain
   - `MAX_DEPTH = 5` constant

3. **Zustand expansion store** (`frontend/stores/label-tree-store.ts`, 92 lines) -- Persists to localStorage:
   - `expandedIds: Set<string>` -- tracks which labels are expanded
   - `toggleExpanded`, `expandTo`, `collapseAll`, `expandAll`, `pruneStaleIds`
   - JSON serialization: Set -> Array for storage, Array -> Set on hydration

4. **useMoveLabel mutation** -- Added to `use-labels.ts` with optimistic updates for parentId and orderIndex changes. Will be used by Plan 05-02 drag-drop.

5. **Backend subtree delete** -- Added `archiveDescendants()` private method to `labels.service.ts`. Recursively soft-deletes all descendants when a parent label is deleted. Fixes Pitfall 1 from research.

### Task 2: Components (LabelTreeItem, LabelsSidebar rewrite, dialog updates)

1. **LabelTreeItem** (`frontend/components/email/labels/LabelTreeItem.tsx`, 205 lines):
   - Variable indentation: 16px for levels 0-1, 8px for levels 2+
   - VS Code-style vertical guide lines per depth level
   - Colored left border (3px solid, label's color)
   - Chevron expand/collapse (only if hasChildren)
   - Aggregate email count (right-aligned, caption)
   - Three-dot menu (opacity 0 -> 1 on hover)
   - Dimmed empty parents (opacity 0.6 when aggregateCount===0 and hasChildren)
   - forwardRef for future @dnd-kit integration

2. **LabelsSidebar rewrite** (376 lines):
   - Replaced flat `userLabels.map()` with `buildTree() -> flattenTree() -> LabelTreeItem` pipeline
   - Uses `useLabelTreeStore` for expansion state
   - Prunes stale expansion IDs via useEffect
   - Preserves collapsed sidebar behavior (flat icon list when sidebar collapsed)
   - CollapsedLabelList extracted as internal component

3. **LabelDialog parent dropdown**:
   - Added `defaultParentId` prop
   - Added `parentId` state and `<Select>` dropdown
   - Filters out self and descendants to prevent circular references
   - Disables labels at MAX_DEPTH-1 in dropdown
   - Passes parentId in both create and update mutations
   - Set `showCustom={false}` on LabelColorPicker

4. **LabelColorPicker** -- Changed default `showCustom` from `true` to `false`.

5. **LabelDeleteDialog subtree warning**:
   - Computes descendant count via `getDescendantIdsFlat`
   - Shows warning box with AlertTriangle icon when children exist
   - Lists first 5 child label names, "+N more" for the rest
   - Standard warning shown for leaf labels

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| expandedIds tracks expanded (not collapsed) labels | Collapsed by default matches context decision |
| Guide lines via absolute-positioned Box elements | Clean, no extra nesting, works with variable indent |
| Aggregate counts computed in buildTree | Avoids cascading re-renders (Research Pitfall 5) |
| Preset-only color picker | Context: "No custom hex" |
| getDescendantIdsFlat for flat arrays | LabelDeleteDialog and LabelDialog work with flat Label[], not TreeItem[] |

## Deviations from Plan

### Commit artifact

**Task 2 files were committed as part of an unrelated commit `869e97e3` (docs(06): create phase plan).**
- **Cause:** A concurrent process staged and committed planning files alongside my working tree changes during the pre-commit hook cycle.
- **Impact:** Task 2 code is committed and correct, but the commit message does not reflect the label tree changes.
- **Task 1 commit is clean:** `374094a7` contains only Task 1 infrastructure files.

### Auto-added (Rule 2)

**1. [Rule 2 - Missing Critical] Added `getDescendantIdsFlat` utility**
- Not explicitly in the plan, but needed by LabelDeleteDialog and LabelDialog to compute descendants from flat Label[] arrays (not TreeItem[]).
- Added to `label-tree-utils.ts`.

**2. [Rule 2 - Missing Critical] Added `CollapsedLabelList` internal component**
- Extracted collapsed sidebar label rendering into a separate function to keep LabelsSidebar clean when sidebar is collapsed (flat icon list behavior preserved from original).

## Verification Results

| Check | Result |
|-------|--------|
| `npm run type-check` frontend | PASS |
| `npm run type-check` backend | PASS |
| `eslint` on modified components | PASS (0 warnings) |
| All files under 500 lines | PASS (max 376 lines) |
| label-tree-utils.ts exports all 6 items | PASS |
| label-tree-store.ts exports useLabelTreeStore | PASS |
| use-labels.ts exports useMoveLabel | PASS |
| backend archiveDescendants method exists | PASS |
| LabelDialog has parent dropdown | PASS |
| LabelColorPicker showCustom=false | PASS |
| LabelDeleteDialog shows subtree warning | PASS |

## Next Phase Readiness

**Plan 05-02 (Drag-Drop)** is unblocked:
- `getProjection()` ready for drag offset calculation
- `LabelTreeItem` has `forwardRef`, `dragProps`, `isDragging`, `style` props ready
- `useMoveLabel` mutation ready for drop handler
- Tree structure renders correctly for drag overlay

No blockers. No concerns.
