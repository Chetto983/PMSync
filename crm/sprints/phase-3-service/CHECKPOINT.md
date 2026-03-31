# Sprint 15 — Checkpoint

## Stato
- **Sprint:** 15 — Ticket Model & Email-to-Ticket
- **Last Task Completed:** T-1510 — TanStack Query hooks
- **Next Task:** Sprint complete — all tasks done
- **Tasks Done:** 10/10
- **SP Completed:** 20/20
- **Last Updated:** 2026-03-31 09:27

## Last Modified Files
- backend/prisma/schema.prisma (Ticket + TicketComment models, reverse relations)
- backend/src/modules/crm/ticket/ticket.module.ts (new)
- backend/src/modules/crm/ticket/controllers/ticket.controller.ts (new)
- backend/src/modules/crm/ticket/services/ticket.service.ts (new)
- backend/src/modules/crm/ticket/services/email-to-ticket.handler.ts (new)
- backend/src/modules/crm/ticket/dto/ticket.dto.ts (new)
- backend/src/modules/crm/crm.module.ts (TicketModule wired)
- frontend/lib/api/crm-tickets.ts (new)
- frontend/hooks/queries/crm-tickets-keys.ts (new)
- frontend/hooks/queries/use-crm-tickets.ts (new)
- frontend/hooks/queries/index.ts (exports added)
- frontend/components/dashboard/crm-tickets/TicketsList.tsx (new)
- frontend/components/dashboard/crm-tickets/TicketDetail.tsx (new)
- frontend/components/dashboard/crm-tickets/CreateTicketDialog.tsx (new)
- frontend/pages/dashboard/crm/tickets.tsx (new)
- frontend/pages/dashboard/crm/tickets/[id].tsx (new)
- frontend/components/layout/Sidebar.tsx (Ticket nav item)
- frontend/locales/en.ts (crmTickets section)
- frontend/locales/it.ts (crmTickets section)
- frontend/locales/index.ts (crmTickets types)

## Key Decisions Made
- T-1501: Ticket uses simple @id (not composite PK like Contact/Email) — follows CrmAccount pattern
- T-1501: Email FK uses composite key (emailId + emailTenant) to match Email's @@id([id, tenantId])
- T-1506: State machine in DTO file, not separate service — keeps it simple and co-located
- T-1507: Email-to-Ticket via @OnEvent(EmailIndexedEvent) — event-driven, not direct coupling
- T-1507: [SUPPORT] prefix detection is case-insensitive, prefix stripped from ticket subject
- T-1507: Contact lookup by parsing sender email from "Name <email>" format
- T-1508: Used MUI Table (not DataGrid) for consistency with AccountsList pattern
- T-1509: Status transitions shown as buttons, not dropdown — more visible and intentional

## Patterns Established
- CRM Ticket API module: `frontend/lib/api/crm-tickets.ts`
- CRM Ticket query hooks: `frontend/hooks/queries/use-crm-tickets.ts`
- CRM Ticket query keys: `frontend/hooks/queries/crm-tickets-keys.ts`
- TicketModule under `backend/src/modules/crm/ticket/`
- Email-to-Ticket handler listens for domain events (EmailIndexedEvent)

## Blockers / Notes
- Note: Frontend T-1508..T-1510 files got bundled into a worktree merge commit (4df5ef3e) — code is in repo but under wrong commit message
- Email-to-Ticket handler deduplicates on emailId to prevent duplicate tickets
- Contact lookup iterates all contacts — could be slow with many contacts. Consider adding email index later.

## Validation Status
- Backend tsc: ✅ passing
- Frontend tsc: ✅ passing
- Circular deps: ✅ zero
- Railway health: ✅ 200 (DB, Redis, Mistral up)
- Railway GET /crm/tickets: ✅ 401 (route registered, auth guard active)
- Vercel /dashboard/crm/tickets: ✅ 307 (auth redirect, page exists)
