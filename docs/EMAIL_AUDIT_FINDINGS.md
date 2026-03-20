# Email Page Audit Findings

**Last updated**: 2026-03-20
**Audit target**: https://mail-agent-indol.vercel.app/dashboard/email
**Method**: Playwright CDP against Edge (port 9222)

---

## Audit Results: 21/32 passed (66%)

### PASSED (21)

| # | Test | Detail |
|---|------|--------|
| 1 | Thread list renders | Loads successfully |
| 2 | No API errors on load | All 200 (except 429 on folders — see below) |
| 3 | Email count shows real total | 73 emails (from `pagination.total`, not page limit) |
| 4 | Folder unread badges | Aggiornamenti:26, Spam:2, Cestino:99+ |
| 5 | Hover action bar appears | 4 buttons with aria-labels |
| 6 | All action buttons labeled | Contrassegnato, Archivia, Sposta in cartella, Elimina |
| 7 | Checkboxes have aria-labels | 23/23 labeled |
| 8 | Bulk toolbar on select-all | 7 actions: read, unread, archive, delete, move, label, refresh |
| 9 | j key moves focus | Works |
| 10 | k key moves focus | Works |
| 11 | C key opens compose | Navigates to /compose with TipTap editor |
| 12 | FAB opens compose | Works |
| 13 | Search input visible | Works |
| 14 | Search filters results | Filters thread list |
| 15 | Reply/Forward buttons | rispondi, rispondi a tutti, inoltra |
| 16 | Drag handles on rows | 22 handles |
| 17 | Avatars on rows | 22/22 with color hash |
| 18 | Unread accent borders | 19 unread with 3px left border |
| 19 | Attachment icons | Renders when present |
| 20 | Refresh triggers reload | API calls fire |
| 21 | Scroll container exists | Functional |

### FAILED (11)

#### Critical Bugs

| # | Issue | Root Cause | Status |
|---|-------|-----------|--------|
| F1 | **2x GET /api/v1/emails on folder click** | `page` state not reset atomically with filter change. `useEffect` resets page AFTER first render, causing two query keys | **FIXING** |
| F2 | **2x GET /api/v1/folders on load** | Folders fetched by both sidebar and email page independently | **TODO** |
| F3 | **429 rate limit on /api/v1/folders** | Consequence of F2 — duplicate folder fetch triggers rate limit | **TODO** |
| F4 | **Gmail sync: deleted emails persist** | Backend soft-deletes (`isDeleted=true, folder='TRASH'`) but frontend cache not invalidated by realtime delete event | **INVESTIGATING** |

#### Missing Features

| # | Feature | Status |
|---|---------|--------|
| F5 | Enter key opens email detail | Keyboard handler doesn't map Enter → open | **TODO** |
| F6 | ? key opens help dialog | Not implemented | **TODO** |
| F7 | Right-click context menu | Not implemented | **TODO** |

#### Test Detection Issues (false negatives)

| # | Test | Explanation |
|---|------|-------------|
| F8 | FAB visible check | `offsetParent === null` for `position:fixed`. FAB IS working (56x56, z:1250, inViewport) |
| F9 | Bold sender detection | Threshold was ≥600, but unread uses `fontWeight: 700` on first render, 500 on subject line |
| F10 | Virtual scrolling | Only 22 items — not enough to trigger virtualization (all fit in viewport) |
| F11 | Desktop sidebar detection | CSS class selector `[class*="sidebar"]` doesn't match MUI class names |

---

## Gmail Pub/Sub Sync Investigation

### Architecture

```
Gmail → Google Pub/Sub → POST /webhooks/gmail/push → GmailWebhookService
  → processWebhookWithLock() → queue BullMQ sync job
  → GmailSyncService.getChangesSince() → history.list(historyTypes: ['messageDeleted', ...])
  → SyncMessageProcessorService.handleDeletion()
  → prisma.email.update({ isDeleted: true, folder: 'TRASH' })
  → RealtimeEventsService.emitEmailDelete()
```

### Root Cause: Deleted emails persist in frontend

1. **Backend correctly detects deletions** via `historyTypes: ['messageDeleted']`
2. **Backend correctly marks emails** with `isDeleted: true, folder: 'TRASH'`
3. **Backend correctly filters** with `isDeleted = false` in queries
4. **BUT**: Frontend TanStack Query cache retains the email until manually invalidated
5. **Realtime `emitEmailDelete` event** may not trigger cache invalidation in all views

### Key Files

