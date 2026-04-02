# Phase 139: Smart Views & Task Customization - Research

**Researched:** 2026-04-01
**Domain:** Frontend saved-filter UX + Backend CRUD for task smart views
**Confidence:** HIGH

## Summary

This phase adds the ability to save filter combinations as named "smart views" on the Tasks page and pin them to the sidebar for one-click access. The codebase already has a nearly identical feature in the CRM deals module (`CrmSavedView` model, `SavedViewsPanel.tsx`, full backend CRUD via `PipelineService`). The implementation should follow this proven pattern exactly, adapted for the tasks domain.

The key architectural decisions are: (1) create a new `TaskSmartView` Prisma model (not reuse `CrmSavedView`, which is pipeline-scoped), (2) add backend CRUD endpoints under `/tasks/views`, (3) add a `SavedViewsBar` component on the Tasks page, and (4) render pinned views as sub-items under the Tasks icon in the sidebar. The sidebar is a 64px icon rail, so pinned views will appear as a popover/tooltip list when hovering/clicking the Tasks icon, or as a small expandable section on mobile.

**Primary recommendation:** Clone the CRM `SavedViewsPanel` pattern (model, DTOs, service, controller endpoints, frontend API module, query hooks, component) and adapt it for the tasks domain. Add a `isPinned` boolean to the model for sidebar pinning.

## Project Constraints (from CLAUDE.md)

- Multi-tenant: every query MUST include `tenantId`
- Max 500 lines per file
- Translations first, then query hooks, then components
- Use TanStack Query hooks wrapping API modules (never raw `apiClient` in components)
- MUI theme `sx` props only (no hardcoded colors/CSS)
- Handle loading/error/empty states in every component
- Post-edit validation: `npx tsc --noEmit` after every file edit
- Schema changes require `prisma migrate dev --name <name>` (NEVER `prisma db push`)
- Follow existing patterns -- the CRM saved views pattern is the template

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TASK-04 | User can save filter combinations as named smart views (e.g., "My Follow-ups", "Open Tickets") | CRM SavedView pattern provides complete template: Prisma model, backend CRUD, frontend dialog + chips |
| TASK-05 | User can pin smart views to the Tasks sidebar for quick access | Add `isPinned` + `pinOrder` fields to model; sidebar renders pinned views under Tasks icon |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Purpose | Why Standard |
|---------|---------|--------------|
| Prisma + PostgreSQL | TaskSmartView model storage | Existing ORM, multi-tenant pattern |
| NestJS 11 | Backend CRUD controller/service | Existing framework |
| TanStack Query | Frontend query/mutation hooks | Existing state management |
| MUI | SavedViewsBar, SaveDialog, PinnedViews UI | Existing component library |

### Supporting (already in project)
| Library | Purpose | When to Use |
|---------|---------|-------------|
| class-validator / class-transformer | DTO validation | Backend DTOs for create/update/reorder |
| lucide-react | Icons (Bookmark, Pin, Plus, X) | Sidebar pinned items, view chips |
| @dnd-kit | Potential drag-to-reorder pinned views | Only if pin ordering is needed |

No new dependencies required.

## Architecture Patterns

### Recommended Structure

```
backend/src/modules/tasks/
  dto/
    create-smart-view.dto.ts       # NEW
    update-smart-view.dto.ts       # NEW
  services/
    smart-view.service.ts          # NEW - CRUD for TaskSmartView
  controllers/
    tasks.controller.ts            # ADD smart view endpoints

frontend/
  lib/api/tasks.ts                 # ADD smart view API methods
  hooks/queries/tasks-keys.ts      # ADD views key factory
  hooks/queries/use-tasks.ts       # ADD smart view hooks
  components/dashboard/tasks/
    SavedViewsBar.tsx              # NEW - chips bar above filter row
    SavedViewDialog.tsx            # NEW - save dialog (extract for reuse)
    PinnedViewsPopover.tsx         # NEW - sidebar popover for pinned views
    TasksList.tsx                  # MODIFY - integrate SavedViewsBar
  components/layout/
    Sidebar.tsx                    # MODIFY - add pinned views to Tasks icon
```

### Pattern 1: CRM SavedView Clone (Backend)

The existing `CrmSavedView` pattern in `PipelineService` is the template:

```typescript
// backend/prisma/schema.prisma
model TaskSmartView {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  name      String
  filters   Json     // { sourceType[], status[], priority[], dueBefore, dueAfter, contactId }
  isPinned  Boolean  @default(false)
  pinOrder  Int      @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tenantId, userId, name])
  @@index([tenantId, userId])
  @@index([tenantId, userId, isPinned])
  @@map("task_smart_views")
}
```

