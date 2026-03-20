---
phase: 90-email-operations-verification
verified: 2026-03-20T11:41:41Z
status: gaps_found
score: 18/21 must-haves verified
re_verification: false
gaps:
  - truth: "Attachment download works from thread view (on-demand fetch for pending)"
    status: partial
    reason: "The download call in use-email-page-actions.ts uses raw apiClient.get() instead of emailsApi.downloadAttachment(). This violates the CLAUDE.md anti-pattern rule and contradicts the key_link in plan 90-02 which stated the path must be AttachmentCard -> emailsApi.downloadAttachment."
    artifacts:
      - path: "frontend/components/email/hooks/use-email-page-actions.ts"
        issue: "Line 219: uses apiClient.get<Blob>('/emails/.../download') instead of emailsApi.downloadAttachment()"
    missing:
      - "Replace raw apiClient.get call with emailsApi.downloadAttachment(messageId, attachmentId) in handleDownloadAttachment"
  - truth: "Folder reorder via drag persists after refresh"
    status: partial
    reason: "FolderSidebar.tsx has a TODO comment at line 14 documenting that nested folder drag-into-folder (move folder to new parent) requires a PATCH /folders/:id endpoint that does not exist in the backend. The frontend indentation works visually but moving a folder to a new parent cannot persist."
    artifacts:
      - path: "frontend/components/email/sidebar/FolderSidebar.tsx"
        issue: "Line 14 TODO: 'Backend API update required for nested folders drag-into-folder. PATCH /folders/:id { parentId } is missing.'"
    missing:
      - "Backend PATCH /folders/:id endpoint to support parentId move (or acceptance that folder-to-folder nesting is out of scope for this phase)"
  - truth: "Thread view displays all messages in a conversation with correct order"
    status: partial
    reason: "Plan 90-02 acceptance criterion required ThreadView.tsx to import useEmailThread. ThreadView.tsx is a fully presentational component and does not import any query hook; data is fetched by the email page via useEmail(id). The functional requirement (no raw fetch calls) is met, but the stated wiring criterion is not: useEmailThread exists in use-emails.ts but is never called for the thread view path."
    artifacts:
      - path: "frontend/components/email/thread/ThreadView.tsx"
        issue: "Presentational component, no useEmailThread import. email.tsx uses useEmail(id) which fetches a single email, not a thread."
    missing:
      - "Evaluate whether useEmailThread should replace useEmail(id) for thread display, or update the acceptance criterion to reflect the actual pattern (low priority — functional gap is nil, architecture gap is real)"
human_verification:
  - test: "Open app, navigate to Inbox, click any email with attachments, click the download link on an attachment"
    expected: "File downloads correctly with correct filename and MIME type"
    why_human: "The raw apiClient.get path works functionally but bypasses the emailsApi module. Verify the download still works end-to-end against live Gmail before the refactor."
  - test: "Open app, drag a folder in the sidebar and attempt to drop it onto another folder"
    expected: "Should either (a) move the folder and persist after refresh, or (b) show a 'not supported' indicator. Currently shows indentation change visually but cannot persist via API."
    why_human: "Needed to confirm whether the visual artifact misleads users and whether a backend endpoint is required to close FE-13."
  - test: "Live Gmail end-to-end for reply, forward, schedule send, undo send snackbar"
    expected: "All compose operations work with real Gmail data; undo send countdown shows and cancels correctly"
    why_human: "Plans 90-02 and 90-03 Task 3 checkpoints were marked approved by user but the verification agent cannot replay that session"
---

# Phase 90: Email Operations Verification — Verification Report

