# Sprint 06 — Checkpoint

## Stato
- **Sprint:** 06 — Deal Detail & Stage Automations
- **Last Task Completed:** T-0610 — UI automation config in Pipeline settings
- **Next Task:** Sprint complete — proceed to production validation
- **Tasks Done:** 10/10
- **SP Completed:** 17/17
- **Last Updated:** 2026-03-25 22:30

## Last Modified Files
- backend/src/modules/crm/automation/automation.module.ts
- backend/src/modules/crm/automation/stage-automation.service.ts
- backend/src/modules/crm/automation/stage-automation.worker.ts
- backend/src/modules/crm/automation/types.ts
- backend/src/modules/crm/crm.module.ts
- backend/src/modules/crm/deal/deal.module.ts
- backend/src/modules/crm/deal/services/deal.service.ts
- backend/src/modules/crm/deal/controllers/deal.controller.ts
- backend/src/modules/crm/deal/dto/deal.dto.ts
- backend/src/modules/crm/pipeline/dto/pipeline.dto.ts
- backend/src/modules/crm/pipeline/services/pipeline.service.ts
- backend/src/common/config/queue.config.ts
- backend/prisma/schema.prisma
- backend/src/modules/realtime/types/realtime.types.ts
- backend/src/modules/realtime/services/realtime-events.service.ts
- frontend/components/dashboard/crm-deals/DealDetail.tsx
- frontend/components/dashboard/crm-deals/DealDetailParts.tsx
- frontend/components/dashboard/crm-deals/DealTimeline.tsx
- frontend/components/dashboard/crm-deals/CreateActivityDialog.tsx
- frontend/components/dashboard/crm-deals/DealNotes.tsx
- frontend/components/dashboard/crm-pipelines/StageAutomationsDialog.tsx
- frontend/components/dashboard/crm-pipelines/SortableStageList.tsx
- frontend/lib/api/crm-deals.ts
- frontend/lib/api/crm-pipelines.ts
- frontend/hooks/queries/use-crm-deals.ts
- frontend/hooks/queries/crm-deals-keys.ts
- frontend/locales/en.ts
- frontend/locales/it.ts
- frontend/locales/index.ts

## Key Decisions Made
- DealDetail extracted into DealDetailParts.tsx when main file exceeded 500 lines
- Notes stored as CrmActivity type=NOTE for unified timeline, with full CRUD
- Note endpoints under `/crm/deals/:id/notes/:noteId` (not separate controller)
- DealDetail tabs: Info, Contacts, Notes, Products, Activity
- Stage automations stored as JSON array on CrmStage.automations field
- BullMQ worker handles NOTIFY (Socket.IO + activity) and CREATE_TASK (activity)
- Loop prevention via triggeredByAutomation flag on job data
- StageAutomationsDialog uses Zap icon button per stage in sortable list

## Patterns Established
- CRM activity endpoints: GET/POST /crm/deals/:id/activities
- CRM note endpoints: GET/POST /crm/deals/:id/notes, PATCH/DELETE /crm/deals/:id/notes/:noteId
- Automation module: backend/src/modules/crm/automation/
- Stage automation types: NOTIFY, CREATE_TASK (extensible via AutomationType union)
- Realtime events: crm:automation:notify via emitCrmAutomationNotify()
- Queue name: CRM_STAGE_AUTOMATION in centralized QUEUE_NAMES

## Blockers / Notes
- None currently

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: pending check
- Production validation: pending (push + deploy needed)
