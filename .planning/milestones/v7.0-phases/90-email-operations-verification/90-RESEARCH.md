# Phase 90: Email Operations Verification - Research

**Researched:** 2026-03-20
**Domain:** Email CRUD, folders, labels, signatures, templates -- backend API + frontend UI verification
**Confidence:** HIGH

## Summary

Phase 90 is a **verification and hotfix phase**, not a greenfield build. The entire email stack already exists: backend controllers (split across 5 files), services (15+ files), frontend API modules (emails, folders, labels, signatures, templates), React components (compose, thread, list, sidebar, labels, folders), and TanStack Query hooks. The goal is to audit every operation end-to-end against a live Gmail account, identify failures, and fix them.

The phase inherits an active hotfix stream with several already-fixed issues (Gmail Inbox aggregation, reply recipient resolution, folder DnD conflicts, label reorder persistence, move dialog filtering, reply/forward compose reversion, and lint baseline). The remaining gap is **live revalidation of thread-route reply/forward UI on production Gmail flows**.

**Primary recommendation:** Structure verification as a systematic requirement-by-requirement audit checklist, with each requirement tested against the deployed app using authenticated Gmail sessions. Fix bugs inline as discovered. Do NOT refactor or add features.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BAPI-02 | Email operations (list, get, send, reply, forward, draft, delete, bulk read/star/flag/move/labels) | Backend has EmailQueryController (list/search/stats), EmailsController (conversations/thread/get), EmailActionsController (send/reply/forward/draft/delete/bulk). Frontend emails.ts API module covers all operations. Hotfix stream already fixed reply recipient resolution and compose reversion. |
| BAPI-03 | Folder operations (list, create, rename, move, delete, sync) | Backend FoldersController (832 lines) handles all CRUD + sync. Frontend folders.ts API + useFolderManagement hook + FolderDialog/FolderDeleteDialog/FolderContextMenu components exist. Move dialog filtering already fixed. |
| BAPI-04 | Signature operations (list, create, update, delete, set-default) | Backend SignaturesController (86 lines) + EmailSignatureService. Frontend signatures.ts API + useSignatures hook (148 lines). SignatureId support added to send/reply/forward DTOs. |
| BAPI-05 | Template operations (list, create, update, delete, duplicate, set-default) | Backend TemplatesController (110 lines) + EmailTemplateService. Frontend templates.ts API + useTemplates hook (145 lines). Includes categories and duplicate endpoints. |
| BAPI-25 | Attachment download (both controller paths) | Two paths: `GET /emails/:emailId/attachments/:attachmentId/download` (EmailActionsController) and `GET /email/attachments/:id/download` (AttachmentsController). Both use on-demand fetch + S3 streaming. |
| FE-03 | Email list loads, filters, searches, paginates | ThreadList + ThreadListItem + EmailSearchBar + SearchFilterChips. Query hook: useEmails (727 lines). Gmail Inbox aggregation already fixed. |
| FE-04 | Thread view renders messages, attachments, actions | ThreadView + ThreadMessage + ExpandedMessage + CollapsedMessage + AttachmentCard + ThreadHeader. AI insights panel included. |
| FE-05 | Compose works (new, reply, forward, draft save, schedule send, undo send) | ComposeDialog + ComposeEditor + ComposeRecipients + ComposeAttachments + ScheduleSendDialog + UndoSendSnackbar. Reply/forward compose reversion already fixed. Remaining: live revalidation. |
| FE-12 | Labels sidebar renders, CRUD works, drag-drop assigns | LabelsSidebar + LabelTreeDndWrapper + LabelTreeItem + LabelDialog + LabelDeleteDialog + LabelPickerDialog + LabelContextMenu. useLabels hook (324 lines). Label reorder persistence already fixed. |
| FE-13 | Folders sidebar renders, CRUD works, email drag-drop moves | FolderSidebar + DroppableFolderItem + SortableFolderItem + FolderDialog + FolderDeleteDialog + FolderContextMenu. useFolderManagement hook. Provider-folder reorder collision already fixed. |
</phase_requirements>

## Standard Stack

This phase uses the existing stack -- no new dependencies needed.

