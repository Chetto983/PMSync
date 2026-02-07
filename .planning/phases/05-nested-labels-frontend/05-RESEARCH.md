# Phase 05: Nested Labels Frontend - Research

**Researched:** 2026-02-07
**Domain:** React tree view with drag-drop (MUI + @dnd-kit), Zustand state, TanStack Query
**Confidence:** HIGH

## Summary

This phase transforms the existing flat `LabelsSidebar` component into a hierarchical tree view with drag-drop nesting, context menu management, and search. The backend API already supports full nested label CRUD (parentId, level, orderIndex, circular reference detection, children include). The frontend currently renders labels as a flat list using TanStack Query. The core challenge is implementing the tree flattening/projection pattern required by @dnd-kit for cross-level drag-and-drop, and wiring up zone-based drop detection (ON a label = nest, BETWEEN labels = reorder).

The project already uses `@dnd-kit/core@^6.3.1` and `@dnd-kit/sortable@^10.0.0` for folder sidebar drag-drop. The existing `EmailLayout` provides a shared `DndContext` wrapping the entire sidebar + email list. The labels tree will need its own `SortableContext` (or a dedicated `DndContext`) since labels are semantically separate from folders/emails.

**Primary recommendation:** Use the official dnd-kit flattened tree pattern (from `stories/3 - Examples/Tree/`) as the architecture. Flatten the tree, track `parentId`/`depth` per item, use `getProjection()` to calculate drop target depth from horizontal drag offset, and `buildTree()` to reconstruct. Do NOT use nested `SortableContext` (breaks cross-level dragging). Do NOT add `dnd-kit-sortable-tree` (unmaintained, last published 2+ years ago, API mismatch with @dnd-kit/sortable@10).

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | ^6.3.1 | DnD primitives | Already in project, used by folders/emails |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable preset | Already in project, provides `useSortable` |
| `@dnd-kit/utilities` | ^3.2.2 | CSS transform helpers | Already in project |
| `@mui/material` | ^7.3.7 | UI components | Project standard |
| `@tanstack/react-query` | ^5.90.20 | Server state | Project standard |
| `zustand` | ^5.0.10 | Client state | Project standard |
| `lucide-react` | ^0.563.0 | Icons | Project standard |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `framer-motion` | ^12.29.0 | Animations | Expand/collapse transitions |
| `use-debounce` | ^10.1.0 | Search debounce | Label search input |

### No New Dependencies Needed
Everything required is already installed. The tree utilities (flatten, buildTree, getProjection) will be hand-written following the official dnd-kit example pattern -- these are ~150 lines of pure utility functions, not library code.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled tree utils | `dnd-kit-sortable-tree` npm package | Package is 2+ years unmaintained, depends on older @dnd-kit versions, overkill wrapper. Hand-rolling ~150 lines is safer. |
| @dnd-kit flattened tree | Nested `SortableContext` | Nested context prevents cross-level dragging. Flattened is the only viable approach. |
| @dnd-kit | `react-dnd` | Project already uses @dnd-kit everywhere. Mixing DnD libs is insane. |

## Architecture Patterns

### Recommended Project Structure

New/modified files:
```
frontend/
├── components/email/
│   ├── sidebar/
│   │   └── LabelsSidebar.tsx          # MODIFY: Replace flat list with tree
│   ├── labels/
│   │   ├── LabelDialog.tsx            # MODIFY: Add parent dropdown
│   │   ├── LabelContextMenu.tsx       # MODIFY: Add "Add child", "Change color", "Move to"
│   │   ├── LabelDeleteDialog.tsx      # MODIFY: Warn about subtree deletion
│   │   ├── LabelColorPicker.tsx       # NO CHANGE (remove custom hex per decision)
│   │   ├── LabelTreeItem.tsx          # NEW: Single tree row component
│   │   └── LabelTreeDndWrapper.tsx    # NEW: DnD context + sortable for labels tree
├── lib/
│   └── label-tree-utils.ts            # NEW: flattenTree, buildTree, getProjection
├── stores/
│   └── label-tree-store.ts            # NEW: Zustand store for expansion state + DnD
├── hooks/queries/
│   └── use-labels.ts                  # MODIFY: Add tree-building query, mutations for move/reorder
├── locales/
│   ├── en.ts                          # MODIFY: Add nested label i18n strings
│   └── it.ts                          # MODIFY: Add nested label i18n strings
```