**Phase Goal:** Verify all email operations (backend APIs + frontend UI) function correctly after the hotfix stream.
**Verified:** 2026-03-20T11:41:41Z
**Status:** gaps_found
**Re-verification:** No — initial verification
**Score:** 18/21 must-haves verified

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | All existing email CRUD/send/bulk/search spec files pass | VERIFIED | 104 tests pass across 6 suites (npx jest confirmed) |
| 2  | All existing folder and attachment spec files pass | VERIFIED | Included in the 6 suites above |
| 3  | Every email controller route has @Auth() decorator | VERIFIED | Class-level @UseGuards(TenantGuard, RolesGuard) on all 8 controllers |
| 4  | Every service method call in controllers includes tenantId parameter | VERIFIED | grep confirms tenantId extracted from req.user.tenantId in every handler |
| 5  | Folder CRUD controller routes delegate correctly | VERIFIED | folders.controller.ts — listFolders, createFolder, renameFolder, deleteFolder, syncFolders all delegate with tenantId |
| 6  | Signature CRUD + set-default controller routes delegate correctly | VERIFIED | signatures.controller.ts — all 5 routes wired to signatureService with tenantId |
| 7  | Template CRUD + duplicate + set-default controller routes delegate correctly | VERIFIED | templates.controller.ts — all 6 routes wired to templateService with tenantId |
| 8  | Both attachment download paths exist and stream responses | VERIFIED | GET /email/attachments/:id/download (AttachmentsController) and GET /emails/:emailId/attachments/:attachmentId/download (email-actions.controller.ts) — both confirmed |
| 9  | Email list renders with correct sender, subject, date, and unread indicator | VERIFIED | ThreadListItem.tsx renders all fields, has aria-labels on icon buttons |
| 10 | Email list responds to folder/label sidebar clicks by filtering content | VERIFIED | email.tsx uses useEmailFilters store; folder/label selection flows through baseEmailParams |
| 11 | Search input filters emails with debounced query | VERIFIED | EmailSearchBar.tsx uses useDebouncedCallback (use-debounce), 300ms debounce confirmed |
| 12 | Pagination or infinite scroll loads more emails | VERIFIED | email.tsx uses useQueries with multi-page loading and hasMore/handleLoadMore wired |
| 13 | Thread view displays all messages in a conversation with correct order | PARTIAL | ThreadView.tsx is presentational (no useEmailThread import); data flows via useEmail(id) in parent. Functional requirement met; stated wiring criterion not met. |
| 14 | Attachment download works from thread view (on-demand fetch for pending) | PARTIAL | AttachmentCard uses onDownload prop correctly; but use-email-page-actions.ts implements download via raw apiClient.get() instead of emailsApi.downloadAttachment() |
| 15 | Reply opens compose with pre-filled recipients and quoted body | VERIFIED | ComposeDialog handles mode='reply' with computeInitialTo/computeInitialBody and useReplyToEmail |
| 16 | Forward opens compose with forwarded content and empty To | VERIFIED | ComposeDialog mode='forward' confirmed |
| 17 | User-edited subject in reply compose persists through send | VERIFIED | subject state resets only on [mode, originalEmail.id, open] change, not on re-render |
| 18 | Draft auto-save works on interval | VERIFIED | useDebounce(subject, AUTOSAVE_DELAY_MS) and useSaveDraft wired |
| 19 | Schedule send dialog accepts date/time and defers send | VERIFIED | ScheduleSendDialog.onSchedule(Date) -> ComposeDialog performSend(scheduledAt) -> API call with scheduledAt.toISOString() |
| 20 | Folder sidebar renders all folders grouped by provider | VERIFIED | FolderSidebar.tsx uses useFolders hook, groups by provider |
| 21 | Labels sidebar renders hierarchical label tree | VERIFIED | LabelsSidebar.tsx uses useLabels hook; LabelTreeDndWrapper provides DnD reorder with useMoveLabel persisting orderIndex+parentId |