### Core (already installed)
| Library | Purpose | Location |
|---------|---------|----------|
| NestJS 11 | Backend framework | backend/ |
| Prisma + PostgreSQL | ORM + DB | backend/ |
| Next.js 16 + React 19 | Frontend framework | frontend/ |
| TanStack Query | Data fetching + cache | frontend/hooks/queries/ |
| MUI | UI components | frontend/components/ |
| @dnd-kit | Drag and drop (labels, folders, emails) | frontend/components/email/ |
| Tiptap | Rich text editor (compose) | frontend/components/email/compose/ |
| Playwright | E2E testing | frontend/e2e/ |
| Jest/Vitest | Unit testing | backend/*.spec.ts |

### No New Dependencies
This is a verification phase. No new libraries should be added.

## Architecture Patterns

### Backend Controller Split (Post Phase 43)
The email module was split from a god-file into 5 focused controllers:

```
backend/src/modules/email/controllers/
  emails.controller.ts          # GET conversations, thread, single email
  email-query.controller.ts     # GET list, search, stats
  email-actions.controller.ts   # POST send/reply/forward/draft, PATCH update/bulk, DELETE
  folders.controller.ts         # Folder CRUD + sync + metadata
  signatures.controller.ts      # Signature CRUD + set-default
  templates.controller.ts       # Template CRUD + duplicate + set-default
  attachments.controller.ts     # Standalone attachment download path
```

### Frontend API Module Pattern
Each domain has a dedicated API module in `frontend/lib/api/`:
- `emails.ts` -- All email CRUD, threads, bulk, drafts, calendar invites, attachments
- `folders.ts` -- Folder CRUD, sync, metadata, type utilities (FolderItem, parseFolderId)
- `labels.ts` -- Label CRUD, reorder, email-label associations
- `signatures.ts` -- Signature CRUD, set-default
- `templates.ts` -- Template CRUD, duplicate, set-default, categories

### Frontend Component Hierarchy
```
frontend/components/email/
  layout/              # Email page layout (sidebar + list + thread)
  sidebar/             # FolderSidebar, LabelsSidebar, DroppableFolderItem
  list/                # ThreadList, ThreadListItem, EmailSearchBar, DraggableThreadListItem
  thread/              # ThreadView, ThreadMessage, ExpandedMessage, AttachmentCard
  compose/             # ComposeDialog, ComposeEditor, ComposeRecipients, ScheduleSendDialog
  labels/              # LabelTreeDndWrapper, LabelDialog, LabelPickerDialog
  folders/             # FolderDialog, FolderDeleteDialog, FolderContextMenu
  hooks/               # Email-specific hooks
  keyboard/            # Keyboard shortcut handlers
  utils/               # Shared utilities
```

### TanStack Query Hook Pattern
All query hooks live in `frontend/hooks/queries/`:
- `use-emails.ts` (727 lines) -- emailListOptions, useEmailThread, useSendEmail, useReplyEmail, etc.
- `use-labels.ts` (324 lines) -- useLabels, useCreateLabel, useUpdateLabel, etc.
- `use-folders.ts` -- useFolders, useCreateFolder, useSyncFolders, etc.
- `use-signatures.ts` (148 lines) -- useSignatures, useCreateSignature, etc.
- `use-templates.ts` (145 lines) -- useTemplates, useCreateTemplate, etc.

### Dual Attachment Download Paths
Two controller paths serve attachment downloads:
1. **Email-scoped:** `GET /emails/:emailId/attachments/:attachmentId/download` (EmailActionsController)
   - Used by frontend `emailsApi.downloadAttachment(emailId, attachmentId)`
2. **Standalone:** `GET /email/attachments/:id/download` (AttachmentsController)
   - Used for direct attachment access by ID only

Both must be verified (BAPI-25).

### Anti-Patterns to Avoid
- **Adding features during verification.** This is audit-and-fix only. No new functionality.
- **Refactoring during verification.** Fix bugs, don't restructure code.
- **Testing against mock data.** Must use live Gmail account with real emails for meaningful verification.
- **Skipping type-check after fixes.** Every fix must pass `npx tsc --noEmit` in both frontend and backend.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email recipient resolution | Custom parsing | Existing `email-send.service.ts` reply/forward logic | Already handles display-name senders, reply-to headers, self-sent -- fixed in hotfix stream |
| Folder type classification | Custom type maps | `parseFolderId()` from folders.ts + backend folder metadata API | Canonical types already mapped for Gmail/Microsoft/IMAP |
| Label drag-drop ordering | Custom DnD implementation | Existing @dnd-kit setup in LabelTreeDndWrapper | Already handles sibling order + cross-parent level shifts |
| Attachment streaming | Loading into memory | Existing S3 streaming pipeline in both controllers | Already handles on-demand fetch + proxy streaming |

## Common Pitfalls

### Pitfall 1: Gmail Category Labels vs Inbox
**What goes wrong:** Gmail uses category-based inbox (CATEGORY_PERSONAL, CATEGORY_SOCIAL, etc.) alongside label-based inbox. Queries that only filter by `INBOX` label miss category-backed messages.
**Why it happens:** Gmail's internal folder model differs from IMAP/Microsoft.
**How to avoid:** Already fixed in hotfix stream. Verify the fix holds by checking Inbox shows all expected messages.
**Warning signs:** Inbox email count is lower than expected; some emails only appear in category views.

### Pitfall 2: Reply Recipient Resolution Edge Cases
**What goes wrong:** Reply-to address calculation fails for display-name-only senders, emails with explicit reply-to headers, or self-sent messages.
**Why it happens:** Email `from` field can be `"Display Name <email@example.com>"` format, not just bare email.
**How to avoid:** Already fixed. Verify by replying to various email types (external, self-sent, with reply-to header).
**Warning signs:** Reply goes to wrong address, or reply fails with validation error.

### Pitfall 3: Compose State Reversion on Reply/Forward
**What goes wrong:** User edits subject or body in reply/forward compose, but the compose dialog silently reverts to backend-generated defaults.
**Why it happens:** React state management conflict between initial values from API and user edits.
**How to avoid:** Already fixed. Verify by editing subject line in a reply, then checking it persists through send.
**Warning signs:** Subject/body reverts to original after user makes changes.

### Pitfall 4: DnD Context Collision Between Folders and Emails
**What goes wrong:** Drag-drop operations on emails (to move between folders) interfere with folder sidebar's own drag-drop (reorder/nest folders).
**Why it happens:** Shared DnD context without proper namespace isolation.
**How to avoid:** Already fixed with separate DnD contexts. Verify both operations work independently.
**Warning signs:** Dragging an email triggers folder reorder, or vice versa.

### Pitfall 5: Label Reorder Not Persisting After Refresh
**What goes wrong:** Labels appear reordered in UI but revert to original order after page refresh.
**Why it happens:** Optimistic UI update without proper backend persistence of orderIndex changes.
**How to avoid:** Already fixed. Verify by reordering labels, refreshing page, and checking order persists.
**Warning signs:** Labels snap back to original positions on refresh.

### Pitfall 6: Attachment Download Failure on Pending Storage Type
**What goes wrong:** Attachment exists in metadata but content hasn't been fetched from provider yet (storageType='pending').
**Why it happens:** Attachments are metadata-only until first download triggers on-demand fetch from Gmail/Microsoft/IMAP.
**How to avoid:** The on-demand fetch pipeline handles this automatically. Verify by downloading an attachment that hasn't been accessed before.
**Warning signs:** 404 or empty response on first download attempt.

## Code Examples

### Verified Email API Contract (Frontend)
```typescript
// Source: frontend/lib/api/emails.ts
// List emails with filters
const { emails, pagination } = await emailsApi.listEmails({
  specialUse: 'INBOX',
  page: 1,
  limit: 50,
  excludeTrashSpam: true,
});

// Send email with attachments
const response = await emailsApi.sendEmail({
  providerId: 'provider-uuid',
  to: ['recipient@example.com'],
  subject: 'Test',
  bodyHtml: '<p>Hello</p>',
  signatureId: 'sig-uuid', // or null to skip signature
});
// Returns: { success: boolean, messageId: string }

// Reply preserves user-edited subject
await emailsApi.replyToEmail(emailId, {
  subject: 'Re: Modified subject', // optional override
  bodyHtml: '<p>Reply body</p>',
  signatureId: null, // no signature
});

// Bulk operations
await emailsApi.bulkMove(emailIds, 'TRASH');
await emailsApi.bulkMarkRead(emailIds, true);
await emailsApi.bulkAddLabels(emailIds, [labelId]);
```

### Verified Folder API Contract
```typescript
// Source: frontend/lib/api/folders.ts
// List all folders (grouped by provider)
const { providers, foldersByProvider } = await foldersApi.getFolders();

// Create subfolder
await foldersApi.createFolder({
  name: 'My Folder',
  providerId: 'provider-uuid',
  parentPath: 'Parent/Path', // optional
});

// Folder ID parsing utility
import { parseFolderId } from '@/lib/api/folders';
parseFolderId('smart:unread'); // { type: 'smart', value: 'unread' }
parseFolderId('all:inbox');    // { type: 'aggregate', value: 'inbox' }
parseFolderId('cm123...');     // { type: 'remote', value: 'cm123...' }
```

### Verified Label API Contract
```typescript
// Source: frontend/lib/api/labels.ts
// Labels support hierarchical tree with drag-drop reordering
const { labels } = await labelsApi.listLabels();
await labelsApi.reorderLabels({ labelIds: ['id1', 'id2', 'id3'] });
await labelsApi.addEmailsToLabel(labelId, { emailIds: ['email1', 'email2'] });
```

## State of the Art

| Aspect | Current State | Notes |
|--------|---------------|-------|
| Gmail Inbox aggregation | Fixed | Category-backed + label-backed messages both appear |
| Reply recipient resolution | Fixed | Handles display-name, reply-to, self-sent |
| Provider-folder DnD isolation | Fixed | Separate DnD contexts for folder reorder vs email drop |
| Thread row drag isolation | Fixed | Checkbox/quick actions isolated from row-open |
| Label reorder persistence | Fixed | Stable sibling order + cross-parent level shifts |
| Move dialog filtering | Fixed | Only Inbox/Archive/user folders offered |
| Reply/forward compose reversion | Fixed | User edits preserved through send |
| Lint/typecheck baseline | Clean | Both frontend and backend pass |
| Thread reply/forward live behavior | NEEDS VERIFICATION | Remaining gap from hotfix stream |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (E2E) + Jest/Vitest (backend unit) |
| Config file | `frontend/playwright.config.ts` (E2E), `backend/jest.config.js` + `backend/vitest.config.ts` (unit) |
| Quick run command | `cd frontend && npx playwright test --grep "email" --project=chromium` |
| Full suite command | `cd frontend && npx playwright test --project=chromium` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BAPI-02 | Email CRUD + bulk operations | unit | `cd backend && npx jest --testPathPattern="email-crud\|email-send\|email-bulk\|email-search" --passWithNoTests` | Partial (spec files exist for send, crud, bulk, search) |
| BAPI-03 | Folder CRUD + sync | unit | `cd backend && npx jest --testPathPattern="email-folder" --passWithNoTests` | Yes (email-folder.service.spec.ts) |
| BAPI-04 | Signature CRUD | manual-only | Manual API test via authenticated session | No spec file |
| BAPI-05 | Template CRUD | manual-only | Manual API test via authenticated session | No spec file |
| BAPI-25 | Attachment download (both paths) | unit | `cd backend && npx jest --testPathPattern="attachment-streaming" --passWithNoTests` | Partial (attachment-streaming.spec.ts) |
| FE-03 | Email list renders | e2e/manual | Live browser verification against deployed app | No e2e spec |
| FE-04 | Thread view renders | e2e/manual | Live browser verification against deployed app | No e2e spec |
| FE-05 | Compose works | e2e/manual | Live browser verification against deployed app | No e2e spec |
| FE-12 | Labels sidebar | unit | `cd frontend && npx jest --testPathPattern="use-labels" --passWithNoTests` | Yes (use-labels.test.ts) |
| FE-13 | Folders sidebar | unit | `cd frontend && npx jest --testPathPattern="use-folders\|folder-utils" --passWithNoTests` | Yes (use-folders.test.ts, folder-utils.test.ts) |

### Sampling Rate
- **Per task commit:** `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
- **Per wave merge:** Backend unit tests + frontend type-check + lint
- **Phase gate:** All backend spec files pass + live Gmail audit checklist complete

### Wave 0 Gaps
- No E2E test specs exist for email operations (FE-03, FE-04, FE-05) -- verification is manual/live
- No backend spec files for signatures or templates controllers -- verification is manual API testing
- This is acceptable for a verification phase -- the goal is live audit, not test suite expansion

## Open Questions

1. **Scheduled Send Verification**
   - What we know: `scheduledAt` field exists in SendEmailDto and frontend ComposeDialog has ScheduleSendDialog component
   - What's unclear: Whether BullMQ job scheduling actually fires on time with live Gmail. Requires a real scheduled email test.
   - Recommendation: Test with a short delay (1-2 minutes) during live audit

2. **Undo Send Implementation**
   - What we know: UndoSendSnackbar component exists in compose module
   - What's unclear: Whether undo actually cancels a sent email or just shows a UI element. Gmail API may not support true undo.
   - Recommendation: Verify during live audit -- likely a client-side delay before actual send

3. **Template/Signature UI Integration**
   - What we know: Backend CRUD APIs and frontend API modules exist for both
   - What's unclear: Whether compose dialog actually integrates template selection and signature insertion into the rich editor
   - Recommendation: Test the full flow: create signature/template, then use it in compose

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all files listed in Architecture Patterns section
- Git status showing current uncommitted changes (hotfix stream)
- STATE.md documenting completed hotfix fixes

### Secondary (MEDIUM confidence)
- Phase description audit status notes (documenting what was fixed vs remaining)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - directly inspected all source files, no new dependencies needed
- Architecture: HIGH - complete controller/service/component mapping from codebase
- Pitfalls: HIGH - all documented pitfalls are from the active hotfix stream with known fixes
- Open questions: MEDIUM - scheduled send, undo send, and template/signature integration need live verification

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable -- existing codebase verification, no external dependencies to track)