### Pattern 1: Flattened Tree with Projection

**What:** Convert nested tree data into a flat sorted array where each item carries `parentId`, `depth`, and `index`. During drag, calculate projected depth from horizontal offset.

**When to use:** Any tree drag-drop where items need to move between levels.

**Architecture:**
```
API Response (flat list with parentId)
  → buildTree() → nested TreeItem[]
  → flattenTree() → FlattenedItem[] (filtered by collapsed state)
  → SortableContext items={flattenedIds}
  → During drag: getProjection(items, activeId, overId, offsetLeft, indentWidth)
  → On drop: updateLabel({ parentId, orderIndex }) API call
```

**Key types:**
```typescript
// Source: dnd-kit official tree example
interface TreeItem {
  id: string;
  children: TreeItem[];
  collapsed?: boolean;
  // Label-specific data
  name: string;
  color: LabelColor | null;
  level: number;
  parentId: string | null;
  _count?: { emailLabels: number };
}

interface FlattenedItem extends TreeItem {
  parentId: string | null;
  depth: number;
  index: number;
}
```

### Pattern 2: Zone-Based Drop Detection

**What:** Distinguish between "drop ON a label" (nest as child) vs "drop BETWEEN labels" (reorder at same level). This is the Notion sidebar pattern specified in decisions.

**When to use:** When the same drag action should have different outcomes based on drop position.

