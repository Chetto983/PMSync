# Sprint 05 — Checkpoint

## Stato
- **Sprint:** 05 — Kanban Board & Drag-Drop
- **Last Task Completed:** T-0508 — Socket.IO frontend subscription
- **Next Task:** Sprint 06 — (next sprint)
- **Tasks Done:** 11/11
- **SP Completed:** 20/20
- **Last Updated:** 2026-03-25

## Last Modified Files
- backend/src/modules/crm/deal/controllers/deal.controller.ts
- backend/src/modules/crm/deal/services/deal.service.ts
- backend/src/modules/crm/deal/dto/deal.dto.ts
- backend/src/modules/crm/deal/deal.module.ts
- backend/src/modules/realtime/types/realtime.types.ts
- backend/src/modules/realtime/services/realtime-events.service.ts
- frontend/components/dashboard/crm-deals/KanbanBoard.tsx
- frontend/components/dashboard/crm-deals/DealCard.tsx
- frontend/components/dashboard/crm-deals/DealsList.tsx
- frontend/lib/api/crm-deals.ts
- frontend/hooks/queries/use-crm-deals.ts
- frontend/lib/websocket-client.ts
- frontend/locales/en.ts
- frontend/locales/it.ts
- frontend/locales/index.ts

## Key Decisions Made
- Used @dnd-kit/core v6 (already installed) instead of @hello-pangea/dnd (sprint spec mentioned it but dnd-kit was already in deps)
- KanbanBoard + DealCard placed in `frontend/components/dashboard/crm-deals/` alongside existing deal components (not separate kanban/ dir)
- List/Kanban view toggle added to DealsList header with ToggleButtonGroup
- Kanban requires pipeline selection (shows prompt if none selected)
- Stage transition uses dedicated PATCH /crm/deals/:id/stage endpoint (lighter than full update)
- Socket.IO event name: `crm:deal:stage-changed` (namespaced under crm: prefix)
- DealCard uses useDraggable (not useSortable) — cards drop into stage columns, no intra-column reordering
- Optimistic update uses queryClient.setQueryData with rollback on mutation error

## Patterns Established
- CRM realtime events: `CrmDealStageChangedPayload` type, `emitCrmDealStageChanged` method
- Frontend websocket handler: `websocketClient.onCrmDealStageChanged()`
- KanbanBoard accepts pipelineId prop, fetches deals with limit=500 for that pipeline
- StageColumn uses useDroppable, DealCard uses useDraggable
- Stage header shows: count, total value, weighted value (amount * probability/100)
- View mode toggle: ToggleButtonGroup with List/Kanban icons from lucide-react

## Blockers / Notes
- @dnd-kit/sortable v10 is installed but not used for Kanban (sortable is for reordering within a list, not cross-container moves)
- Deal cards don't support intra-column reordering (not in sprint scope)
- Kanban fetches up to 500 deals per pipeline — may need virtualization for larger datasets (Sprint risk #2)

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing (pre-existing errors in email/org components, not from CRM)
- Circular deps: not checked this session (no new modules created, only extended existing)