**Score: 18/21 truths verified (3 partial)**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/src/modules/email/controllers/email-actions.controller.ts` | Email send/reply/forward/bulk routes | VERIFIED | Class-level TenantGuard+RolesGuard, all routes delegate to emailSendService/emailsService |
| `backend/src/modules/email/controllers/folders.controller.ts` | Folder CRUD routes | VERIFIED | @UseGuards at line 166, all 5 CRUD routes + syncFolders present |
| `backend/src/modules/email/controllers/signatures.controller.ts` | Signature CRUD routes | VERIFIED | @UseGuards at line 23, all 5 routes present |
| `backend/src/modules/email/controllers/templates.controller.ts` | Template CRUD routes | VERIFIED | @UseGuards at line 28, all 6 routes present |
| `backend/src/modules/email/controllers/attachments.controller.ts` | Standalone attachment download | VERIFIED | @UseGuards at line 51, GET :id/download at line 80 |
| `frontend/components/email/list/ThreadList.tsx` | Email list rendering | VERIFIED | Presentational component; receives data via props from email.tsx which uses emailsListOptions |
| `frontend/components/email/thread/ThreadView.tsx` | Thread message display | VERIFIED | Presentational; data from useEmail(id) in parent |
| `frontend/components/email/compose/ComposeDialog.tsx` | Compose new/reply/forward | VERIFIED | useSendEmail/useReplyToEmail/useForwardEmail wired; subject preservation confirmed |
| `frontend/components/email/sidebar/FolderSidebar.tsx` | Folder sidebar with DnD | VERIFIED | useFolders hook, DroppableFolderItem + SortableFolderItem with separate DnD contexts |
| `frontend/components/email/sidebar/LabelsSidebar.tsx` | Labels sidebar | VERIFIED | useLabels hook, LabelTreeDndWrapper with useMoveLabel for reorder persistence |
| `frontend/components/email/labels/LabelTreeDndWrapper.tsx` | DnD reorder for labels | VERIFIED | useMoveLabel persists parentId+orderIndex via labelsApi.updateLabel |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| email-actions.controller.ts | email-send.service.ts | emailSendService.send/reply/forward | WIRED | Grep: emailSendService. at lines 160, 197 etc |
| attachments.controller.ts | attachment-on-demand.service.ts | attachmentOnDemandService | WIRED | Grep: attachmentOnDemandService at lines 98, 200 |
| email.tsx (page) | use-emails.ts | emailsListOptions query hook | WIRED | email.tsx line 151: emailsListOptions({...baseEmailParams}) |
| ComposeDialog.tsx | use-emails.ts | useSendEmail/useReplyToEmail/useForwardEmail | WIRED | Lines 40-42 and 173-175 confirmed |
| AttachmentCard.tsx | emails.ts API module | emailsApi.downloadAttachment | NOT_WIRED | AttachmentCard uses onDownload prop; parent hook (use-email-page-actions.ts) uses raw apiClient.get() instead of emailsApi.downloadAttachment |
| FolderSidebar.tsx | use-folders.ts | useFolders/useCreateFolder | WIRED | Line 51: import useFolders from use-folders; line 82: const {data} = useFolders() |
| LabelsSidebar.tsx | use-labels.ts | useLabels/useCreateLabel/useUpdateLabel | WIRED | Line 30: import useLabels; line 47: const {data} = useLabels() |
| LabelTreeDndWrapper.tsx | labels.ts API module | labelsApi.reorderLabels | PARTIAL | Uses useMoveLabel (labelsApi.updateLabel with orderIndex), not labelsApi.reorderLabels directly. Functional equivalent. |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BAPI-02 | 90-01 | Email CRUD, send, reply, forward, draft, delete, bulk operations | SATISFIED | 95 tests pass; controller audit confirms all routes |
| BAPI-03 | 90-01 | Folder list, create, rename, move, delete, sync | SATISFIED | folders.controller.ts verified; 9 tests pass |
| BAPI-04 | 90-01 | Signature CRUD + set-default | SATISFIED | signatures.controller.ts verified |
| BAPI-05 | 90-01 | Template CRUD + duplicate + set-default | SATISFIED | templates.controller.ts verified |
| BAPI-25 | 90-01 | Attachment download (both paths) | SATISFIED | Both routes confirmed: standalone + scoped |
| FE-03 | 90-02 | Email list: loads, filters, searches, paginates | SATISFIED | emailsListOptions wired, debounce confirmed, pagination confirmed |
| FE-04 | 90-02 | Thread view: messages, attachments, actions | SATISFIED | ThreadView renders messages with reply/forward/delete actions; attachment download works via prop chain (anti-pattern noted separately) |
| FE-05 | 90-02 | Compose: new/reply/forward/draft/schedule/undo | SATISFIED | All mutation hooks wired; scheduledAt, draft save, UndoSendSnackbar confirmed |
| FE-12 | 90-03 | Labels sidebar: CRUD, DnD reorder, cross-parent, email assign | SATISFIED | LabelTreeDndWrapper+useMoveLabel persists; LabelPickerDialog bulk-assign confirmed |
| FE-13 | 90-03 | Folders sidebar: CRUD, email drag-drop, reorder | PARTIAL | Create/rename/delete/email-drop all work; folder-to-folder nesting drag cannot persist (missing backend PATCH /folders/:id) |

No orphaned requirements: all 10 IDs declared in plans match all 10 Phase 90 entries in REQUIREMENTS.md.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/components/email/hooks/use-email-page-actions.ts` | 219 | Raw `apiClient.get<Blob>()` instead of `emailsApi.downloadAttachment()` | Warning | Bypasses the API abstraction layer; not a functional bug but violates CLAUDE.md anti-pattern rule |
| `frontend/components/email/sidebar/FolderSidebar.tsx` | 14 | TODO comment: missing backend PATCH /folders/:id for move-to-parent | Warning | Folder drag-to-nest shows visual feedback but cannot persist the new parentId |

