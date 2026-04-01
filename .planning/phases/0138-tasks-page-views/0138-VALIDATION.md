# Phase 138: Tasks Page & Views - Validation

**Created:** 2026-04-01

## Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| TASK-02 | Create task from Cmd+K / quick-add | unit | `cd frontend && npx jest --testPathPattern CreateTaskDialog` | `frontend/components/dashboard/tasks/__tests__/CreateTaskDialog.test.tsx` |
| TASK-03 | Filter tasks by type/contact/due/status | unit | `cd frontend && npx jest --testPathPattern TasksList` | `frontend/components/dashboard/tasks/__tests__/TasksList.test.tsx` |
| TASK-06 | Toggle list/kanban view | unit | `cd frontend && npx jest --testPathPattern TasksList` | `frontend/components/dashboard/tasks/__tests__/TasksList.test.tsx` |
| TASK-07 | Drag tasks between kanban columns | unit | `cd frontend && npx jest --testPathPattern TasksKanbanBoard` | `frontend/components/dashboard/tasks/__tests__/TasksKanbanBoard.test.tsx` |

## Sampling Rate

- **Per task commit:** `cd frontend && npx tsc --noEmit` (mandatory per CLAUDE.md)
- **Per wave merge:** `cd frontend && npm test`
- **Phase gate:** Full suite green

## Acceptance Gates

1. `cd frontend && npx tsc --noEmit` exits 0
2. Tasks page renders with list view by default
3. Kanban toggle switches view
4. Filter bar filters tasks by type, status, priority, contact, due date
5. DnD respects non-manual task constraint (only complete allowed)
6. Cmd+K "Create Task" opens dialog on Tasks page
7. All strings come from translations (no hardcoded text)
