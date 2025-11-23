# Email API Usage Audit (Frontend vs Backend)

## Source of truth
- API clients: `frontend/lib/api/email.ts` (list, get, update, delete, bulk ops, drafts, send, sync/retention, threads).
- Attachment download: `ThreadDisplay` uses `emailApi.downloadAttachment` → `/email/attachments/{id}/download` (blob, auth).
- WebSocket events: `useWebSocket` handles `email:new/update/delete`, `thread_update`, `folder_counts`, `unread_count`, `batch_processed`.

## Frontend usages (main surfaces)
- Mailbox (`components/dashboard/Mailbox.tsx`): lists emails (`listEmails`), bulk mark read/unread (`bulkMarkRead`), bulk delete/star/flag, bulk add labels/move folder; infinite scroll; uses `getProviderIcon`; displays `getStats`, `getRetentionStats`, `getSyncStatus`; triggers `syncProvider` and `runRetention`; conversation mode reads `getConversations` and hydrates a thread via `getThread` on click.
- ThreadDisplay: uses store data for thread; falls back to `getThread` if store empty; downloads attachments via `downloadAttachment`; can fetch archived email via `fetchArchivedEmail`.
- ComposeDialog: `sendEmail`, `saveDraft`, `getDraft`.
- use-email-actions: per-email update/delete/read/star/flag/archive/move.
- Header recent search (`components/layout/Header.tsx`): `listEmails` with query.

## Remaining gaps/notes
- `getConversations` used for read-only conversation mode; `getThread` hydrates detail. No conversation-create/update API.
- `saveDraft` covers create/update (id optional); `deleteDraft` used; no separate `updateDraft`.
- Attachment metadata/progress endpoints (per `docs/api/ATTACHMENT_API.md`) are not used; only direct download.
- Retention/sync UI still basic (stats text + buttons); no telemetry.

## Suggested actions
- If attachment metadata/progress is required, add a metadata fetch before download or explicitly document the current direct-download-only choice.
- Confirm websocket event schema matches backend (`thread_update`, `folder_counts`, `unread_count`) and extend handlers if backend emits more (e.g., retention completed).