**Implementation approach:**
- The `getProjection()` function handles this. Horizontal drag offset determines depth change:
  - Drag right → increase depth (nest under previous sibling)
  - Drag left → decrease depth (move to parent's level)
  - Vertical position determines order within the target level
- No separate drop zones needed. The projection math handles it.
- Visual feedback: indentation line shifts during drag to show projected position.

### Pattern 3: Expansion State in Zustand with localStorage Persistence

**What:** Track which labels are expanded/collapsed, persist across sessions.

**When to use:** The decisions specify "collapsed by default on page load, remembers expansion state across sessions."

**Implementation:**
```typescript
// label-tree-store.ts
interface LabelTreeStore {
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  expandTo: (id: string, labels: Label[]) => void; // Auto-expand ancestors
  collapseAll: () => void;
}

// Use Zustand persist middleware (same pattern as email-ui-store)
persist(
  (set) => ({ ... }),
  {
    name: 'label-tree-storage',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
      expandedIds: Array.from(state.expandedIds), // Set → Array for JSON
    }),
  }
)
```

### Anti-Patterns to Avoid

- **Nested SortableContext for tree levels:** Breaks cross-level dragging entirely. Use flat list + projection instead.
- **Using label-store.ts (Zustand) for server data:** Labels are server state, use TanStack Query (useLabels hook already exists). Zustand is only for client UI state (expansion, DnD state).
- **Separate DndContext for labels:** The EmailLayout already wraps everything in a DndContext. Labels must integrate with it OR use a clearly separate context with different drag types to avoid collision. Since labels and folders/emails are separate drag concerns, a separate DndContext scoped to the labels section is cleaner.
- **Querying API for each tree level:** The `GET /labels` endpoint returns ALL labels flat. Build the tree client-side.
- **Custom hex color picker:** Decisions explicitly say "preset palette of 12-16 colors as clickable swatches. No custom hex." The existing `LabelColorPicker` wraps `ColorPicker` with `showCustom={true}` -- this needs to change to `showCustom={false}` and limit to preset palette only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS transforms during drag | Custom transform math | `@dnd-kit/utilities` CSS.Transform | Handles vendor prefixes, transition merging |
| Keyboard sortable coordinates | Custom keyboard nav | `sortableKeyboardCoordinates` from @dnd-kit | Accessibility compliance built in |
| Optimistic reorder rollback | Manual state rollback | TanStack Query `onMutate`/`onError` pattern | Already proven in `useReorderLabels` hook |
| Tree flatten/build | Nothing -- DO hand-roll | ~150 lines of utility functions | Official dnd-kit example is the pattern. No library needed. |

**Key insight:** The tree utilities are pure functions (~150 lines total). They are NOT complex enough to justify a dependency. The official dnd-kit example provides the exact pattern. Copy the approach, adapt to Label types.

## Common Pitfalls

### Pitfall 1: Backend Delete Does Not Cascade to Children
**What goes wrong:** User deletes a parent label. Backend soft-deletes ONLY the parent (`isArchived: true`). Children become orphans with invalid `parentId`.
**Why it happens:** The backend `delete()` method (labels.service.ts:192-213) only updates the target label. The Prisma schema has `onDelete: Cascade` on the relation, but since it's a soft-delete (update, not delete), Prisma cascade doesn't trigger.
**How to avoid:** The backend needs to be updated to also soft-delete all descendants when deleting a parent. OR the frontend must send individual delete requests for each descendant. The cleanest fix is a backend change: add recursive child archival in `LabelsService.delete()`.
**Warning signs:** After deleting a parent, child labels appear as orphaned root-level items.

### Pitfall 2: findAllByTenant Returns Only 1 Level of Children
**What goes wrong:** The API `GET /labels` includes `children` but only 1 level deep (Prisma doesn't do recursive includes).
**Why it happens:** Prisma `include: { children: {...} }` is not recursive.
**How to avoid:** Don't rely on the `children` include for tree building. Instead, use the flat list of ALL labels (which ARE all returned) and build the tree client-side using `parentId` references. The `children` include is a convenience for single-level display but useless for deep trees.
**Warning signs:** Labels at depth 3+ don't appear in the tree.

### Pitfall 3: DndContext Collision with Existing Email/Folder Drag
**What goes wrong:** Dragging a label triggers folder/email drop handlers, or dragging an email triggers label handlers.
**Why it happens:** The EmailLayout's shared DndContext handles all drag events. If labels are added to the same context, the `handleDragEnd` in EmailLayout will try to process label drags as email/folder drags.
**How to avoid:** Either (a) use a separate DndContext for the labels tree (recommended, simpler), or (b) add a `label` drag type to the shared context and update EmailLayout's handleDragEnd to handle it. Option (a) is safer because label drag-drop is self-contained (labels only move within the labels tree, not between labels and folders/emails).
**Warning signs:** Dragging a label causes emails to move or folders to reorder.

### Pitfall 4: Max Depth 5 Not Enforced by Backend
**What goes wrong:** User drags a label to depth 6+, backend accepts it (no validation).
**Why it happens:** Backend has no max depth check.
**How to avoid:** Enforce max depth 5 in `getProjection()` -- clamp projected depth to max 4 (0-indexed). Show visual feedback (red drop zone) when depth would exceed limit.
**Warning signs:** Labels nest infinitely deep, breaking sidebar layout.

### Pitfall 5: Aggregate Unread Count Performance
**What goes wrong:** Computing sum of children's unread counts on every render causes cascading re-renders.
**Why it happens:** If computed inline, every label re-renders when any descendant's count changes.
**How to avoid:** Pre-compute aggregate counts once when building the tree (in the `buildTree` utility or as a `useMemo`). Store aggregated counts in the tree data structure. Don't recompute per-render.
**Warning signs:** Sidebar feels sluggish with many labels.

### Pitfall 6: Expansion State Desync After Label Delete/Move
**What goes wrong:** Expanded IDs in Zustand reference deleted labels, causing stale state.
**Why it happens:** Zustand persist stores IDs that no longer exist after deletion.
**How to avoid:** When labels query data changes, prune `expandedIds` to only include IDs that still exist in the labels list. Add cleanup logic in a `useEffect` or in the store subscriber.
**Warning signs:** Console warnings, phantom expand/collapse behavior.

## Code Examples

### Tree Utility Functions (Core Pattern)

```typescript
// Source: Official dnd-kit tree example pattern
// File: frontend/lib/label-tree-utils.ts

const MAX_DEPTH = 5;

interface TreeItem {
  id: string;
  name: string;
  parentId: string | null;
  children: TreeItem[];
  collapsed?: boolean;
  depth: number;
  // ... other label fields
}

interface FlattenedItem extends TreeItem {
  index: number;
}

/**
 * Flatten nested tree into sorted array with depth metadata.
 * Skips children of collapsed nodes.
 */
export function flattenTree(
  items: TreeItem[],
  parentId: string | null = null,
  depth: number = 0
): FlattenedItem[] {
  return items.reduce<FlattenedItem[]>((acc, item, index) => {
    const flatItem: FlattenedItem = { ...item, parentId, depth, index };
    acc.push(flatItem);
    if (!item.collapsed && item.children.length > 0) {
      acc.push(...flattenTree(item.children, item.id, depth + 1));
    }
    return acc;
  }, []);
}

/**
 * Build nested tree from flat labels array using parentId references.
 */
export function buildTree(flatLabels: Label[]): TreeItem[] {
  const map = new Map<string, TreeItem>();
  const roots: TreeItem[] = [];

  // First pass: create TreeItem for each label
  for (const label of flatLabels) {
    map.set(label.id, {
      ...label,
      children: [],
      depth: label.level,
    });
  }

  // Second pass: wire parent-child relationships
  for (const label of flatLabels) {
    const node = map.get(label.id)!;
    if (label.parentId && map.has(label.parentId)) {
      map.get(label.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort children by orderIndex
  const sortChildren = (items: TreeItem[]) => {
    items.sort((a, b) => a.orderIndex - b.orderIndex);
    items.forEach((item) => sortChildren(item.children));
  };
  sortChildren(roots);

  return roots;
}

/**
 * Calculate projected drop position during drag.
 * Returns { depth, parentId, maxDepth } based on horizontal offset.
 */
export function getProjection(
  items: FlattenedItem[],
  activeId: string,
  overId: string,
  dragOffset: number,
  indentationWidth: number
): { depth: number; parentId: string | null } {
  const overItemIndex = items.findIndex(({ id }) => id === overId);
  const activeItemIndex = items.findIndex(({ id }) => id === activeId);
  const activeItem = items[activeItemIndex];

  const newItems = arrayMove(items, activeItemIndex, overItemIndex);
  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];

  const projectedDepth = activeItem.depth + Math.round(dragOffset / indentationWidth);

  const maxDepth = previousItem
    ? Math.min(previousItem.depth + 1, MAX_DEPTH - 1)
    : 0;
  const minDepth = nextItem ? nextItem.depth : 0;

  let depth = Math.min(Math.max(projectedDepth, minDepth), maxDepth);
  depth = Math.min(depth, MAX_DEPTH - 1); // Enforce max depth

  // Find parentId for the projected depth
  const getParentId = (): string | null => {
    if (depth === 0) return null;
    const closestParent = newItems
      .slice(0, overItemIndex)
      .reverse()
      .find((item) => item.depth === depth - 1);
    return closestParent?.id ?? null;
  };

  return { depth, parentId: getParentId() };
}
```

### Label Tree Item Component (Single Row)

```typescript
// Source: Project patterns from SortableFolderItem.tsx + decisions
// File: frontend/components/email/labels/LabelTreeItem.tsx

export function LabelTreeItem({
  label,
  depth,
  isCollapsed,
  isSelected,
  onToggle,
  onClick,
  onContextMenu,
  aggregateUnread,
}: LabelTreeItemProps) {
  const hasChildren = label.children.length > 0;
  const isEmpty = (label._count?.emailLabels ?? 0) === 0 && !hasChildren;

  // Variable indentation: 16px for levels 0-1, 8px for levels 2+
  const indent = depth <= 1 ? depth * 16 : 2 * 16 + (depth - 2) * 8;

  return (
    <ListItemButton
      selected={isSelected}
      onClick={onClick}
      onContextMenu={onContextMenu}
      sx={{
        pl: `${indent + 8}px`,
        minHeight: 32,
        borderLeft: `3px solid ${label.color?.backgroundColor || '#9e9e9e'}`,
        opacity: isEmpty ? 0.6 : 1, // Dim empty parents
      }}
    >
      {/* Chevron for expand/collapse */}
      {hasChildren && (
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </IconButton>
      )}

      {/* Label name */}
      <ListItemText primary={label.name} />

      {/* Aggregate unread count */}
      {aggregateUnread > 0 && (
        <Typography variant="caption">{aggregateUnread}</Typography>
      )}

      {/* Three-dot menu (hover) */}
      <IconButton className="label-menu-btn" size="small" sx={{ opacity: 0 }}>
        <MoreHorizontal size={14} />
      </IconButton>
    </ListItemButton>
  );
}
```

### Expansion State Store

```typescript
// Source: Project pattern from email-ui-store.ts persist middleware
// File: frontend/stores/label-tree-store.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface LabelTreeStore {
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  expandTo: (targetId: string, allLabels: Label[]) => void;
  collapseAll: () => void;
  pruneStaleIds: (validIds: Set<string>) => void;
}

export const useLabelTreeStore = create<LabelTreeStore>()(
  persist(
    (set) => ({
      expandedIds: new Set<string>(),

      toggleExpanded: (id) =>
        set((state) => {
          const next = new Set(state.expandedIds);
          next.has(id) ? next.delete(id) : next.add(id);
          return { expandedIds: next };
        }),

      expandTo: (targetId, allLabels) =>
        set((state) => {
          const next = new Set(state.expandedIds);
          // Walk up from targetId to root, expanding all ancestors
          let current = allLabels.find((l) => l.id === targetId);
          while (current?.parentId) {
            next.add(current.parentId);
            current = allLabels.find((l) => l.id === current!.parentId);
          }
          return { expandedIds: next };
        }),

      collapseAll: () => set({ expandedIds: new Set() }),

      pruneStaleIds: (validIds) =>
        set((state) => {
          const pruned = new Set([...state.expandedIds].filter((id) => validIds.has(id)));
          return { expandedIds: pruned };
        }),
    }),
    {
      name: 'label-tree-expansion',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        expandedIds: [...state.expandedIds], // Set → Array for JSON serialization
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
        expandedIds: new Set((persisted as { expandedIds?: string[] })?.expandedIds || []),
      }),
    }
  )
);
```

### Modified LabelDialog with Parent Dropdown

```typescript
// Key addition to existing LabelDialog.tsx
// Add parent label selector dropdown

<FormControl fullWidth sx={{ mb: 2 }}>
  <InputLabel>{t.email.labels.parentLabel}</InputLabel>
  <Select
    value={parentId ?? ''}
    onChange={(e) => setParentId(e.target.value || null)}
    label={t.email.labels.parentLabel}
  >
    <MenuItem value="">{t.email.labels.noParent}</MenuItem>
    {availableParents.map((parent) => (
      <MenuItem
        key={parent.id}
        value={parent.id}
        disabled={parent.level >= MAX_DEPTH - 1} // Can't nest under labels at max depth
      >
        {'  '.repeat(parent.level)}{parent.name}
      </MenuItem>
    ))}
  </Select>
</FormControl>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Nested SortableContext per level | Flattened tree + projection | dnd-kit examples, stable since 2023 | Cross-level drag works |
| `dnd-kit-sortable-tree` package | Hand-rolled utilities from dnd-kit example | Package unmaintained since 2024 | No stale dependency risk |
| CSS class-based indentation | CSS-in-JS `pl` prop calculation | MUI v7 standard | Dynamic indentation per depth |
| `@dnd-kit/sortable` v8 | `@dnd-kit/sortable` v10 | 2025 | Project already on v10 |

**Deprecated/outdated:**
- `dnd-kit-sortable-tree` npm package: Last published 2+ years ago, depends on older @dnd-kit. Do not use.
- `@dnd-kit/react` (next/experimental): New vanilla-JS API under development. Not stable. Stick with current `@dnd-kit/core` + `@dnd-kit/sortable` React hooks.

## Open Questions

1. **Backend subtree deletion**
   - What we know: Backend `delete()` only soft-deletes the target label, not children. Prisma cascade doesn't fire on soft-delete.
   - What's unclear: Should the backend be fixed in this phase or as a prerequisite?
   - Recommendation: Fix backend to recursively archive children in the same phase. It's ~10 lines of code and blocks the "delete parent deletes subtree" requirement.

2. **Unread count aggregation source**
   - What we know: The API returns `_count: { emailLabels: number }` per label. This is total emails, not unread emails.
   - What's unclear: Whether "aggregate unread count" means emailLabels count (any emails) or actually unread emails. The backend would need a separate query/field for unread-only count.
   - Recommendation: Use `_count.emailLabels` as the count for now. If actual unread count is needed, that requires a backend addition (out of scope for this frontend phase).

3. **Search behavior with child labels**
   - What we know: Decision says "search that includes child labels is in scope."
   - What's unclear: Does this mean searching labels by name filters the tree (showing matches + their ancestors), or does it mean clicking a parent label shows emails from that label AND all child labels?
   - Recommendation: Implement label name search in the tree (filter + show ancestor chain). Email-level search-by-label-hierarchy is a backend concern and likely out of scope.

## Sources

### Primary (HIGH confidence)
- `d:\MailAgent\frontend\components\email\sidebar\LabelsSidebar.tsx` - Current flat labels implementation
- `d:\MailAgent\frontend\lib\api\labels.ts` - Labels API client with types (Label interface has parentId, level, children)
- `d:\MailAgent\frontend\hooks\queries\use-labels.ts` - TanStack Query hooks (already has CRUD mutations)
- `d:\MailAgent\backend\src\modules\labels\services\labels.service.ts` - Backend service (supports parentId, level, circular reference check)
- `d:\MailAgent\backend\prisma\schema.prisma` - UserLabel model (self-referencing LabelHierarchy relation, onDelete: Cascade)
- `d:\MailAgent\frontend\components\email\layout\EmailLayout.tsx` - Shared DndContext for folders/emails
- `d:\MailAgent\frontend\components\email\sidebar\SortableFolderItem.tsx` - Existing @dnd-kit sortable pattern
- `d:\MailAgent\frontend\stores\email-ui-store.ts` - Zustand persist pattern for sidebar state
- `d:\MailAgent\frontend\lib\label-colors.ts` - 12 preset colors (LABEL_COLORS array)
- [dnd-kit official SortableTree example](https://github.com/clauderic/dnd-kit/blob/master/stories/3%20-%20Examples/Tree/SortableTree.tsx) - Reference implementation for flattened tree pattern

### Secondary (MEDIUM confidence)
- [React + dnd-kit tree implementation (DEV.to)](https://dev.to/fupeng_wang/react-dnd-kit-implement-tree-list-drag-and-drop-sortable-225l) - Confirms flattened approach is required, nested SortableContext is broken
- [dnd-kit Sortable documentation](https://docs.dndkit.com/presets/sortable) - Official docs for SortableContext, useSortable
- [dnd-kit-sortable-tree GitHub](https://github.com/Shaddix/dnd-kit-sortable-tree) - Examined and rejected (unmaintained)
- [MUI Menu documentation](https://mui.com/material-ui/react-menu/) - Context menu patterns

### Tertiary (LOW confidence)
- [dnd-kit next API](https://next.dndkit.com/concepts/sortable) - Experimental new API (vanilla JS). Not relevant to current project but noted for awareness.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in project, versions verified from package.json
- Architecture: HIGH - Official dnd-kit tree example provides exact pattern, project has working @dnd-kit setup to reference
- Pitfalls: HIGH - Identified from direct code reading (backend delete gap, children include depth limit, DndContext collision)
- Backend API readiness: HIGH - Directly read labels.service.ts, confirmed parentId/level/circular ref support exists

**Research date:** 2026-02-07
**Valid until:** 2026-03-07 (stable -- all deps are project-locked versions)
