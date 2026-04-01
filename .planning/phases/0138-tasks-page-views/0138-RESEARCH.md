# Phase 138: Tasks Page & Views - Research

**Researched:** 2026-04-01
**Domain:** Frontend — React page with list/kanban views, TanStack Query, @dnd-kit, MUI
**Confidence:** HIGH

## Summary

Phase 138 replaces the current Tasks page (which only shows follow-up data from `usePendingFollowUps`) with a fully unified task page backed by the Phase 137 `/tasks` API. The backend is complete and exposes five endpoints under `/api/v1/tasks`. The frontend needs: a new API module, query hooks, translations, a rewritten Tasks component with list+kanban toggle, filter controls, a create-task dialog, and a command palette update.

The codebase has a nearly identical pattern in `DealsList.tsx` — same list/kanban toggle, same `@dnd-kit` drag-and-drop, same MUI table + filter bar. This is the reference implementation. The existing `KanbanBoard.tsx` (CRM deals) demonstrates exactly how to build droppable columns with `@dnd-kit/core` + `useDraggable`/`useDroppable`.

**Primary recommendation:** Clone the DealsList.tsx + KanbanBoard.tsx pattern almost verbatim, substituting task types for deal types. No new libraries needed — everything is already installed.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TASK-02 | User can create a manual task from Cmd+K or quick-add button | Command palette already has `create-task` command (routes to `/dashboard/reminders?action=create`). Needs redirect update to `/dashboard/tasks?action=create`. Backend `POST /tasks` is ready. |
| TASK-03 | User can filter tasks by type, contact, due date, and status | Backend `GET /tasks` supports `sourceType[]`, `status[]`, `priority[]`, `dueBefore`, `dueAfter`, `contactId`. Frontend needs filter bar UI. |
| TASK-06 | User can toggle between list view and kanban board view | DealsList.tsx implements this exact pattern with `ToggleButtonGroup` and `ViewMode` state. Copy it. |
| TASK-07 | User can drag tasks between kanban columns to change status | KanbanBoard.tsx implements this with `@dnd-kit/core` DndContext + `useDroppable` columns + `useDraggable` cards. For tasks, columns = statuses (pending, in_progress, completed). Backend: `PATCH /tasks/:sourceType/:id` with `{ status }` for manual tasks; `POST /tasks/:sourceType/:id/complete` for any task type. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Frontend: Next.js 16 + React 19, TanStack Query + Zustand, MUI (no Tailwind utilities)
- Max 500 lines per file
- Never hardcode strings — use `t.section.key` translations
- Use MUI theme `sx` props only, no hardcoded colors/CSS
- Query hooks must use `queryOptions()` pattern, export from `index.ts`
- API calls via API modules in `frontend/lib/api/`, never raw `apiClient.get()` in components
- Must handle loading/error/empty states (Skeleton, Alert, EmptyState)
- Post-edit validation: `cd frontend && npx tsc --noEmit`
- TanStack Query: `staleTime: 5min`, `gcTime: 30min`, `retry: 1`
- Tasks semantic color: green
- SCOPE CONTROL: do exactly what is asked, no unrequested features

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | 6.3.1 | DnD primitives (DndContext, useDraggable, useDroppable) | Already used in KanbanBoard.tsx and Sidebar.tsx |
| `@dnd-kit/sortable` | 10.0.0 | Sortable lists (used by Sidebar) | Already installed, available if needed |
| `@dnd-kit/utilities` | 3.2.2 | CSS transform helpers | Already used in DealCard.tsx |
| `@tanstack/react-query` | (installed) | Data fetching + cache | Project standard |
| `@mui/material` | (installed) | UI components | Project standard |
| `lucide-react` | (installed) | Icons | Project standard |

### Not Needed
| Library | Reason |
|---------|--------|
| `@mui/x-data-grid` | NOT installed. Project uses plain MUI `Table` for list views. |
| `react-beautiful-dnd` | NOT used. Project uses `@dnd-kit`. |
| Any new library | Everything needed is already installed. |

## Architecture Patterns

### Files to Create

