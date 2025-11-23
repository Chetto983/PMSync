# Email UI - Full Backend Exposure & UX Plan

Reference inspiration: `esempio/Zero-main` (clean stats/sync surfaces, conversation-first view, contextual status).

## Goals
- Expose all email backend capabilities in the UI (listing, conversations, stats, retention, sync, archived fetch, attachments).
- Elevate UX to Zero-main quality: clear status, touch/keyboard friendly actions, contextual empty states, and discoverable controls.

## Current Coverage
- Lists/bulk actions: done (`listEmails`, bulk read/star/flag/move/labels/delete).
- Thread/detail: done (store + fallback `getThread`, `fetchArchivedEmail` button, attachment download via `downloadAttachment`).
- Conversations: done (toggleable list/conversation modes using `getConversations`, click-through fetches thread via `getThread`).
- Drafts/send: done (`saveDraft` create/update, `getDraft`, `deleteDraft`, `sendEmail`).
- Realtime: done (WS handlers + status chip/banner).
- Stats/retention/sync: done (surfaced in Mailbox with stats, retention metrics, sync status; sync/retention buttons).

## Gaps to Close
- Attachment metadata/progress: only direct download.
- Retention/sync UI polish: status bar exists but still text-first (no cards/history/telemetry).
- Status discovery: sidebar/header could surface a subtle status dot; list header has realtime dot.
- Empty states: CTA copy is present but no buttons; no per-folder guidance.

## Roadmap
1) Attachment Experience
   - Optional: fetch attachment metadata before download; show size/type and progress bar for large files.
   - Keep direct download as fallback; add a small "view details" popover.
2) Stats/Sync/Retention UX
   - Replace inline text with a compact status bar: unread/starred, retention saved MB, last sync time. (status bar added; needs richer visuals/history)
   - Add per-provider sync control (dropdown) and show sync status badges.
   - Log/telemetry hook for sync/retention actions.
3) Status & Accessibility
   - Add a small status dot in sidebar header (green/amber/red) mirroring WS state; realtime dot exists in header.
   - Ensure keyboard access for all action bars; tooltip + aria labels. (ThreadDisplay actions now have aria-labels)
4) Empty States & Guidance
   - Fine-tune empty copy per folder/label; add "Try sync now"/"Adjust filters" CTAs and lightweight buttons.
5) QA & Docs
   - Extend tests for conversation mode, attachment metadata flow, and status dot rendering.
   - Update API audit once conversation/metadata paths are live; keep lint/test/build gates.

## Latest Progress
- Conversation mode shipped (toggle in Mailbox header, `getConversations` + `getThread` fetch on click).
- Realtime/status bar added with dot + chip, stats, mode toggle, sync/retention buttons (sync status text now concise).
- ThreadDisplay action buttons now include aria-labels; archived fetch CTA uses i18n fallback.
- Locales updated for fetch-archived and sync/retention labels (en/it).
- Tests/documentation still to be expanded for the new mode and status bar polish.