Key differences from CRM:
- **Per-user** (not per-pipeline): scoped to `userId` + `tenantId`
- **Has `isPinned` + `pinOrder`**: CRM views don't have pinning
- **Unique constraint**: per tenant+user+name (users can't have duplicate names)

### Pattern 2: API Endpoints

Following the CRM pattern nested under the tasks controller:

```
GET    /tasks/views          -> list all smart views for current user
POST   /tasks/views          -> create a smart view
PATCH  /tasks/views/:id      -> update name, filters, isPinned, pinOrder
DELETE /tasks/views/:id      -> delete a smart view
PATCH  /tasks/views/:id/pin  -> toggle pin state
```

### Pattern 3: Sidebar Pinned Views

The sidebar is a 64px icon rail (Phase 135 decision). Adding sub-items is architecturally tricky because there are no text labels. Two viable approaches:

**Approach A (Recommended): Popover on hover/click**
- When user hovers or clicks the Tasks icon, a small popover shows pinned views as a list
- Each item navigates to `/dashboard/tasks?view=<viewId>` with pre-applied filters
- Similar to how email clients show folder sub-menus on sidebar icons

**Approach B: Badge count only**
- Show a small badge count on the Tasks icon indicating pinned views exist
- The actual pinned view chips live on the Tasks page itself (above filters)
- Simpler but less "quick access"

Approach A is recommended because TASK-05 says "pin to sidebar for quick access," implying the sidebar itself provides navigation, not just the Tasks page.

### Pattern 4: Filter Serialization for URL + Storage

Current TasksList syncs filters to URL query params. Smart views need to:
1. **Save**: Capture current filter state as JSON in the database
2. **Apply**: Set filter state from saved JSON, which auto-syncs to URL
3. **URL param**: Add `?view=<viewId>` to mark which view is active

```typescript
// When applying a smart view
const applyView = (view: TaskSmartView) => {
  const filters = view.filters as ListTasksQuery;
  setFilterSourceType(filters.sourceType?.[0] ?? '');
  setFilterStatus(filters.status?.[0] ?? '');
  // ... etc
  router.replace({ pathname: router.pathname, query: { view: view.id, ...buildParams(filters) } });
};
```

### Anti-Patterns to Avoid

- **Storing views in localStorage**: Fails multi-device, violates multi-tenant. Use backend API.
- **Reusing `CrmSavedView` model**: It's pipeline-scoped. Tasks need user-scoped views.
- **Modifying sidebar icon rail to show text**: The 64px rail is a locked decision. Use popover.
- **Over-engineering the filter JSON**: Store the same shape as `ListTasksQuery`. Don't invent a filter DSL.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Saved view CRUD | Custom storage layer | Prisma model + NestJS service (copy CRM pattern) | Proven pattern in codebase |
| Filter persistence | localStorage scheme | Backend API + TanStack Query cache | Multi-device, multi-tenant |
| Sidebar sub-menu | Custom sidebar expansion | MUI Popover + existing Tooltip pattern | Consistent with icon rail UX |
| Dialog for saving views | Custom modal | MUI Dialog (copy CRM SavedViewsPanel dialog) | Existing pattern |

## Common Pitfalls

### Pitfall 1: Filter Shape Mismatch
**What goes wrong:** Saved view JSON shape diverges from `ListTasksQuery` type, causing runtime errors when applying views.
**Why it happens:** Filters evolve (new fields added) but saved views contain old shapes.
**How to avoid:** (1) Type the `filters` field as `Partial<ListTasksQuery>` on the frontend. (2) Apply with defaults for missing fields. (3) Never assume all keys exist in stored JSON.
**Warning signs:** TypeScript errors when spreading view.filters into state setters.

### Pitfall 2: Stale Pinned Views After Filter Change
**What goes wrong:** User applies a pinned view, then manually changes a filter. The UI still shows the view as "active" even though filters no longer match.
**Why it happens:** Active view state tracked by ID, not by filter comparison.
**How to avoid:** Clear the active view ID when any filter changes manually (not via view application).
**Warning signs:** Visual mismatch between highlighted view chip and actual filter state.

### Pitfall 3: Sidebar Popover Z-Index Conflicts
**What goes wrong:** Popover renders behind other UI elements or gets clipped by sidebar overflow.
**Why it happens:** Sidebar drawer has `overflowX: hidden` and complex z-index stacking.
**How to avoid:** Use MUI `Popover` with `anchorEl` on the Tasks icon. MUI Popover uses Portal, which renders at document root.
**Warning signs:** Popover appears but is clipped or invisible.

### Pitfall 4: Migration on Production
**What goes wrong:** Schema change fails or causes downtime.
**Why it happens:** Using `prisma db push` instead of migrations.
**How to avoid:** Use `npx prisma migrate dev --name add-task-smart-views`. Review generated SQL. New table with no DROP statements = safe.
**Warning signs:** CLAUDE.md explicitly forbids `prisma db push`.

## Code Examples

### Backend Service (following CRM pattern)
```typescript
// backend/src/modules/tasks/services/smart-view.service.ts
@Injectable()
export class SmartViewService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string) {
    return this.prisma.taskSmartView.findMany({
      where: { tenantId, userId },
      orderBy: [{ isPinned: 'desc' }, { pinOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(tenantId: string, userId: string, dto: CreateSmartViewDto) {
    return this.prisma.taskSmartView.create({
      data: { tenantId, userId, name: dto.name, filters: dto.filters as any },
    });
  }

  async togglePin(tenantId: string, userId: string, viewId: string) {
    const view = await this.prisma.taskSmartView.findFirst({
      where: { id: viewId, tenantId, userId },
    });
    if (!view) throw new NotFoundException(`View ${viewId} not found`);
    return this.prisma.taskSmartView.update({
      where: { id: viewId },
      data: { isPinned: !view.isPinned },
    });
  }
}
```

### Frontend API Extension
```typescript
// Addition to frontend/lib/api/tasks.ts
export interface TaskSmartView {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  filters: Partial<ListTasksQuery>;
  isPinned: boolean;
  pinOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Add to tasksApi object:
listViews() {
  return apiClient.get<TaskSmartView[]>('/tasks/views');
},
createView(dto: { name: string; filters: Record<string, unknown> }) {
  return apiClient.post<TaskSmartView>('/tasks/views', dto);
},
updateView(id: string, dto: Partial<{ name: string; filters: Record<string, unknown>; isPinned: boolean; pinOrder: number }>) {
  return apiClient.patch<TaskSmartView>(`/tasks/views/${id}`, dto);
},
deleteView(id: string) {
  return apiClient.delete<{ deleted: boolean }>(`/tasks/views/${id}`);
},
togglePin(id: string) {
  return apiClient.patch<TaskSmartView>(`/tasks/views/${id}/pin`, {});
},
```

### Sidebar Pinned Views Popover
```typescript
// frontend/components/dashboard/tasks/PinnedViewsPopover.tsx
// Renders as Popover anchored to Tasks sidebar icon
// Lists pinned views with click-to-navigate
// Each item: router.push(`/dashboard/tasks?view=${view.id}`)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage for saved filters | Backend API + Prisma | CRM Sprint 08 (2026-03-25) | Multi-device persistence |
| No sidebar sub-items | Popover on icon hover | Phase 139 (new) | Quick access without breaking icon rail |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual + TypeScript type-check |
| Config file | tsconfig.json (both frontend/backend) |
| Quick run command | `cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit` |
| Full suite command | Same as quick run |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TASK-04 | Save filter combo as named smart view | manual + type-check | `cd backend && npx tsc --noEmit` | N/A |
| TASK-05 | Pin smart views to sidebar | manual + type-check | `cd frontend && npx tsc --noEmit` | N/A |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` in affected project (frontend or backend)
- **Per wave merge:** Both frontend + backend type-check
- **Phase gate:** Full type-check green, manual E2E in browser

### Wave 0 Gaps
None -- existing type-check infrastructure covers all phase requirements.

## Open Questions

1. **Popover trigger: hover vs click?**
   - What we know: Hover is faster for discovery; click is more intentional and mobile-friendly
   - What's unclear: The sidebar is icon-only with tooltips on hover. Adding a popover on hover may conflict with the existing tooltip
   - Recommendation: Use **click** to open popover (replaces tooltip when views exist). Falls back to tooltip when no pinned views. This avoids hover-state conflicts.

2. **Maximum pinned views?**
   - What we know: CRM has no limit on saved views. But sidebar space is limited.
   - What's unclear: Should there be a cap?
   - Recommendation: Cap at 5 pinned views in the popover. No limit on total saved views.

## Sources

### Primary (HIGH confidence)
- `backend/prisma/schema.prisma` -- CrmSavedView model (lines 1893-1908)
- `backend/src/modules/crm/pipeline/services/pipeline.service.ts` -- SavedView CRUD methods (lines 427-498)
- `frontend/components/dashboard/crm-deals/SavedViewsPanel.tsx` -- Complete frontend pattern (200 lines)
- `frontend/lib/api/crm-pipelines.ts` -- SavedView API types and methods (lines 104-190)
- `frontend/hooks/queries/use-crm-pipelines.ts` -- SavedView query hooks (lines 166-207)
- `frontend/components/layout/Sidebar.tsx` -- 64px icon rail with DnD (700 lines)
- `frontend/components/layout/sidebar-navigation.ts` -- PILLAR_ITEMS config
- `frontend/components/dashboard/tasks/TasksList.tsx` -- Current filter state + URL sync (453 lines)
- `backend/src/modules/tasks/controllers/tasks.controller.ts` -- Existing tasks controller
- `backend/src/modules/tasks/tasks.module.ts` -- Module wiring

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new deps
- Architecture: HIGH -- proven CRM SavedView pattern exists in codebase, direct clone
- Pitfalls: HIGH -- based on actual codebase structure and known constraints (icon rail, multi-tenant)

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable -- no external deps, all patterns internal)