| File | Line | Role |
|------|------|------|
| `backend/src/modules/email-sync/controllers/webhook.controller.ts` | 44 | Webhook endpoint |
| `backend/src/modules/email-sync/services/gmail-webhook.service.ts` | 116 | Notification handler |
| `backend/src/modules/email-sync/drivers/google/services/gmail-sync.service.ts` | 164 | Deletion detection |
| `backend/src/modules/email-sync/services/sync-message-processor.service.ts` | 153 | Soft-delete logic |
| `backend/src/modules/realtime/services/realtime-events.service.ts` | 274 | Delete event broadcast |
| `frontend/hooks/use-email-realtime.ts` | 73 | Cache invalidation handler |

### Frontend Realtime Handler (VERIFIED OK)

- `handleEmailDelete` (use-email-realtime.ts:215-232) correctly:
  - Removes detail from TanStack cache via `queryClient.removeQueries()`
  - Invalidates list and stats via debounced invalidator
  - Invalidates thread cache
- WebSocket subscriptions registered via `websocketClient.onEmailDelete()`

### Railway Log Analysis (2026-03-20)

**Webhook health**: 1 active Gmail subscription, 1 notification last hour, 0 last 24h

**Sync scheduler** (every 5 min): "No providers need syncing at this time" — skips sync

**Incremental sync** (triggered by stalled job retry):
```
Processing incremental sync for dvdmarchetto@gmail.com
Starting incremental sync (driver mode)
Job completed: 0 messages, 0 new
```

**Root Cause**: Incremental sync returns 0 changes because:
1. `currentHistoryId === startHistoryId` — history already up-to-date
2. OR deletions in Gmail happen as **label changes** (TRASH label added), not `messagesDeleted`
3. The `modified` change type correctly re-fetches and upserts, updating folder/isDeleted
4. But if historyId was already advanced, changes are missed

**WebSocket leak**: 253+ concurrent connections from same user — connection not cleaned up on page navigation

### Action Items

- [ ] **Force full sync**: Call `POST /api/v1/email-sync/sync?type=full` to re-sync all emails
- [ ] **Check historyId**: Query `email_provider` table for stored vs Gmail current historyId
- [ ] **Fix WS leak**: WebSocket connections not cleaned up on SPA navigation (253+ connections)
- [ ] **Add deletion logging**: Add `logger.info` in `handleDeletion()` and `getChangesSince()` for observability

---

## API Call Analysis

### Page Load (14 unique calls)

| Endpoint | Count | Notes |
|----------|-------|-------|
| GET /api/auth/get-session | 1 | better-auth session |
| GET /api/v1/compliance/legal/status | 1 | Cookie consent |
| GET /api/auth/organization/list | 1 | Org switcher |
| GET /api/auth/organization/list-user-invitations | 1 | Pending invites |
| GET /api/v1/realtime/auth-token | 1 | WebSocket auth |
| GET /api/v1/subscription | 1 | Plan info |
| GET /api/v1/users/me/preferences | 1 | User settings |
| GET /api/v1/subscription/cost-status | 1 | Quota banner |
| GET /api/v1/folders/metadata | 1 | Folder counts |
| GET /api/v1/emails | 1 | Email list |
| GET /api/v1/folders | 1-2 | ⚠️ Sometimes duplicated |
| GET /api/v1/auth/csrf-token | 1 | CSRF |
| GET /api/v1/labels | 1 | Label list |
| POST /api/v1/contacts/lookup-by-emails | 1 | Sender avatars |

### Folder Click (target: 1 call)

| Before Fix | After Fix | Target |
|-----------|----------|--------|
| 2x GET /api/v1/emails | 2x GET /api/v1/emails | 1x |

Root cause: `page` state reset happens in `useEffect` (post-render), not atomically with filter change.

---

## Fixes Applied (committed dad3d3e5)

1. ✅ FAB compose button — removed `display: none` on xs, bumped zIndex to 1250
2. ✅ Email count — shows `pagination.total` instead of `threads.length`
3. ✅ Checkbox aria-labels — all 23 checkboxes labeled
4. ✅ Combined `setFilters + setFolder` into single Zustand call (partial fix for double fetch)
5. ✅ Removed `queueMicrotask` in filter-change useEffect
6. ✅ `costStatusOptions` staleTime: 30s → 5min
7. ✅ `usageOptions` staleTime: 30s → 2min
8. ✅ Org switch: targeted invalidation instead of blanket `invalidateQueries()`

---

## Remaining Work

### Priority 1 — Bugs
- [ ] Fix 2x email fetch on folder click (page state reset)
- [ ] Fix Gmail sync — deleted emails not removed from frontend
- [ ] Fix 2x folders fetch on load

### Priority 2 — Missing Features
- [ ] Enter key opens email detail
- [ ] ? keyboard help dialog
- [ ] Right-click context menu on email rows

### Priority 3 — Polish
- [ ] Bold sender for unread emails (font-weight may need verification)
- [ ] Draft click → opens editor (currently navigates to /compose?draftId=)