```
frontend/
  lib/api/tasks.ts                          # API module (~80 lines)
  hooks/queries/tasks-keys.ts               # Query key factory (~15 lines)
  hooks/queries/use-tasks.ts                # Query hooks (~100 lines)
  components/dashboard/tasks/               # New directory
    TasksList.tsx                            # Main component: header + filters + list/kanban toggle (~350 lines)
    TasksKanbanBoard.tsx                     # Kanban view with status columns (~250 lines)
    TaskCard.tsx                             # Draggable task card (~100 lines)
    CreateTaskDialog.tsx                     # Dialog for manual task creation (~200 lines)
    index.ts                                 # Barrel export
```

### Files to Modify

```
frontend/
  components/dashboard/Tasks.tsx            # REPLACE content: import from tasks/ directory
  components/ai/CommandPalette/commands.ts  # Update create-task route from /dashboard/reminders to /dashboard/tasks
  locales/en.ts                             # Add tasks section translations
  locales/it.ts                             # Add tasks section translations (Italian)
  hooks/queries/index.ts                    # Export new task hooks
  lib/api/index.ts                          # Export tasks API module
```

### Pattern 1: API Module (from crm-deals.ts)
**What:** Typed wrapper around `apiClient` with all endpoint methods
**Example:**
```typescript
// frontend/lib/api/tasks.ts
import { apiClient } from '../api-client';

export type TaskSourceType = 'follow_up' | 'reminder' | 'deal_action' | 'ticket' | 'manual';
export type UnifiedTaskStatus = 'pending' | 'in_progress' | 'completed' | 'dismissed' | 'expired';
export type UnifiedTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface UnifiedTask {
  id: string;
  sourceType: TaskSourceType;
  sourceId: string;
  title: string;
  description: string | null;
  status: UnifiedTaskStatus;
  priority: UnifiedTaskPriority;
  dueDate: string | null;
  contactName: string | null;
  contactId: string | null;
  dealId: string | null;
  emailId: string | null;
  ticketId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface TaskCounts {
  follow_up: number;
  reminder: number;
  deal_action: number;
  ticket: number;
  manual: number;
}

export interface TaskListResponse {
  data: UnifiedTask[];
  meta: { total: number; page: number; limit: number; counts: TaskCounts };
}

export interface ListTasksQuery {
  sourceType?: TaskSourceType[];
  status?: UnifiedTaskStatus[];
  priority?: UnifiedTaskPriority[];
  dueBefore?: string;
  dueAfter?: string;
  contactId?: string;
  page?: number;
  limit?: number;
  sortBy?: 'dueDate' | 'createdAt' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  priority?: UnifiedTaskPriority;
  dueDate?: string;
  contactId?: string;
  dealId?: string;
  emailId?: string;
}

export interface UpdateTaskDto extends Partial<CreateTaskDto> {
  status?: UnifiedTaskStatus;
}

export const tasksApi = {
  list: (query?: ListTasksQuery) =>
    apiClient.get<TaskListResponse>('/tasks', { params: query }),
  create: (dto: CreateTaskDto) =>
    apiClient.post<{ data: UnifiedTask }>('/tasks', dto),
  update: (id: string, dto: UpdateTaskDto) =>
    apiClient.patch<{ data: UnifiedTask }>(`/tasks/manual/${id}`, dto),
  delete: (id: string) =>
    apiClient.delete<{ success: boolean }>(`/tasks/manual/${id}`),
  complete: (sourceType: TaskSourceType, id: string) =>
    apiClient.post<{ success: boolean }>(`/tasks/${sourceType}/${id}/complete`),
};
```

### Pattern 2: Query Key Factory (from crm-deals-keys.ts)
```typescript
// frontend/hooks/queries/tasks-keys.ts
export const tasksKeys = {
  all: ['tasks'] as const,
  list: (filters?: Record<string, unknown>) =>
    [...tasksKeys.all, 'list', filters ?? {}] as const,
} as const;
```

### Pattern 3: Query Hooks (from use-crm-deals.ts)
```typescript
// Use queryOptions() pattern with staleTime: 5min, gcTime: 30min, retry: 1
// Mutations invalidate tasksKeys.all on success
```

### Pattern 4: List/Kanban Toggle (from DealsList.tsx)
```typescript
type ViewMode = 'list' | 'kanban';
const [viewMode, setViewMode] = useState<ViewMode>('list');

// ToggleButtonGroup with List and Kanban icons
// viewMode === 'kanban' renders <TasksKanbanBoard />
// viewMode === 'list' renders <Table> with task rows
```

