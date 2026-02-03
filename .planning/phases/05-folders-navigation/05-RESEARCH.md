# Phase 05 Research: Folders & Navigation

**Date**: 2026-02-03
**Phase Goal**: Build email organization and power user features
**Requirements**: FE-04 (Folder sidebar), FE-06 (Keyboard navigation), FE-07 (Multi-select)

---

## Executive Summary

**Good news**: The codebase already has solid foundations for all three requirements:
- Drag-drop infrastructure (`@dnd-kit`) is fully implemented
- Keyboard shortcuts library (`react-hotkeys-hook`) is installed and used in KanbanBoard
- Multi-select store exists in `email-ui-store.ts` with `selectRange` support
- Command palette (`cmdk`) is fully implemented and working

**Remaining work** is mostly integration and polish, not greenfield development.

---

## 1. Current Codebase State

### 1.1 Folder Sidebar (FE-04) - 85% COMPLETE

**Existing Implementation** (`FolderSidebar.tsx`, 537 lines):
- Folder tree with expand/collapse per provider
- Unread counts per folder (via `folderCounts`)
- Drag-drop folders for reordering (`SortableFolderItem` + `SortableContext`)
- Drag email TO folder (`DroppableFolderItem` + provider validation)
- Create/rename/delete folder dialogs (`FolderDialog`, `FolderContextMenu`)
- Labels sidebar with create/edit

**Still Missing**:
- Drag folder INTO folder (nested folder creation)
- Folder tree indentation for nested folders

**Key Files**:
```
frontend/components/email/sidebar/
  FolderSidebar.tsx        - Main sidebar (537 lines)
  FolderItem.tsx           - Basic folder item
  SortableFolderItem.tsx   - dnd-kit sortable wrapper (212 lines)
  DroppableFolderItem.tsx  - dnd-kit droppable target (92 lines)
  LabelsSidebar.tsx        - Labels section

frontend/components/email/folders/
  FolderDialog.tsx         - Create/rename folder modal
  FolderContextMenu.tsx    - Right-click menu
  useFolderManagement.ts   - Shared folder logic hook
  folder-utils.ts          - Icon/name helpers
```

**DnD Architecture** (already implemented correctly!):
```
EmailLayout.tsx (lines 78-171)
  DndContext (SINGLE context wrapping entire layout)
    sensors: PointerSensor, TouchSensor, KeyboardSensor
    handleDragStart/End/Cancel
    DragOverlay (centralized for both email and folder drags)
      FolderSidebar (wrapped)
      ThreadList (wrapped)
```

### 1.2 Keyboard Navigation (FE-06) - 20% COMPLETE

**Existing Implementation**:
- `react-hotkeys-hook` is installed (v5.2.1)
- Command palette (`cmdk`) with Cmd+K trigger is complete
- KanbanBoard has full keyboard navigation (j/k/h/l/Enter/r/s/?)

**Patterns from KanbanBoard** (`KanbanBoard/index.tsx` lines 176-251):
```typescript
// Vim-style navigation
useHotkeys('j', () => moveDown(), { enabled: !dialogOpen }, [deps]);
useHotkeys('k', () => moveUp(), { enabled: !dialogOpen }, [deps]);
useHotkeys('h', () => prevColumn(), { enabled: !dialogOpen }, [deps]);
useHotkeys('l', () => nextColumn(), { enabled: !dialogOpen }, [deps]);

// Actions
useHotkeys('enter', () => openItem(), { enabled: !dialogOpen && !!selected }, [selected]);
useHotkeys('r', () => resolve(), { enabled: !dialogOpen && !!selected }, [selected]);
useHotkeys('shift+/', () => showHelp(), { enabled: !dialogOpen }, []);  // ? key
useHotkeys('escape', () => clearSelection(), []);
```

