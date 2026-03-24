# Sprint 03 — Checkpoint

## Stato
- **Sprint:** 03 — Pipeline & Stage Foundation
- **Last Task Completed:** T-0308 — Pipeline settings page with drag-sort stages
- **Next Task:** Sprint 03 COMPLETE — proceed to Sprint 04
- **Tasks Done:** 10/10
- **SP Completed:** 18/18
- **Last Updated:** 2026-03-24 (session 1)

## Last Modified Files
- backend/src/modules/crm/pipeline/pipeline.module.ts
- backend/src/modules/crm/pipeline/controllers/pipeline.controller.ts
- backend/src/modules/crm/pipeline/services/pipeline.service.ts
- backend/src/modules/crm/pipeline/dto/pipeline.dto.ts
- backend/src/modules/crm/crm.module.ts
- frontend/lib/api/crm-pipelines.ts
- frontend/hooks/queries/crm-pipelines-keys.ts
- frontend/hooks/queries/use-crm-pipelines.ts
- frontend/components/dashboard/crm-pipelines/PipelinesList.tsx
- frontend/components/dashboard/crm-pipelines/PipelineSettings.tsx
- frontend/components/dashboard/crm-pipelines/SortableStageList.tsx
- frontend/pages/dashboard/crm/pipelines.tsx
- frontend/pages/dashboard/crm/pipelines/[id]/settings.tsx
- frontend/components/layout/Sidebar.tsx
- frontend/locales/en.ts
- frontend/locales/it.ts
- frontend/locales/index.ts

## Key Decisions Made
- Used @dnd-kit/sortable v10 for stage drag-and-drop (already in package.json)
- Separate StageController at /crm/stages for update/delete (no pipeline param needed)
- Atomic reorder uses negative-position trick to avoid unique constraint violations during swap
- Serializable isolation level on reorder transaction to prevent race conditions
- PipelineNameEditor and PipelineDescEditor are local to PipelineSettings (not shared with AccountDetail's InlineEditField which has different API)
- Color picker uses native HTML `<input type="color">` — simple, no extra deps
- Default pipeline seed: Lead (10%), Qualified (25%), Proposal (50%), Negotiation (75%), Won (100%), Lost (0%)

## Patterns Established
- CRM pipeline query hooks: `frontend/hooks/queries/use-crm-pipelines.ts`
- CRM pipeline API module: `frontend/lib/api/crm-pipelines.ts`
- Pipeline list page: card grid layout with create dialog
- Pipeline settings page: breadcrumb + inline edit + toggles + sortable stage list
- Backend: PipelineModule follows same pattern as AccountModule (PrismaModule import, TenantGuard + RolesGuard)
- Stage CRUD auto-assigns position on create, re-numbers on delete

## Blockers / Notes
- Deals tab and Activity tab on accounts are still placeholders ("coming in Sprint 04")
- Default pipeline creation is a service method `createDefaultPipeline(tenantId)` — not yet hooked to tenant setup flow (can be called from seed or on first pipeline list load)

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: ✅ zero
