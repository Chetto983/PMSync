# E2E Smoke Test Plan

> **Purpose**: Systematic verification of all user-facing flows before shipping.
> **Created**: 2026-02-26 after discovering cascading 500/403 errors.
> **Method**: Playwright MCP browser automation + network request auditing.

## Ground Rules

- Every test checks **console errors** AND **network failures** (not just visual)
- A flow PASSES only if: zero 4xx/5xx in network tab (excluding favicon 404)
- Test in order: auth first, then core flows, then AI features, then settings

---

## Pre-Flight Checks

| # | Check | Command / Action | Pass Criteria |
|---|-------|-----------------|---------------|
| PF-1 | Backend running | `curl http://localhost:3000/health` | `200 OK` |
| PF-2 | Frontend running | `curl http://localhost:3001` | `200 OK` |
| PF-3 | DB tables exist | `prisma db push --accept-data-loss` (already done) | No errors |
| PF-4 | Redis running | `docker exec mailagent-redis redis-cli ping` | `PONG` |
| PF-5 | Backend restarted | Restart after CSRF fix | Fresh process |

---

## T1: Authentication Flow

### T1.1 Login
1. Navigate to `http://localhost:3001/auth/login`
2. Enter credentials, submit
3. **Check**: Redirect to `/dashboard` or `/dashboard/email`
4. **Network**: No 4xx/5xx

### T1.2 CSRF Token
1. After login, check network for `GET /auth/csrf-token`
2. **Check**: Returns `200` with `{ csrfToken: "..." }`
3. **Check**: `csrf` cookie set in browser

### T1.3 Session Persistence
1. Reload page
2. **Check**: Still authenticated (no redirect to login)
3. **Network**: `GET /auth/me` returns `200`

---

## T2: Email List (Core Flow)

### T2.1 Inbox Load
1. Navigate to `/dashboard/email`
2. Wait for email list to render
3. **Check**: Emails visible in list
4. **Network**: All `200`:
   - `GET /emails?specialUse=INBOX&limit=50&page=1`
   - `GET /folders`
   - `GET /folders/metadata`
   - `GET /users/me/preferences`
   - `GET /labels`
5. **Console**: No errors (ignore favicon 404)

### T2.2 Folder Navigation
1. Click "Inviata" (Sent) folder
2. **Check**: Email list updates
3. **Network**: `GET /emails?specialUse=SENT...` returns `200`

### T2.3 Label Filtering
1. Click a label (e.g., "FYI")
2. **Check**: Filtered list shows
3. **Network**: `GET /emails?labelIds=...` returns `200`

### T2.4 Search
1. Type in search box, press Enter
2. **Check**: Results appear or empty state
3. **Network**: `GET /emails?search=...` returns `200`

---

## T3: Email Detail & Actions

### T3.1 Open Email
1. Click any email in the list
2. **Check**: Email body renders in reading pane
3. **Network**: `GET /emails/{id}` returns `200`
4. **Console**: No errors

### T3.2 Flag Email
1. Hover email row, click flag icon
2. **Check**: Flag icon turns red
3. **Network**: `PUT /emails/{id}` returns `200`

### T3.3 Archive Email
1. Hover email row, click archive icon
2. **Check**: Email removed from inbox list
3. **Network**: Bulk move/update returns `200`

### T3.4 Delete Email
1. Hover email row, click delete icon
2. **Check**: Email removed from list
3. **Network**: Delete returns `200`

---

## T4: Compose & Reply (Phase 19 Critical)

### T4.1 New Compose
1. Click compose FAB button
2. **Check**: Compose dialog opens
3. **Check**: No AI draft section shown (consent not granted)
4. **Network**: No call to `/voltagent/generate-reply-draft`
5. **Network**: `GET /compliance/consent` returns `200`
6. Close dialog

### T4.2 Reply (No AI Consent)
1. Open an email, click "Rispondi" (Reply)
2. **Check**: Compose dialog opens in reply mode
3. **Check**: Recipients pre-filled, subject has "Re:"
4. **Check**: Quoted content visible
5. **Check**: NO AI draft controls (no tone selector, no loading spinner)
6. **Network**: NO call to `/voltagent/generate-reply-draft`
7. **Console**: Zero 403 errors
8. Close dialog

### T4.3 Reply All
1. Open an email with multiple recipients, click "Rispondi a tutti"
2. **Check**: All recipients in To/CC fields
3. **Check**: Same behavior as T4.2 (no AI draft without consent)

### T4.4 Forward
1. Open an email, click "Inoltra" (Forward)
2. **Check**: Subject has "Fwd:", body has original content
3. **Check**: Attachments carried over (if any)

### T4.5 Send Email (CSRF Validation)
1. Open new compose, fill To/Subject/Body
2. Click "Invia" (Send)
3. **Check**: Email sends successfully (or undo snackbar appears)
4. **Network**: `POST /emails/send` returns `200` (not 500 CSRF error)
5. **Console**: No "invalid csrf token" errors

---

## T5: AI Chat (CSRF Critical)

### T5.1 Open AI Chat
1. Click "Assistente AI" button in sidebar
2. **Check**: Chat panel opens
3. Type a message, press Enter
4. **Check**: Message sends, response streams back
5. **Network**: `POST /api/v1/voltagent/chat/stream/v3` returns `200`
6. **Console**: No CSRF errors, no 500s

