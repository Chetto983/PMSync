# Sprint 04 — Checkpoint

## Stato
- **Sprint:** 04 — Deal CRUD & Associations
- **Last Task Completed:** T-0411 — CRM sidebar navigation
- **Next Task:** Sprint 05 — (next sprint)
- **Tasks Done:** 11/11
- **SP Completed:** 18/18
- **Last Updated:** 2026-03-25

## Last Modified Files
- backend/src/modules/crm/deal/deal.module.ts
- backend/src/modules/crm/deal/controllers/deal.controller.ts
- backend/src/modules/crm/deal/services/deal.service.ts
- backend/src/modules/crm/deal/dto/deal.dto.ts
- backend/src/modules/crm/crm.module.ts
- frontend/lib/api/crm-deals.ts
- frontend/hooks/queries/crm-deals-keys.ts
- frontend/hooks/queries/use-crm-deals.ts
- frontend/hooks/queries/index.ts
- frontend/components/dashboard/crm-deals/CreateDealDialog.tsx
- frontend/components/dashboard/crm-deals/DealsList.tsx
- frontend/components/dashboard/crm-deals/DealDetail.tsx
- frontend/pages/dashboard/crm/deals/index.tsx
- frontend/pages/dashboard/crm/deals/[id].tsx
- frontend/components/layout/Sidebar.tsx
- frontend/locales/en.ts
- frontend/locales/it.ts
- frontend/locales/index.ts

## Key Decisions Made
- DealModule follows same pattern as PipelineModule (PrismaModule import, TenantGuard + RolesGuard)
- Stage-pipeline cross-validation: backend rejects stageId not belonging to pipelineId
- Account validation: accountId must belong to same tenant, nullable (can clear)
- Pipeline change requires stageId (auto-selects first stage in frontend)
- Deal-Contact associations with role field, same pattern as AccountContact
- Amount stored as Decimal(15,2), comes as string from Prisma — frontend parses with parseFloat
- DealsList uses MUI Table (not DataGrid) to match AccountsList pattern
- ConfirmDialog for delete (not window.confirm), useGlobalToast for feedback
- CreateDealDialog: pipeline→stage cascade with useEffect reset
- DealDetail: inline-edit name, stage chip in header, amount display
- Contacts/Products/Activity tabs are placeholders for future sprints

## Patterns Established
- CRM deal query hooks: `frontend/hooks/queries/use-crm-deals.ts`
- CRM deal API module: `frontend/lib/api/crm-deals.ts`
- Deal list page: table with search + pipeline filter + pagination
- Deal detail page: breadcrumb + inline edit + stage badge + info card with selects
- Deal-Contact link/unlink via `POST/DELETE /crm/deals/:id/contacts`
- DealService.validateStageInPipeline() for cross-entity validation
- DealService.validateAccount() for tenant-scoped account verification

## Blockers / Notes
- Contacts tab on deal detail is placeholder ("Coming in Sprint 05")
- Products tab placeholder ("Coming in Sprint 06")
- Activity tab placeholder ("Coming in Sprint 07")
- Deal create dialog uses basic Select for accounts (not Autocomplete) — sufficient for current scale

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: ✅ zero
