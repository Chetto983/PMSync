# Email API Usage Audit (Frontend vs Backend)

## Source of truth
- API clients: `frontend/lib/api/email.ts` (list, get, update, delete, bulk ops, drafts, send).
- Attachment download: `ThreadDisplay` fetches `/email/attachments/{id}/download` with token.
- WebSocket events: `useWebSocket` handles `email:new/update/delete`, `thread_update`, `folder_counts`, `unread_count`, `batch_processed`.

## Frontend usages (main surfaces)
- Mailbox (`components/dashboard/Mailbox.tsx`): lists emails (`listEmails`), bulk mark read/unread (`bulkMarkRead`), bulk delete/star/flag, bulk add labels/move folder; infinite scroll; uses `getProviderIcon`.
- ThreadDisplay: uses store data for thread, downloads attachments via REST.
- ComposeDialog: `sendEmail`, `saveDraft`, `getDraft`.
- use-email-actions: per-email update/delete/read/star/flag/archive/move.
- Header recent search (`components/layout/Header.tsx`): `listEmails` with query.

## Gaps to confirm/close
- `getThread`, `getConversations`, `getStats`, `fetchArchivedEmail`, retention stats/run are not used in UI (store uses its own thread map; list is non-conversation mode only).
- `saveDraft` covers both create/update (id optional); `deleteDraft` used; no separate `updateDraft` call needed.
- Attachment client `downloadAttachment` is unused; `ThreadDisplay` does a direct fetch to `/email/attachments/{id}/download` (note path differs from client’s `/emails/:emailId/attachments/:attachmentId/download`).
- Attachment metadata/progress endpoints (per `docs/api/ATTACHMENT_API.md`) are not used; only direct download.

## Suggested actions
- Decide whether to expose conversation view using `getConversations`/`getThread` or keep list-only; if unused, consider trimming the client or documenting intentionally unused endpoints.
- Attachment download path aligned: `downloadAttachment` now targets `/email/attachments/{id}/download` and `ThreadDisplay` uses it.
- Retention/sync stats endpoints (`getStats`, `getRetentionStats`, `runRetention`, `fetchArchivedEmail`) are currently unused; document or remove to avoid drift.
- Confirm websocket event schema matches backend (`thread_update`, `folder_counts`, `unread_count`) and add handlers if backend emits more (e.g., retention completed).

## Quick checklist
- [x] Email list/detail actions mapped to API client methods.
- [x] Bulk operations mapped.
- [x] Attachment download uses authenticated REST call.
- [ ] Draft update path either wired or removed.
- [ ] Attachment metadata/progress endpoints: decide to use or intentionally skip.