### T5.2 AI Chat in Email Context
1. Open an email thread
2. Click the AI chat FAB (bottom-right)
3. Type "Riassumi questa email" (Summarize this email)
4. **Check**: AI responds with summary
5. **Network**: Stream endpoint returns `200`

---

## T6: Compliance & Consent

### T6.1 Consent Endpoint
1. In any authenticated page, check network
2. **Check**: `GET /compliance/consent` returns `200` (not 500)
3. **Check**: Response is array of ConsentState objects

### T6.2 Grant AI Consent
1. Navigate to `/dashboard/settings?section=preferences`
2. Find AI consent toggle
3. Toggle ON `ai_email_processing`
4. **Network**: `POST /compliance/consent` returns `200`
5. **Check**: Toggle updates optimistically

### T6.3 Verify AI Draft After Consent
1. After granting consent in T6.2, go to email
2. Open an email, click Reply
3. **Check**: AI draft section NOW appears (loading spinner or draft)
4. **Network**: `GET /api/v1/voltagent/generate-reply-draft` called
5. **Check**: Either draft loads OR error alert shows (if API key missing)

### T6.4 Data Export
1. Navigate to `/dashboard/settings?section=data-rights`
2. **Check**: Page loads without 500 errors
3. **Network**: `GET /compliance/data-export` returns `200`

### T6.5 Legal Status
1. Navigate to settings
2. **Network**: `GET /compliance/legal/status` returns `200` (not 500)

---

## T7: Calendar

### T7.1 Calendar Load
1. Navigate to `/dashboard/calendar`
2. **Check**: Calendar grid renders
3. **Network**: `GET /calendar/events` returns `200`
4. **Console**: No errors

---

## T8: Contacts

### T8.1 Contacts Load
1. Navigate to `/dashboard/contacts`
2. **Check**: Contact list renders
3. **Network**: `GET /contacts` returns `200`
4. **Console**: No errors

---

## T9: AI Features (Memory, Follow-ups)

### T9.1 AI Memories
1. Navigate to `/dashboard/ai/memories`
2. **Check**: Page loads (empty state or memory list)
3. **Network**: No 500s
4. **Console**: No errors

### T9.2 Follow-up Tracker
1. Navigate to `/dashboard/ai/follow-ups`
2. **Check**: Kanban board renders
3. **Network**: `GET /voltagent/follow-ups` returns `200`

---

## T10: Settings

### T10.1 Settings Load
1. Navigate to `/dashboard/settings`
2. **Check**: Settings page loads
3. **Network**: All settings APIs return `200`:
   - `GET /providers`
   - `GET /users/me/preferences`
   - `GET /compliance/consent`

### T10.2 Writing Style Panel
1. Navigate to settings, find Writing Style section
2. **Check without consent**: Shows info alert (no API calls to writing-style)
3. **Check with consent**: Shows style summary, manual samples, draft stats
4. **Network**: No 403s on `/voltagent/writing-style` or `/voltagent/draft-stats`

### T10.3 Billing
1. Navigate to `/dashboard/settings?section=billing`
2. **Check**: Subscription info loads
3. **Network**: `GET /subscription` returns `200`

---

## T11: Cross-Cutting Concerns

### T11.1 Rate Limiting
1. Rapidly reload email list 5 times
2. **Check**: No 429 errors on core endpoints
3. **Network**: `/users/me/preferences` not spamming (should be cached)

### T11.2 Theme Switching
1. Click theme toggle (dark/light)
2. **Check**: Theme applies correctly
3. **Check**: No console errors

### T11.3 Language Switching
1. Click language toggle (IT/EN)
2. **Check**: All UI text switches
3. **Check**: No missing translation keys in console

### T11.4 Mobile Responsive
1. Resize to 375px width
2. **Check**: Sidebar collapses, email list is full-width
3. **Check**: Action buttons visible (not hidden by hover-only on mobile)

---

## Known Issues (Pre-Existing, Not Blocking)

| Issue | Severity | Notes |
|-------|----------|-------|
| favicon.ico 404 | Low | Missing favicon file |
| HMR `isSnippetRedundant` error | Dev-only | Transient, not in production |
| `/users/me/preferences` polling | Low | Multiple calls per page, needs dedup |

---

## Execution Checklist

```
[ ] PF-1 through PF-5 (Pre-flight)
[ ] T1.1-T1.3 (Authentication)
[ ] T2.1-T2.4 (Email List)
[ ] T3.1-T3.4 (Email Actions)
[ ] T4.1-T4.5 (Compose/Reply - Phase 19)
[ ] T5.1-T5.2 (AI Chat - CSRF)
[ ] T6.1-T6.5 (Compliance/Consent)
[ ] T7.1 (Calendar)
[ ] T8.1 (Contacts)
[ ] T9.1-T9.2 (AI Features)
[ ] T10.1-T10.3 (Settings)
[ ] T11.1-T11.4 (Cross-Cutting)
```

**Total: 32 test cases across 11 groups.**
**Estimated execution time: 20-30 minutes with Playwright MCP.**