### Pattern 5: Kanban DnD (from KanbanBoard.tsx)
- Columns = task statuses (pending, in_progress, completed)
- Each column uses `useDroppable({ id: statusValue })`
- Each card uses `useDraggable({ id: task.id, data: { task } })`
- `DragOverlay` shows card preview during drag
- Optimistic update on `onDragEnd`: update cache, mutate, rollback on error
- **Critical difference from deals:** Deals kanban moves between pipeline stages. Tasks kanban moves between status values. For non-manual tasks, only "complete" is allowed (via `POST /tasks/:sourceType/:id/complete`). Only manual tasks support arbitrary status changes via `PATCH`.

### Pattern 6: URL State Sync (from DealsList.tsx)
- Filter state synced to URL query params via `router.replace({ shallow: true })`
- View mode persisted in URL (`?view=kanban`)
- `?action=create` triggers dialog open on mount

### Pattern 7: Create Dialog Trigger from Cmd+K (from commands.ts)
```typescript
// Current: routes to /dashboard/reminders?action=create
// Change to: /dashboard/tasks?action=create
{
  id: 'create-task',
  action: () => { void router.push('/dashboard/tasks?action=create'); },
}
```

### Anti-Patterns to Avoid
- **Mixing task status change logic:** Non-manual tasks can only be "completed" (one-way). Don't allow dragging a follow-up to "pending" or "in_progress" — it makes no sense for those source types.
- **Building a new DnD pattern:** The `@dnd-kit` pattern is proven in the codebase. Don't invent a new approach.
- **Using `useSortable` for kanban columns:** The existing KanbanBoard uses `useDroppable` for columns and `useDraggable` for cards. This is simpler and correct for non-reorderable items within columns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-and-drop | Custom mouse event handlers | `@dnd-kit/core` DndContext + useDraggable/useDroppable | Already proven in KanbanBoard.tsx |
| Filter state management | Custom state sync | URL query params via `router.replace` | Matches DealsList.tsx pattern, survives refresh |
| Date formatting | Custom formatters | `formatDateInTz()` from `@/lib/utils/format-date-tz` | Already used across the app |
| Empty state | Custom layout | `EmptyState` from `@/components/common` | Standardized component |
| Error display | Custom error UI | `QueryErrorAlert` from `@/components/common` | Standardized component |
| Confirmation dialog | Custom dialog | `ConfirmDialog` from `@/components/ui` | Used in DealsList.tsx |

## Common Pitfalls

### Pitfall 1: Non-Manual Task Status Changes
**What goes wrong:** Attempting to PATCH status on follow-up/reminder/deal_action/ticket tasks returns 400.
**Why it happens:** Backend `PATCH /tasks/:sourceType/:id` only works for `sourceType === 'manual'`. Other types throw `BadRequestException`.
**How to avoid:** In the kanban view, when a non-manual task is dragged to a new column: if target column is "completed", call `POST /tasks/:sourceType/:id/complete`. If target is anything else, reject the drop (snap back) and show a toast explaining only manual tasks can change status freely.
**Warning signs:** 400 errors on drag-drop operations.

### Pitfall 2: Array Query Parameters
**What goes wrong:** Backend expects `sourceType[]=follow_up&sourceType[]=manual` format for array filters.
**Why it happens:** Axios serializes arrays differently depending on config.
**How to avoid:** Use `params` with `paramsSerializer` or ensure the backend `@Transform` decorator handles both `string` and `string[]` (it does — see `ListTasksQueryDto`). Test with multiple filters selected.
**Warning signs:** Filters returning all results instead of filtered subset.

### Pitfall 3: Kanban Optimistic Update Cache Key
**What goes wrong:** Optimistic update writes to wrong cache key, no visual feedback.
**Why it happens:** Query key must exactly match the key used by the active query.
**How to avoid:** Use the same `tasksKeys.list(currentFilters)` for both `useQuery` and `queryClient.setQueryData`.

### Pitfall 4: Page vs Offset Pagination Mismatch
**What goes wrong:** Backend uses `page` (1-based), but MUI `TablePagination` uses 0-based page.
**Why it happens:** Backend `ListTasksQueryDto.page` starts at 1, MUI starts at 0.
**How to avoid:** Pass `page + 1` to the API, display `page` in the table pagination.

