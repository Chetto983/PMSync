# Email Components Hardening Roadmap

**Scope:** `frontend/components/email` (ThreadList, ThreadDisplay, ComposeDialog, shared widgets)  
**Goals:** Eliminate security risks, remove dead/duplicated code, and simplify maintenance while keeping UX stable.

## Current Findings (from 2025-11-23 review)
- `ThreadDisplay` renders `dangerouslySetInnerHTML` without sanitization → XSS risk for HTML emails.
- Dead/unused props: `viewMode` in `ThreadListItem`, `threadId` in `ThreadActionBar` (passed, never read).
- Duplicated helpers (`parseEmailFrom`, date formatters) in `ThreadDisplay` and `ThreadListItem`; similar scrollbar styles duplicated in list/detail.
- Attachment rendering repeats filters and embeds a long download flow inline, hard to test and maintain.
- Realtime refresh path is opaque: `useWebSocket` drives store updates, but email UI lacks coverage to ensure list/detail reflect WS events (new/update/delete/thread, counts) and reconnect scenarios.

## Roadmap
### Phase 0 – Security Patch (today) ✅
- Add client-side HTML sanitization (e.g., DOMPurify) before rendering email bodies in `ThreadDisplay`. **Done**
- Add unit tests to assert scripts/unsafe attributes are stripped and links remain clickable. **Done**

### Phase 1 – Contract Cleanup ✅
- Decide on `viewMode` usage; either implement differing layouts or remove the prop from list item and parent signatures. **Removed/cleaned**
- Remove or repurpose `threadId` prop in `ThreadActionBar` (data-testid/analytics) to avoid dead props. **Removed**

### Phase 2 – Shared Utilities ✅
- Extract `parseEmailFrom`, date formatters, and thread-id resolution into `frontend/components/email/shared/utils.ts`. **Done**
- Update `ThreadListItem` and `ThreadDisplay` to consume the shared helpers; add unit tests around the utilities. **Done**

### Phase 3 – Attachments & UX Polish ✅
- Extract attachment download logic into a helper/hook (handling ctrl/meta click vs. inline open) and cover with tests. **Done**
- Deduplicate scrollbar styling into a shared style object/mixin consumed by list/detail containers. **Done**
- Add a short inline comment documenting the ctrl/meta click behavior in attachment chips. **Done**

### Phase 3b – Realtime Refresh Reliability ✅
- Audit email UI against WS events (`onEmailNew/Update/Delete`, `onThreadUpdate`, `onUnreadCountUpdate`, `onFolderCountsUpdate`, `onEmailBatchProcessed`). **Covered via chip status + WS tests**
- Add component-level tests to ensure list/detail react to store mutations from WS (new email prepends, deletes drop from list/detail, thread updates refresh counts). **Covered with WS handler tests; chip surfaces connection state**
- Add reconnection/backoff note or lightweight handler to surface connection state (optional banner/toast) to avoid silent stale views. **Chip added in Mailbox**

### Phase 4 – Testing & Regression Nets ✅ (partially)
- Expand unit tests for:
  - Label rendering paths (labels vs. emailLabels) in `ThreadListItem`.
  - Conversation badge counts and selection state. **Counts covered**
  - Sanitized body rendering in `ThreadDisplay`. **Covered**
- Add a smoke-level integration test for rendering a thread with attachments and labels.

### Phase 5 – Metrics & Guardrails
- Track render errors/download failures for attachments (console/error boundary).
- Add lightweight performance sanity: list render should stay under target time for 200 items (manual check or storybook benchmark).

## Next Actions (proposed order)
1) Implement Phase 0 sanitization and tests.  
2) Clean dead props (`viewMode`, `threadId`), then refactor helpers (Phase 1–2).  
3) Tackle attachment/download refactor and scrollbar dedupe (Phase 3).  
4) Add realtime refresh coverage (Phase 3b).  
5) Add the test nets in Phase 4 and basic error logging (Phase 5).  
6) Reassess open items after the above; update this roadmap with owners/ETA.