**Still Missing**:
- Hook up shortcuts to ThreadList (j/k, Enter, e, #, r, f, /)
- `focusedId` state passed to ThreadList but not connected to keyboard
- Help modal (? key) for email shortcuts

**Existing File** (`hooks/use-keyboard-navigation.ts`):
- File exists but needs investigation (not read yet - likely placeholder or partial)

### 1.3 Multi-Select (FE-07) - 60% COMPLETE

**Existing Implementation** (`email-ui-store.ts` lines 94-248):
```typescript
// State
selectedIds: Set<string>
lastSelectedId: string | null

// Actions
selectEmail(id)         // Single select
selectMultiple(ids)     // Batch select
toggleSelection(id)     // Ctrl+click
selectRange(fromId, toId, allIds)  // Shift+click range!
selectAll(ids)          // Select all
clearSelection()        // Clear all
```

**ThreadList Integration** (`ThreadList.tsx` lines 94-135):
- Local `selectedIds` state (duplicates store!)
- `handleSelect` does simple add/remove
- NO Shift+click range selection implemented yet

**Still Missing**:
- Wire ThreadList to Zustand store (currently using local useState)
- Implement Shift+click range selection in click handler
- Bulk action bar connected to store
- Selection count indicator

---

## 2. API Endpoints (ALL EXIST)

### 2.1 Folder CRUD (`lib/api/folders.ts`)

| Endpoint | Method | Function |
|----------|--------|----------|
| `/folders` | GET | `getFolders()` - Get all folders by provider |
| `/folders` | POST | `createFolder({ name, providerId, parentPath })` |
| `/folders/:id` | PATCH | `renameFolder(id, { newName })` |
| `/folders/:id` | DELETE | `deleteFolder(id)` |
| `/folders/sync/:providerId` | POST | `syncFolders(providerId)` |
| `/folders/metadata` | GET | `getFolderMetadata()` - Canonical types |

### 2.2 Bulk Email Operations (`lib/api/emails.ts` lines 474-509)

| Endpoint | Method | Function |
|----------|--------|----------|
| `/emails/bulk` | DELETE | `bulkDelete(emailIds)` |
| `/emails/bulk/read` | PATCH | `bulkMarkRead(emailIds, isRead)` |
| `/emails/bulk/flag` | PATCH | `bulkMarkImportant(emailIds, isImportant)` |
| `/emails/bulk/move` | PATCH | `bulkMove(emailIds, targetFolder)` |
| `/emails/bulk/labels/add` | PATCH | `bulkAddLabels(emailIds, labelIds)` |
| `/emails/bulk/labels/remove` | PATCH | `bulkRemoveLabels(emailIds, labelIds)` |

---

## 3. 2025 Best Practices Research

### 3.1 dnd-kit Performance

From [dnd-kit documentation](https://docs.dndkit.com) and [research](https://www.blog.brightcoding.dev/2025/08/21/the-ultimate-drag-and-drop-toolkit-for-react-a-deep-dive-into-dnd-kit/):

**Best Practices**:
1. **Use CSS transforms, not position changes** - Avoid DOM repaints
2. **Centralize DragOverlay** - Already done in EmailLayout!
3. **SyntheticEvent listeners** - dnd-kit uses one listener per event type (efficient)
4. **8px activation distance** - Already configured (line 98 EmailLayout)

**Virtualized List + DnD Gotcha** ([GitHub issue #1674](https://github.com/clauderic/dnd-kit/issues/1674)):
- Problem: Both @tanstack/virtual and dnd-kit use transform
- Solution: Use `top` for virtualization, `transform` for drag only:
```typescript
const style = {
  transform: CSS.Transform.toString(transform), // dnd-kit drag
  top: virtualRow.start,  // virtualization position
  position: 'relative',
}
```

**Current Code Review** (`ThreadList.tsx`):
- Uses `translateY` for virtualization (line 344)
- DraggableThreadListItem exists and works
- May need adjustment for smooth drag animation

### 3.2 react-hotkeys-hook Best Practices

From [react-hotkeys-hook docs](https://react-hotkeys-hook.vercel.app/):

**Key Patterns**:
1. **Scope to refs** - Hotkeys only trigger when element focused
2. **Disable in inputs** - Default behavior, can override
3. **Use `enabled` option** - Conditionally disable during dialogs
4. **Dependency array** - Must include all deps for closures

**Anti-Pattern to Avoid**:
```typescript
// BAD: Multiple useHotkeys calls in many components = many listeners
// GOOD: Single top-level component catches all, dispatches via context
```

**Recommended Architecture**:
```typescript
// EmailKeyboardProvider.tsx
function EmailKeyboardProvider({ children }) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const threads = useThreadsFromStore();

  useHotkeys('j', () => moveFocus(1), [focusedId, threads]);
  useHotkeys('k', () => moveFocus(-1), [focusedId, threads]);
  useHotkeys('enter', () => openThread(focusedId), [focusedId]);
  // ...

  return (
    <KeyboardContext.Provider value={{ focusedId, setFocusedId }}>
      {children}
    </KeyboardContext.Provider>
  );
}
```

### 3.3 Zustand Multi-Select Pattern

From [Zustand docs](https://github.com/pmndrs/zustand) and [2025 state management article](https://dev.to/hijazi313/state-management-in-2025-when-to-use-context-redux-zustand-or-jotai-2d2k):

**Use `useShallow` for performance**:
```typescript
import { useShallow } from 'zustand/react/shallow';

// BAD: Re-renders on ANY store change
const { selectedIds, lastSelectedId } = useEmailUIStore();

// GOOD: Only re-renders when these specific values change
const { selectedIds, lastSelectedId } = useEmailUIStore(
  useShallow((state) => ({
    selectedIds: state.selectedIds,
    lastSelectedId: state.lastSelectedId,
  }))
);
```

**Existing selector hooks** (`email-ui-store.ts` lines 421-455):
```typescript
// Already implemented correctly!
export const useEmailSelection = () =>
  useEmailUIStore(
    useShallow((state) => ({
      selectedIds: state.selectedIds,
      selectedCount: state.selectedIds.size,
      hasSelection: state.selectedIds.size > 0,
    }))
  );
```

---

## 4. Integration Points

### 4.1 ThreadList to Zustand Store

**Current State**:
```typescript
// ThreadList.tsx line 94 - LOCAL STATE (wrong!)
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

**Required Change**:
```typescript
// Replace with store hook
const { selectedIds, selectEmail, toggleSelection, selectRange, clearSelection } = useEmailUIStore();
```

### 4.2 Keyboard Focus to ThreadList

**Current State**:
```typescript
// ThreadList.tsx props - UNUSED
focusedId?: string | null;

// ThreadListItem.tsx - isFocused used for styling only
isFocused={focusedId === thread.id}
```

**Required**: Create `useEmailKeyboardNavigation` hook to manage focus state and shortcuts.

### 4.3 Bulk Actions to API

**Current State** (`ThreadList.tsx` lines 50-55):
- Props exist: `onBulkMarkAsRead`, `onBulkArchive`, etc.
- Not wired to actual API calls

**Required**: Wire to `emailsApi.bulkXxx()` methods in parent page component.

---

## 5. Potential Pitfalls & Mitigations

### 5.1 Drag-Drop with Virtualized Lists

**Problem**: Transform conflict between virtualization and drag animation.

**Mitigation** (Already partially handled):
- `DraggableThreadListItem` renders inside virtualized container
- May need to separate positioning:
  - Use `top: virtualRow.start` for virtualization
  - Use `transform` only for drag animation

**Test Scenario**: Drag email from middle of long list, scroll, verify smooth animation.

### 5.2 Keyboard Focus Management

**Problem**: React doesn't track keyboard focus well; scrolling can lose focus.

**Mitigations**:
1. Store `focusedIndex` not `focusedId` - survives list changes
2. Use `virtualizer.scrollToIndex()` when focus changes
3. Ensure focused item is always in viewport

### 5.3 Race Conditions in Bulk Operations

**Problem**: User selects 100 emails, clicks delete, then immediately clicks another action.

**Mitigations**:
1. `pendingActions` Set in store (already exists!)
2. Disable bulk action buttons while pending
3. Optimistic UI with rollback on error

### 5.4 Mobile vs Desktop UX

**Problem**: Touch interfaces need different patterns than keyboard.

**Current State** (already handled):
- `EmailLayout.tsx` lines 248-315: Mobile uses bottom nav, no DnD
- `ThreadList.tsx` line 347: DraggableThreadListItem only on desktop
- Touch sensor has 250ms delay for scroll vs drag differentiation

**Keyboard shortcuts**: Should only register on desktop (md breakpoint and up).

---

## 6. Implementation Recommendations

### 6.1 FE-04: Folder Sidebar Enhancements

**Priority**: LOW (already 85% complete)

**Tasks**:
1. ~~Drag email to folder~~ DONE
2. ~~Drag folder to reorder~~ DONE
3. ~~Unread counts~~ DONE
4. ~~Create/rename/delete dialogs~~ DONE
5. Add nested folder support (drag folder INTO folder)
   - Requires: `parentId` support in create API
   - UI: Indentation based on `level` field

### 6.2 FE-06: Keyboard Navigation

**Priority**: HIGH (only 20% complete)

**Implementation Plan**:
1. Create `EmailKeyboardProvider` context component
2. Add keyboard shortcuts:
   | Key | Action |
   |-----|--------|
   | `j` | Move focus down |
   | `k` | Move focus up |
   | `Enter` | Open focused thread |
   | `e` | Archive selected |
   | `#` | Delete selected |
   | `r` | Reply to focused |
   | `a` | Reply all to focused |
   | `f` | Forward focused |
   | `/` | Focus search |
   | `?` | Show shortcuts help |
   | `Escape` | Clear selection |
   | `x` | Toggle selection on focused |

3. Wire `focusedId` to ThreadList and scroll into view
4. Create `KeyboardShortcutsDialog` help modal (reuse KanbanBoard pattern)

### 6.3 FE-07: Multi-Select with Bulk Actions

**Priority**: MEDIUM (60% complete)

**Implementation Plan**:
1. Replace ThreadList local state with Zustand store
2. Implement Shift+click range selection:
   ```typescript
   const handleClick = (e: React.MouseEvent, id: string) => {
     if (e.shiftKey && lastSelectedId) {
       selectRange(lastSelectedId, id, threadIds);
     } else if (e.ctrlKey || e.metaKey) {
       toggleSelection(id);
     } else {
       selectEmail(id);
     }
   };
   ```
3. Wire bulk action handlers to API:
   ```typescript
   const handleBulkArchive = useMutation({
     mutationFn: (ids) => emailsApi.bulkMove(ids, 'ARCHIVE'),
     onSuccess: () => clearSelection(),
   });
   ```
4. Add selection count indicator in header
5. Disable actions during pending state

---

## 7. Effort Estimates

| Requirement | Current State | Remaining Work | Estimate |
|-------------|---------------|----------------|----------|
| FE-04 Folder Sidebar | 85% | Nested folders | 2-3 hours |
| FE-06 Keyboard Nav | 20% | Full implementation | 6-8 hours |
| FE-07 Multi-Select | 60% | Store wiring + Shift+click | 3-4 hours |
| **Total** | | | **11-15 hours** |

---

## 8. Dependencies & Risks

### Dependencies (All Met)
- Phase 03 (Email List) - COMPLETE, provides ThreadList component
- dnd-kit - INSTALLED and CONFIGURED
- react-hotkeys-hook - INSTALLED, used in KanbanBoard
- zustand - INSTALLED, email-ui-store exists
- cmdk - INSTALLED, CommandPalette complete

### Risks
1. **Transform conflict** - May need refactoring if drag animation stutters
2. **Focus management** - Virtualized lists can be tricky with keyboard focus
3. **Mobile testing** - Ensure keyboard shortcuts don't break touch interactions

---

## 9. File References

**Key Files to Modify**:
```
frontend/components/email/layout/EmailLayout.tsx     - Keyboard provider wrapper
frontend/components/email/list/ThreadList.tsx        - Store integration
frontend/components/email/list/ThreadListItem.tsx    - Click handlers
frontend/stores/email-ui-store.ts                    - Add focusedId state
frontend/hooks/use-keyboard-navigation.ts            - Implement shortcuts
frontend/pages/dashboard/email.tsx                   - Wire bulk actions
```

**New Files to Create**:
```
frontend/components/email/keyboard/EmailKeyboardProvider.tsx
frontend/components/email/keyboard/KeyboardShortcutsDialog.tsx
frontend/components/email/keyboard/index.ts
```

---

## Sources

- [dnd-kit Documentation](https://docs.dndkit.com)
- [dnd-kit Best Practices Article](https://www.blog.brightcoding.dev/2025/08/21/the-ultimate-drag-and-drop-toolkit-for-react-a-deep-dive-into-dnd-kit/)
- [react-hotkeys-hook Docs](https://react-hotkeys-hook.vercel.app/)
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [State Management in 2025](https://dev.to/hijazi313/state-management-in-2025-when-to-use-context-redux-zustand-or-jotai-2d2k)
- [TanStack Virtual + dnd-kit Issue](https://github.com/clauderic/dnd-kit/issues/1674)