### Pitfall 5: Missing 500-Line File Limit
**What goes wrong:** TasksList.tsx grows past 500 lines.
**How to avoid:** Extract KanbanBoard, TaskCard, CreateTaskDialog into separate files from the start.

## Code Examples

### Kanban Status Columns Definition
```typescript
const KANBAN_STATUSES: { value: UnifiedTaskStatus; label: string; color: string }[] = [
  { value: 'pending', label: t.tasks.statuses.pending, color: theme.palette.warning.main },
  { value: 'in_progress', label: t.tasks.statuses.inProgress, color: theme.palette.info.main },
  { value: 'completed', label: t.tasks.statuses.completed, color: theme.palette.success.main },
];
// Note: 'dismissed' and 'expired' are not shown as kanban columns — they're terminal states
```

### Drag-End Handler (Task-Specific)
```typescript
const handleDragEnd = useCallback((event: DragEndEvent) => {
  const { active, over } = event;
  if (!over) return;

  const task = active.data.current?.task as UnifiedTask;
  const newStatus = over.id as UnifiedTaskStatus;
  if (!task || task.status === newStatus) return;

  // Non-manual tasks can only be completed
  if (task.sourceType !== 'manual') {
    if (newStatus === 'completed') {
      completeMutation.mutate({ sourceType: task.sourceType, id: task.sourceId });
    } else {
      toast.warning(t.tasks.kanban.onlyManualCanMove);
      return;
    }
  } else {
    updateMutation.mutate({ id: task.sourceId, dto: { status: newStatus } });
  }
}, [completeMutation, updateMutation, toast, t]);
```

### Filter Bar Pattern (from DealsList.tsx)
```typescript
<Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
  {/* Source type filter chips */}
  {/* Status filter dropdown */}
  {/* Priority filter dropdown */}
  {/* Due date range (optional) */}
</Box>
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + @testing-library/react |
| Config file | `frontend/jest.config.js` |
| Quick run command | `cd frontend && npx jest --testPathPattern tasks --passWithNoTests` |
| Full suite command | `cd frontend && npm test` |
| E2E | `frontend/e2e/tasks.spec.ts` (Playwright — exists, tests old follow-up-only page) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TASK-02 | Create task from Cmd+K / quick-add | unit | `cd frontend && npx jest --testPathPattern tasks-keys` | No — Wave 0 |
| TASK-03 | Filter tasks by type/contact/due/status | unit | `cd frontend && npx jest --testPathPattern use-tasks` | No — Wave 0 |
| TASK-06 | Toggle list/kanban view | unit | `cd frontend && npx jest --testPathPattern TasksList` | No — Wave 0 |
| TASK-07 | Drag tasks between kanban columns | unit | `cd frontend && npx jest --testPathPattern TasksKanbanBoard` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npx tsc --noEmit` (type-check is mandatory per CLAUDE.md)
- **Per wave merge:** `cd frontend && npm test`
- **Phase gate:** Full suite green + E2E update

### Wave 0 Gaps
- [ ] `frontend/hooks/queries/tasks-keys.test.ts` — query key factory tests
- [ ] Update `frontend/e2e/tasks.spec.ts` — test unified tasks instead of follow-ups only

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `frontend/components/dashboard/crm-deals/DealsList.tsx` — list+kanban toggle pattern
- Codebase inspection: `frontend/components/dashboard/crm-deals/KanbanBoard.tsx` — @dnd-kit kanban pattern
- Codebase inspection: `frontend/components/dashboard/crm-deals/DealCard.tsx` — useDraggable pattern
- Codebase inspection: `backend/src/modules/tasks/controllers/tasks.controller.ts` — confirmed all 5 endpoints
- Codebase inspection: `backend/src/modules/tasks/dto/unified-task.dto.ts` — exact response shape
- Codebase inspection: `backend/src/modules/tasks/dto/list-tasks-query.dto.ts` — exact query params
- Codebase inspection: `frontend/components/ai/CommandPalette/commands.ts` — current create-task routing

### Secondary (MEDIUM confidence)
- Codebase inspection: `frontend/locales/en.ts` — existing `tasks` section needs expansion

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything is already installed, no new deps
- Architecture: HIGH — near-identical pattern exists in CRM deals
- Pitfalls: HIGH — backend constraints confirmed from source code
- API contract: HIGH — read directly from controller + DTOs

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable codebase patterns, unlikely to change)
