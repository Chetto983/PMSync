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
- Retention/sync UI polish: buttons/text are functional but not styled like Zero-main (needs cards, progress, history).
- Status discovery: sidebar/header lacks a subtle status dot; alerts are generic.
- Empty states: still generic; no sync/filter CTAs.

## Roadmap
1) Attachment Experience
   - Optional: fetch attachment metadata before download; show size/type and progress bar for large files.
   - Keep direct download as fallback; add a small "view details" popover.
2) Stats/Sync/Retention UX
   - Replace inline text with a compact status bar: unread/starred, retention saved MB, last sync time.
   - Add per-provider sync control (dropdown) and show sync status badges.
   - Log/telemetry hook for sync/retention actions.
3) Status & Accessibility
   - Add a small status dot in sidebar header (green/amber/red) mirroring WS state.
   - Ensure keyboard access for all action bars; tooltip + aria labels.
4) Empty States & Guidance
   - Fine-tune empty copy per folder/label; add "Try sync now"/"Adjust filters" CTAs.
5) QA & Docs
   - Extend tests for conversation mode, attachment metadata flow, and status dot rendering.
   - Update API audit once conversation/metadata paths are live; keep lint/test/build gates.

## Latest Progress
- Conversation mode shipped (toggle in Mailbox header, `getConversations` + `getThread` fetch on click).
- Realtime chip and sync/retention actions remain; need visual polish for Zero-main parity.
- Tests/documentation still to be expanded for the new mode.
