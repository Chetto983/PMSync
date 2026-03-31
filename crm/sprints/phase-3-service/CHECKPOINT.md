# Sprint 16 — Checkpoint

## Stato
- **Sprint:** 16 — Routing, SLA & Agent Dashboard
- **Last Task Completed:** T-1610 — Type-check and lint validation
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 10/10
- **SP Completed:** 20/20
- **Last Updated:** 2026-03-31 11:45

## Last Modified Files
- backend/prisma/schema.prisma (SlaPolicy + RoutingRule models, Ticket.slaPolicyId)
- backend/prisma/seed.ts (4 default SLA policies)
- backend/src/modules/crm/ticket/ticket.module.ts (SlaTimerService, RoutingRuleService, RoutingRuleController, RealtimeModule)
- backend/src/modules/crm/ticket/services/sla-timer.service.ts (new)
- backend/src/modules/crm/ticket/services/routing-rule.service.ts (new + CRUD)
- backend/src/modules/crm/ticket/services/ticket.service.ts (SLA, routing, assign, realtime events)
- backend/src/modules/crm/ticket/services/email-to-ticket.handler.ts (senderEmail pass-through)
- backend/src/modules/crm/ticket/controllers/routing-rule.controller.ts (new)
- backend/src/modules/crm/ticket/controllers/ticket.controller.ts (assign endpoint, includeInternal query)
- backend/src/modules/crm/ticket/dto/ticket.dto.ts (AssignTicketDto, senderEmail field)
- backend/src/modules/crm/ticket/dto/routing-rule.dto.ts (new)
- backend/src/modules/realtime/types/realtime.types.ts (CrmTicketEventPayload + 3 events)
- backend/src/modules/realtime/services/realtime-events.service.ts (ticket emit methods)
- frontend/components/common/SlaBadge.tsx (new)
- frontend/components/common/index.ts (SlaBadge export)
- frontend/pages/dashboard/agent.tsx (new)
- frontend/components/layout/Sidebar.tsx (agent dashboard nav)
- frontend/lib/api/crm-tickets.ts (assign method)
- frontend/lib/websocket-client.ts (ticket event types + handlers)
- frontend/hooks/queries/use-crm-tickets.ts (useAssignTicket hook)
- frontend/hooks/use-ticket-realtime.ts (new)
- frontend/locales/en.ts (agentDashboard section)
- frontend/locales/it.ts (agentDashboard section)
- frontend/locales/index.ts (agentDashboard types)

## Key Decisions Made
- T-1601: SlaPolicy uses @@unique([tenantId, priority]) — one policy per priority per tenant
- T-1602: SLA timer uses direct BullMQ Queue+Worker, not BaseQueueService — simpler for delayed jobs
- T-1602: Escalation chain: low→medium→high→urgent, re-schedules at new priority level
- T-1603: Routing rules evaluate in priority DESC order, first match wins
- T-1603: Three condition types: subject_keyword, sender_domain, priority
- T-1605: SLA badge uses absolute thresholds (<2h red, 2-8h yellow, >8h green) not percentage
- T-1606: Assignment creates AuditLog entry tracking previous→new assignee
- T-1608: Agent dashboard uses client-side filtering (3 columns from single API call)
- T-1609: Ticket events emitted via RealtimeEventsService, frontend invalidates TanStack Query cache

## Patterns Established
- SLA timer service: `backend/src/modules/crm/ticket/services/sla-timer.service.ts`
- Routing rule service + CRUD: `backend/src/modules/crm/ticket/services/routing-rule.service.ts`
- Routing rule DTOs: `backend/src/modules/crm/ticket/dto/routing-rule.dto.ts`
- SlaBadge reusable component: `frontend/components/common/SlaBadge.tsx`
- Agent dashboard page: `frontend/pages/dashboard/agent.tsx`
- Ticket realtime hook: `frontend/hooks/use-ticket-realtime.ts`

## Blockers / Notes
- Some T-1604/T-1608 files got bundled into worktree merge commits from parallel calendar sprint
- Pre-existing lint errors in telegram/providers modules — not from Sprint 16

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: ✅ zero (ticket module verified)
- Lint: ✅ no new errors (17 pre-existing in unrelated modules)
