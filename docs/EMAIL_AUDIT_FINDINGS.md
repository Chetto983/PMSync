# Email Page Audit Findings

**Last updated**: 2026-03-20
**Audit target**: `https://mail-agent-indol.vercel.app/dashboard/email`
**Method**: live Railway/Vercel validation with authenticated Edge CDP session

---

## Release Verdict

Phase 90 Gmail/frontend blockers are closed for the audited production mailbox.

- Railway backend fixes are live through commits `98fc5098` and `371f533b`.
- Vercel frontend is serving the validated email UI against the live Railway API.
- No remaining production blocker is open in the Gmail path that was audited end-to-end.

---

## Live Validations Closed

### Gmail parity and counts

- `specialUse=INBOX` now returns the same effective Inbox total as the provider view, including Gmail category-backed messages that still belong to Inbox.
- Provider-scoped system label queries such as `UPDATES` and `IMPORTANT` return matching totals in the sidebar path.
- Custom Gmail folder/label counts were live-verified by creating a temporary Gmail folder, moving a real message into it, and confirming the folder count updated to `totalCount: 1` and `unreadCount: 1`.

### Draft editing

- Draft create, update, fetch, and delete work against the provider, not just the local database.
- Gmail draft updates keep a stable provider draft id across saves.

### Reply and forward flow

- Reply from the thread route opens the compose UI with the correct recipient and subject.
- Forward from the thread route opens the compose UI with the expected forwarded subject.
- Live reply execution on production Gmail succeeded with `POST /api/v1/emails/:id/reply -> 201`.
- The UI behavior is consistent with the configured undo-send delay, so delayed send is no longer treated as a false failure.

### Row interactions and email actions

- Row checkbox selection no longer opens the thread as a side effect.
- Inline quick actions no longer bleed into row-open behavior.
- Real frontend move-to-folder actions now send the correct bulk move request and update provider state.

### Folder operations

- Folder creation is resilient to queue polling races: fast consecutive creates now return `201` instead of surfacing `job not found` after the folder is already created.
- Folder reparenting via sidebar drag and drop was live-validated through `PATCH /api/v1/folders/:id` with the expected `parentId`.
- Gmail custom folder counts stay correct during the sync gap because count queries now consider both canonical folder path and provider label membership.

---

## Shipped Fixes

### Backend

- [folders.controller.ts](/d:/MailAgent/backend/src/modules/email/controllers/folders.controller.ts)
  Queue-race tolerant folder creation fallback.
- [email-folder.service.ts](/d:/MailAgent/backend/src/modules/email/services/email-folder.service.ts)
  Gmail Inbox and label-backed folder parity logic.
- [folder-sync-query.service.ts](/d:/MailAgent/backend/src/modules/email-sync/services/folder-sync-query.service.ts)
  Gmail folder counts/query semantics now use folder path plus provider label membership.
- [sync.worker.ts](/d:/MailAgent/backend/src/modules/email-sync/workers/sync.worker.ts)
  Sync path aligned with Gmail label semantics.
- [email-crud.service.ts](/d:/MailAgent/backend/src/modules/email/services/email-crud.service.ts)
  Provider-backed draft update path.
- [email-send.service.ts](/d:/MailAgent/backend/src/modules/email/services/email-send.service.ts)
  Reply recipient resolution for display-name senders, reply-to, and self-sent messages.

### Frontend

- [ThreadListItem.tsx](/d:/MailAgent/frontend/components/email/list/ThreadListItem.tsx)
  Row interaction isolation for checkbox and quick actions.
- [DraggableThreadListItem.tsx](/d:/MailAgent/frontend/components/email/list/DraggableThreadListItem.tsx)
  Drag handle ownership reduced to avoid row-wide click conflicts.
- [EmailLayout.tsx](/d:/MailAgent/frontend/components/email/layout/EmailLayout.tsx)
  Folder drag-drop routing for email move vs folder reparent.
- [FolderPickerDialog.tsx](/d:/MailAgent/frontend/components/email/folders/FolderPickerDialog.tsx)
  Move dialog limited to real mail-client destinations instead of raw Gmail pseudo-labels.
- [email.tsx](/d:/MailAgent/frontend/pages/dashboard/email.tsx)
  Shared folder query, pagination cleanup, and list-shell hardening.

---

## Production Readiness Notes

- The audited Gmail mailbox is now production-ready for the Phase 90 email scope.
- Repo static gates for this area were already green before the final live pass:
  - `backend npm run lint:win`
  - `backend npm run type-check`
  - `frontend npm run lint`
  - `frontend npm run type-check`
- Remaining work is no longer Phase 90 blocker work. The next focus moves to later audit phases, not Gmail parity repair.
