# Backend API & Realtime Overview (MailAgent)

Audience: developers/QA reviewing or integrating with the backend. Summarizes REST endpoints (as exposed by frontend API clients) and realtime socket events.

Auth & tenancy
- All REST controllers use `JwtAuthGuard` + `TenantGuard`; provide `Authorization: Bearer <JWT>` and tenant is derived from the token.
- Request validation: NestJS `ValidationPipe` with `whitelist/transform` on controllers.
- Pagination: most list endpoints accept `limit/offset` (see contacts/calendar APIs).

AI (Mistral, sessions, insights) — `/ai`
- `POST /ai/chat` — chat completion (Mistral) with optional history; returns AI message.
- `POST /ai/chat/sessions` — create chat session.
- `GET /ai/chat/sessions` — list sessions; `GET /ai/chat/sessions/:id` — get session; `DELETE /ai/chat/sessions/:id` — delete.
- `POST /ai/agent` — run LangChain-style agent (tools).
- `POST /ai/summarize/:emailId` — summarize an email.
- `POST /ai/smart-reply/:emailId` — generate smart replies.
- `POST /ai/categorize/:emailId` — categorize email.
- `POST /ai/memory/search` — RAG search (KnowledgeBase).

Multi-agent & HITL — `/ai/multi-agent`
- `POST /ai/multi-agent/process` — orchestrated multi-agent flow with context (history, preferences, auto-approve threshold).
- Pending actions (HITL) are handled in the multi-agent service/HitlService; realtime events emit AI action status (see socket events).

Calendar — `/calendar` (from `frontend/lib/api/calendar.ts`)
- `GET /calendar/events?providerId&calendarId&startTime&endTime&limit&offset` — list events.
- `GET /calendar/events/:id` — get event.
- `POST /calendar/events` — create event.
- `PATCH /calendar/events/:id` — update event.
- `DELETE /calendar/events/:id` — delete event.
- `POST /calendar/sync/:providerId` — trigger provider sync.
- Calendar list management: `GET /calendar/calendars`; `POST /calendar/calendars`; `PATCH /calendar/calendars/:providerId/:calendarId` (rename/color).
- Attachments: `GET /calendar/events/:eventId/attachments`; `GET /calendar/events/:eventId/attachments/:attachmentId` (download URL).

Contacts — `/contacts` (from `frontend/lib/api/contacts.ts`)
- `GET /contacts?search&limit&offset&providerId` — list contacts.
- `GET /contacts/:id` — get contact.
- `POST /contacts` — create contact.
- `PATCH /contacts/:id` — update contact.
- `DELETE /contacts/:id` — delete contact.
- Sync: `POST /contacts/sync/:providerId`; `POST /contacts/sync-all`.

Email — `/email` (from `frontend/lib/api/email.ts`, `folders.ts`, `attachments.ts`)
- Listing: `GET /email` (supports folder, search, pagination, filters); `GET /email/:id` (thread/message).
- Actions: `POST /email/send` (send/compose), `POST /email/draft` (save draft), `PATCH /email/:id/read|unread|star|unstar|flag|unflag`, `POST /email/:id/move` (folder), `POST /email/:id/labels` (apply/remove labels), `POST /email/:id/reply` (reply/reply-all/forward).
- Folders: `GET /folders` (provider folders); `POST /folders/sync/:providerId` (manual sync).
- Attachments: `GET /attachments/:id` (download URL); upload endpoints for compose/draft (see `frontend/lib/api/attachments`).
- Sync: `POST /email/sync/:providerId` (manual sync per provider).

Auth/tenancy controllers (selected)
- `/auth` (login/register/logout, reset, MFA), `/providers` (connect/disconnect; OAuth callbacks), `/tenants` (tenant CRUD), `/users` (user CRUD/preferences).
- `/analytics` (dashboard metrics), `/health` (health ping), `/compliance/gdpr` (export/delete).

Realtime (Socket.io) — namespace `/realtime`
- Auth via JWT when connecting; tenant isolation via rooms `tenant:<tenantId>`.
- Email: `email:new|update|delete|batch_processed|unread_count_update|folder_counts_update|thread_update`.
- Calendar: `calendar:event_new|event_update|event_delete|list_update`.
- Contacts: `contact:new|update|delete`.
- Labels: `label:new|update|delete`.
- Sync status: `sync:status` (provider sync progress).
- AI multi-agent HITL/session: `ai:action:created|approved|rejected|executed|failed`, `ai:session:update`.
- Event payload shapes are defined in `backend/src/modules/realtime/types/realtime.types.ts` and implemented in `RealtimeEventsService`:
  - Calendar: `{ eventId, externalId?, calendarId, providerId?, reason: 'event-created'|'event-updated'|'event-deleted', event?, updates?, timestamp? }`
  - Contacts: `{ contactId?, externalId?, providerId?, reason: 'contact-created'|'contact-updated'|'contact-deleted', contact?, updates?, timestamp? }`
  - Email: `{ emailId?, externalId?, providerId, folder?, reason: 'message-processed'|'message-deleted'|'labels-updated'|'message-sent'|'sync-complete'|'read-status-updated'|'starred-updated'|'flagged-updated'|'folder-updated', email?, updates?, unreadCount?, threadId?, timestamp? }`
  - AI action/session: `{ actionId, userId, agentName, actionType, status, confidence?, severity?, payload?, reason?, error?, timestamp? }` and `{ sessionId, userId, status, agentUsed?, intent?, pendingActionsCount?, executedActionsCount?, timestamp? }`
- Frontend consumption: `frontend/hooks/use-websocket.ts` registers listeners and updates zustand stores (`useEmailStore`, `useCalendarStore`, `useContactStore`, etc.). Use `Layout` to initialize the socket with the JWT; events flow into the stores automatically.

Front-end consumers (reference)
- WebSocket integration: `frontend/hooks/use-websocket.ts` registers the above events and updates zustand stores (`useEmailStore`, `useCalendarStore`, `useContactStore`, etc.).
- REST API clients: `frontend/lib/api/calendar.ts`, `frontend/lib/api/contacts.ts`, `frontend/lib/api/ai.ts` (and `multi-agent.ts`) show current request shapes and paths.

Notes / review considerations
- Ensure backend emits realtime events for calendar/contact changes in sync/import flows (mirroring email).
- Keep JWT + tenant guard on new endpoints; align DTO validation with frontend clients.
- When adding new REST or socket events, extend `realtime.types.ts` and frontend websocket client typings.