---

## Human Verification Required

### 1. Attachment Download End-to-End

**Test:** Open the app, navigate to an email with attachments, click the download link.
**Expected:** File downloads correctly with the right filename and type.
**Why human:** The raw apiClient.get() path works functionally for downloads despite the anti-pattern; confirm before the refactor to emailsApi.downloadAttachment.

### 2. Folder Drag-to-Nest Behavior

**Test:** In the folder sidebar, drag a custom folder and drop it onto another custom folder.
**Expected:** Either (a) folder nests correctly and persists after refresh, or (b) a clear "not supported" visual indicator.
**Why human:** The TODO in FolderSidebar.tsx states this is unimplemented at the backend. Currently the frontend may show incorrect visual feedback without persisting.

### 3. Live Compose Operations (Reply, Forward, Undo Send)

**Test:** Reply to an email, edit the subject, send. Verify subject is preserved. Send an email and click Undo. Schedule a future send.
**Expected:** Reply subject persists through send. Undo cancels the send. Schedule sets scheduledAt correctly.
**Why human:** Plans 90-02/90-03 Task 3 checkpoints were marked human-approved but verification agent cannot replay the Playwright/CDP session.

---

## Gaps Summary

Three partial truths block a clean pass:

1. **Attachment download anti-pattern** — `use-email-page-actions.ts` uses a raw `apiClient.get()` call for attachment download instead of the `emailsApi.downloadAttachment()` abstraction that exists in `frontend/lib/api/emails.ts`. This is a CLAUDE.md anti-pattern (no raw apiClient calls in component/hook code). The download works functionally. Fix: one-line replacement in `handleDownloadAttachment`.

2. **Folder drag-to-nest has no backend support** — `FolderSidebar.tsx` has a documented TODO at line 14: moving a folder to a new parent via drag requires a `PATCH /folders/:id { parentId }` endpoint that does not exist. The FE-13 requirement covers "email drag-drop moves" (which works) but the nested folder move is unresolved. This should be scoped explicitly as out-of-scope or added as a new backend requirement.

3. **ThreadView wiring criterion not met** — The plan's acceptance criterion stated `ThreadView.tsx` must import `useEmailThread`. `ThreadView.tsx` is a presentational component; data is fetched by the email page via `useEmail(id)`. The functional requirement (no raw fetch) is satisfied. The criterion was overconstrained. This is a documentation gap, not a functional gap.

Items 1 and 2 are the substantive gaps. Item 3 is a criterion mismatch with no functional impact.

---

_Verified: 2026-03-20T11:41:41Z_
_Verifier: Claude (gsd-verifier)_
