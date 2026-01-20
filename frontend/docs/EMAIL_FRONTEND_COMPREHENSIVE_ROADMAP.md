# MailAgent Email Frontend - Comprehensive Implementation Roadmap

> **Version**: 3.0
> **Created**: December 2025
> **Updated**: January 20, 2026
> **Status**: Phases 0-7 Complete, Phase 8 Partial (~40%), Phase 9 Partial (~20%), Phase 10 Partial (~70%)
> **Note**: This is the 5th rebuild - all research MUST be completed before writing code!

---

## 🎯 PROGRESS TRACKER

### ✅ Phase 0: Research & Planning - COMPLETE
- [x] Backend API endpoints documented
- [x] Response formats verified
- [x] Technology stack confirmed
- [x] Feature list finalized

### ✅ Phase 1: API Validation - COMPLETE (December 29, 2025)
**26/26 tests passed - NO MOCKS - Real browser validation via Playwright**

| API Module | Tests | Status |
|------------|-------|--------|

| emailsApi | 14 | ✅ PASSED |
| foldersApi | 4 | ✅ PASSED |
| labelsApi | 5 | ✅ PASSED |
| providersApi | 2 | ✅ PASSED |
| attachmentsApi | 1 | ✅ PASSED |

**Validated Methods:**
- emailsApi: `listEmails`, `getEmail`, `getStats`, `updateEmail`, `searchEmails`, `getConversations`, `getThread`, `saveDraft`, `getDraft`, `deleteDraft`, `bulkMarkRead`, `bulkMarkImportant`, `bulkAddLabels`, `bulkRemoveLabels`, `getAttachmentMetadata`
- foldersApi: `getFolders`, `getFoldersByProvider`, `syncFolders`, `syncAllFolders`
- labelsApi: `listLabels`, `getLabel`, `createLabel`, `deleteLabel`, `updateLabel`
- providersApi: `getProviders`, `getProvider`

**Fixes Applied:**
- `saveDraft`: Backend returns email directly → wrapped to `{ id, email }` format
- `getDraft`: Backend returns email directly → removed `.email` accessor

### ✅ Phase 2: Folder & Navigation - COMPLETE (December 30, 2025)
**Completed Components:**
- [x] FormDialog reusable component (with icon support)
- [x] FolderDialog (create/rename) with proper MUI layout
- [x] getFolderDisplayName() utility function
- [x] Gmail custom folder display fix (backend + frontend)
- [x] FolderSidebar with folder filtering via Zustand store
- [x] useEmailFilters hook for folder selection

**Fixes Applied:**
1. **Gmail Custom Folders Display Issue**:
   - Backend: `folder-operations.worker.ts` now validates `specialUse` using `isSystemFolder()`
   - Frontend: `getFolderDisplayName()` utility returns `folder.name` for custom folders
   - Applied to: `FolderSidebar.tsx`, `MobileFolderSheet.tsx`

2. **MUI Dialog Layout Fixes**:
   - Created `FormDialog` component following `ConfirmDialog` pattern
   - Fixed DialogContent padding (MUI removes it when DialogTitle present)
   - Added `dividers` prop and explicit `pt: 3` padding
   - TextField with `slotProps={{ inputLabel: { shrink: true } }}` (modern API)

### ✅ Phase 3: Email List & View - COMPLETE (December 31, 2025)
**Completed Components:**
- [x] ThreadList with virtual scrolling (@tanstack/react-virtual)
- [x] ThreadListItem with 3-line layout (sender/subject/snippet)
- [x] Single email view (Outlook-style, NOT thread view)
- [x] ExpandedMessage component with full email rendering
- [x] EmailHtmlContent with Shadow DOM isolation
- [x] CID image resolution for inline attachments
- [x] Drag-and-drop between folders with provider validation
- [x] Mark as read on click
- [x] Bulk selection with action bar

**Key Features:**
- `useEmails` hook with folder filtering via `useEmailFilters` Zustand store
- `useEmail` for single email fetch (not thread view)
- DOMPurify sanitization with cid: and data: protocol support
- `replaceCidUrls()` function converts cid: URLs to attachment download URLs
- Provider validation prevents cross-provider folder moves

**Files:**
- `pages/dashboard/email.tsx` - Main email page
- `components/email/thread/ExpandedMessage.tsx` - Email display
- `components/email/thread/EmailHtmlContent.tsx` - HTML rendering with Shadow DOM
- `components/email/list/ThreadList.tsx` - Virtual scrolling list
- `hooks/use-email-realtime.ts` - WebSocket integration

### ✅ Phase 4: Labels & Organization - COMPLETE (January 1, 2026)
**Completed Components:**
- [x] LabelPickerDialog - Select and add/remove labels
- [x] LabelDialog - Create/edit labels
- [x] LabelColorPicker - Color selection
- [x] LabelContextMenu - Right-click label management
- [x] LabelDeleteDialog - Confirm label deletion
- [x] useLabelManagement hook
- [x] Bulk add labels via `useBulkAddLabels` mutation
- [x] Bulk remove labels via `useBulkRemoveLabels` mutation
- [x] Label filter in sidebar (click label to filter emails)
- [x] Label chips display in ThreadListItem
- [x] Single email label management (Label button in ExpandedMessage)
- [x] Thread label management (Tag button in ThreadViewOutlook toolbar)

### ✅ Phase 5: Compose & Draft - COMPLETE (January 20, 2026)
**Completed Components:**
- [x] Tiptap editor integration (`ComposeEditor.tsx` with `mui-tiptap`)
- [x] Draft autosave - debounced 2000ms (`useSaveDraft`, `useEmailDraft`)
- [x] Attachment upload (`ComposeAttachments.tsx` with `react-dropzone`)
- [x] Recipient autocomplete (`ComposeRecipients.tsx` with `useContactSearch`)
- [x] CC/BCC toggle with expand/collapse

**BONUS Features:**
- [x] Schedule send dialog (`ScheduleSendDialog.tsx`)
- [x] AI compose menu - fix spelling, shorten, expand, change tone (`AiComposeMenu.tsx`)
- [x] Inline AI editing (`AIInlineMenu.tsx`)
- [x] Full formatting toolbar (`EditorMenuControls.tsx`)

**Files:**
- `components/email/compose/ComposeDialog.tsx` - Main compose dialog
- `components/email/compose/ComposeEditor.tsx` - Tiptap rich text editor
- `components/email/compose/ComposeRecipients.tsx` - To/CC/BCC with autocomplete
- `components/email/compose/ComposeAttachments.tsx` - Drag-drop attachments
- `components/email/compose/ScheduleSendDialog.tsx` - Schedule send
- `components/email/compose/AiComposeMenu.tsx` - AI composition actions
- `hooks/queries/use-emails.ts` - Draft hooks (useSaveDraft, useDeleteDraft, useEmailDraft)

### ✅ Phase 6: Search & Filters - COMPLETE (January 20, 2026)
**Completed Components:**
- [x] `EmailSearchBar.tsx` - Inline search with 300ms debounce, Ctrl+K shortcut
- [x] `ThreadListHeader` integration - Search bar visible when no selection
- [x] `useEmailSearch` hook - TanStack Query with enabled: query.length >= 2
- [x] `email-ui-store` - Full filter support (search, startDate, endDate, hasAttachments)
- [x] `CommandPalette` - Global Cmd+K search for emails + contacts
- [x] API integration - `filters.search` passed to backend `/emails` endpoint

**Bonus Features:**
- [x] Keyboard shortcut Ctrl+K/Cmd+K to focus search
- [x] Escape key to clear search
- [x] Real-time results (no page reload)

**P2/P3 Deferred:**
- Date range picker UI (store ready)
- Advanced filters panel (store ready)
- Saved searches (localStorage)

### ✅ Phase 7: Real-time & Notifications - COMPLETE (December 31, 2025)
**Completed Components:**
- [x] `useEmailRealtime` hook - WebSocket event handlers
- [x] Query invalidation on email events (new, update, delete)
- [x] Folder count updates via WebSocket
- [x] Optimized query keys (`folderKeys.lists()` vs `folderKeys.all`)

**Key Features:**
- Subscribes to WebSocket events: `email:new`, `email:update`, `email:delete`
- Handles batch sync events (`email:batch-processed`)
- Updates folder unread counts in real-time
- Uses refs pattern to prevent stale closures and duplicate subscriptions
- Fixed 429 rate limit by using specific query key invalidation

**File:** `hooks/use-email-realtime.ts`

### ⚠️ Phase 8: AI Integration - PARTIAL (~40%)
**Completed:**
- [x] AI compose modal (`AiComposeMenu.tsx`, `AIInlineMenu.tsx`)
- [x] AI compose hook (`useAiCompose.ts`)
- [x] Daily Briefing (`DailyBriefing/index.tsx`, `useBriefing()`)
- [x] CommandPalette AI commands (Shift+S summarize, Shift+R reply)
- [x] Dashboard QuickActions for AI
- [x] Full API layer (`aiApi.summarizeEmail()`, `generateSmartReplies()`, etc.)

**Missing (P1/P2):**
- [ ] 8.1 AI summarize button in email view - NO UI
- [ ] 8.2 Smart reply suggestions panel - NO UI
- [ ] 8.4 Priority indicator on email list items - NO UI
- [ ] 8.5 Sentiment display on email view - NO UI
- [ ] Label suggestions integration - NO UI

**API Ready but No Frontend:**
- `aiApi.summarizeEmail(emailId)` ✅
- `aiApi.generateSmartReplies(emailId)` ✅
- `aiApi.analyzeSentiment(emailId)` ✅
- `aiApi.calculatePriority(emailId)` ✅
- `aiApi.categorizeEmail(emailId)` ✅
- `aiApi.analyzeEmail(emailId)` ✅

### ⚠️ Phase 9: Advanced UX - PARTIAL (~20%)

**Completed:** Thread collapse/expand, basic shortcuts (C, Cmd+K)
**Missing:** j/k navigation, undo send, email templates, VIP split inbox

### ⚠️ Phase 10: Performance & Polish - PARTIAL (~70%)

**Completed:** Virtual scrolling, query caching, error boundaries
**Missing:** Loading skeletons in email list, E2E tests

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Backend API Reference (Production Ready)](#2-backend-api-reference)
3. [Technology Stack (Already Installed)](#3-technology-stack)
4. [Complete Feature List](#4-complete-feature-list)
5. [UI/UX Design Patterns](#5-uiux-design-patterns)
6. [Implementation Phases](#6-implementation-phases)
7. [File Structure](#7-file-structure)
8. [Validation Checklist](#8-validation-checklist)

---

## 1. Executive Summary

### Project Context
- **5th rebuild** - Previous 4 attempts failed due to insufficient planning
- **Backend is production ready** - All APIs documented and tested
- **Libraries already installed** - No new dependencies needed
- **Zero-staging example available** - Reference implementation in `esempio/Zero-staging`

### Core Principles
1. **Research before code** - Every feature researched online
2. **Backend-first** - Match frontend to existing API contracts
3. **TanStack Query for data** - Never raw `apiClient` in components
4. **Zustand for UI state** - Lightweight, no boilerplate
5. **Superhuman UX patterns** - Fast, keyboard-first, minimal

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|

| **Consolidate star/flag → "Important"** | Backend has `isStarred`, `isFlagged`, and `isImportant`. Frontend will ONLY use `isImportant` for cleaner UX. One toggle, one concept. |
| **2-line list items (no snippet)** | Superhuman pattern: sender+date on line 1, subject on line 2. No body preview = cleaner, faster rendering. |
| **Virtual list always** | Even for small lists, use `@tanstack/react-virtual` for consistency and future-proofing. |
| **Optimistic updates with undo** | Update UI immediately, show toast with "Undo" button, delay API call by 3s for undo window. |
| **Keyboard-first navigation** | j/k for up/down (vim-style), Enter to open, Escape to close. Gmail/Superhuman standard. |
| **Thread view collapsed by default** | Show latest email expanded, previous emails collapsed with sender+snippet preview. |
| **Labels over folders for organization** | Folders for system categories (Inbox, Sent, Trash), labels for user organization (color-coded tags). |

---

## 2. Backend API Reference

### 2.1 Email Endpoints (`/api/v1/emails`)

| Method | Endpoint | Description |
|--------|----------|-------------|

| `GET` | `/emails` | List emails with pagination & filters |
| `GET` | `/emails/:id` | Get single email by ID |
| `GET` | `/emails/search` | Search emails (limit: 100) |
| `GET` | `/emails/stats` | Get email statistics |
| `GET` | `/emails/conversations` | Get threaded conversations |
| `GET` | `/emails/thread/:threadId` | Get all emails in thread |
| `POST` | `/emails/send` | Send new email (rate limited: 10/min) |
| `POST` | `/emails/:id/reply` | Reply to email (rate limited) |
| `POST` | `/emails/:id/forward` | Forward email (rate limited) |
| `PATCH` | `/emails/:id` | Update email flags (read/starred/flagged) |
| `DELETE` | `/emails/:id` | Delete email |

#### Bulk Operations

| Method | Endpoint | Description |
|--------|----------|-------------|

| `DELETE` | `/emails/bulk` | Bulk delete emails |
| `PATCH` | `/emails/bulk/read` | Bulk mark read/unread |
| `PATCH` | `/emails/bulk/star` | Bulk star/unstar |
| `PATCH` | `/emails/bulk/flag` | Bulk flag/unflag (important) |
| `PATCH` | `/emails/bulk/move` | Bulk move to folder |
| `PATCH` | `/emails/bulk/labels/add` | Bulk add labels |
| `PATCH` | `/emails/bulk/labels/remove` | Bulk remove labels |

#### Draft Operations

| Method | Endpoint | Description |
|--------|----------|-------------|

| `POST` | `/emails/drafts` | Create/update draft (autosave) |
| `GET` | `/emails/drafts/:id` | Get draft by ID |
| `DELETE` | `/emails/drafts/:id` | Delete draft |

#### Calendar Invite Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/emails/:id/calendar-invite` | Get parsed calendar data |
| `POST` | `/emails/:id/calendar-invite/respond` | Accept/decline/tentative |
| `POST` | `/emails/calendar-invite/send` | Send meeting invitation |
| `POST` | `/emails/calendar-invite/:eventId/cancel` | Cancel meeting |

#### Attachments
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/emails/:emailId/attachments/:attachmentId/download` | Download attachment |
| `GET` | `/email/attachments/:id/download` | Stream download |
| `GET` | `/email/attachments/:id/metadata` | Get metadata without download |

### 2.2 Folder Endpoints (`/api/v1/folders`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/folders` | Get all folders for tenant |
| `GET` | `/folders/provider/:providerId` | Get folders for provider |
| `POST` | `/folders` | Create new folder |
| `PATCH` | `/folders/:folderId` | Rename folder |
| `DELETE` | `/folders/:folderId` | Delete folder |
| `POST` | `/folders/sync/:providerId` | Sync folders for provider |
| `POST` | `/folders/sync-all` | Sync all providers |
| `POST` | `/folders/update-counts/:providerId` | Update folder counts |

### 2.3 Label Endpoints (`/api/v1/labels`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/labels` | List all user labels |
| `GET` | `/labels/:id` | Get label by ID |
| `POST` | `/labels` | Create label |
| `PUT` | `/labels/:id` | Update label |
| `DELETE` | `/labels/:id` | Delete label |
| `POST` | `/labels/:id/emails` | Add emails to label |
| `DELETE` | `/labels/:id/emails/:emailId` | Remove email from label |
| `GET` | `/labels/:id/emails` | Get emails by label |
| `POST` | `/labels/reorder` | Reorder labels |

### 2.4 AI Endpoints (`/api/v1/ai`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/ai/chat` | Chat completion (Mistral) |
| `POST` | `/ai/compose` | AI-assisted email composition |
| `POST` | `/ai/summarize/:emailId` | Summarize email |
| `POST` | `/ai/smart-reply/:emailId` | Generate smart replies |
| `POST` | `/ai/categorize/:emailId` | Suggest labels |
| `POST` | `/ai/sentiment/:emailId` | Analyze sentiment |
| `POST` | `/ai/priority/:emailId` | Calculate priority |
| `POST` | `/ai/analyze/:emailId` | Comprehensive analysis |
| `POST` | `/ai/memory/search` | Search knowledge base (RAG) |

### 2.5 VoltAgent Endpoints (`/api/v1/voltagent`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/voltagent/chat` | Agentic chat with tools |
| `GET` | `/voltagent/sessions` | List sessions |
| `POST` | `/voltagent/sessions` | Create session |
| `DELETE` | `/voltagent/sessions/:id` | Delete session |
| `GET` | `/voltagent/briefing` | Daily briefing |
| `GET` | `/voltagent/deadlines` | List deadlines |
| `GET` | `/voltagent/follow-ups` | List follow-ups |
| `GET` | `/voltagent/action-items` | List action items |

### 2.6 Email Sync Endpoints (`/api/v1/email-sync`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/email-sync/status` | Sync system status |
| `GET` | `/email-sync/health` | Health summary |
| `GET` | `/email-sync/queues` | Queue status |
| `POST` | `/email-sync/sync/:providerId` | Manual sync trigger |
| `POST` | `/email-sync/sync-all` | Full sync all providers |
| `GET` | `/email-sync/alerts` | Get active alerts |

### 2.7 Query Parameters (Email List)

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 50, max: 1000) |
| `providerId` | string | Filter by provider |
| `folder` | string | Filter by folder path |
| `specialUse` | string | RFC 6154: INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE |
| `isRead` | boolean | Filter by read status |
| `isImportant` | boolean | **CONSOLIDATED**: Filter important emails (starred OR flagged) |
| `hasAttachments` | boolean | Filter emails with attachments |
| `search` | string | Search in subject, from, body |
| `labelIds` | string | Comma-separated label IDs |
| `startDate` | string | Filter from date (ISO 8601) |
| `endDate` | string | Filter to date (ISO 8601) |
| `excludeTrashSpam` | boolean | Exclude TRASH/SPAM folders |

---

## 3. Technology Stack

### Already Installed in `package.json`

| Library | Version | Purpose |
|---------|---------|---------|
| `@tanstack/react-query` | ^5.90.12 | Server state management |
| `@tanstack/react-virtual` | ^3.13.13 | Virtual list rendering (60FPS) |
| `@dnd-kit/core` | ^6.3.1 | Drag and drop |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable lists |
| `@tiptap/react` | ^3.14.0 | Rich text editor |
| `@tiptap/starter-kit` | ^3.14.0 | Basic editor features |
| `zustand` | ^5.0.9 | UI state management |
| `socket.io-client` | ^4.8.3 | Real-time WebSocket |
| `react-resizable-panels` | ^2.1.9 | Resizable layout panels |
| `lucide-react` | ^0.562.0 | Icons |
| `@mui/material` | ^7.3.6 | UI components |

### Do NOT Install (Already Have)
- ❌ `react-beautiful-dnd` → Use `@dnd-kit` (newer, maintained)
- ❌ `react-virtualized` → Use `@tanstack/react-virtual`
- ❌ `slate` → Use `tiptap` (better docs)
- ❌ `redux` → Use `zustand` + TanStack Query

---

## 4. Complete Feature List

### 4.1 Core Email Operations

| Feature | Priority | Backend Ready | Notes |
|---------|----------|---------------|-------|
| List emails with pagination | P0 | ✅ | Use infinite scroll |
| View email content | P0 | ✅ | HTML sanitized |
| Send new email | P0 | ✅ | Rate limited 10/min |
| Reply to email | P0 | ✅ | Threading preserved |
| Forward email | P0 | ✅ | Attachments included |
| Delete email | P0 | ✅ | Soft delete |
| Mark read/unread | P0 | ✅ | Bulk supported |
| Mark as important | P0 | ✅ | **CONSOLIDATED** star+flag into single "important" toggle |
| Move to folder | P0 | ✅ | Bulk supported |
| Search emails | P0 | ✅ | Full-text search |

### 4.2 Thread & Conversation

| Feature | Priority | Backend Ready | Notes |
|---------|----------|---------------|-------|
| Thread view | P0 | ✅ | Grouped by threadId |
| Expand/collapse thread | P1 | ✅ | Conversation view |
| Thread count badge | P1 | ✅ | Show message count |
| Navigate within thread | P1 | N/A | Frontend only |

### 4.3 Folder Management

| Feature | Priority | Backend Ready | Notes |
|---------|----------|---------------|-------|
| List folders | P0 | ✅ | With counts |
| Aggregate folders | P0 | ✅ | specialUse parameter |
| Create folder | P1 | ✅ | Async job queue |
| Rename folder | P1 | ✅ | Async job queue |
| Delete folder | P1 | ✅ | System folders protected |
| Drag to folder | P2 | ✅ | Use @dnd-kit |

### 4.4 Label Management

| Feature | Priority | Backend Ready | Notes |
|---------|----------|---------------|-------|
| List labels | P0 | ✅ | With colors |
| Apply label | P0 | ✅ | Bulk supported |
| Remove label | P0 | ✅ | Bulk supported |
| Create label | P1 | ✅ | With color picker |
| Edit label | P1 | ✅ | Name + color |
| Delete label | P1 | ✅ | Preserves emails |
| Reorder labels | P2 | ✅ | Drag and drop |

### 4.5 Draft & Compose

| Feature | Priority | Backend Ready | Notes |
|---------|----------|---------------|-------|
| Compose new email | P0 | ✅ | Rich text editor |
| Autosave draft | P0 | ✅ | Debounced save |
| Load draft | P0 | ✅ | Edit existing |
| Delete draft | P0 | ✅ | Cleanup |
| To/CC/BCC fields | P0 | ✅ | Multi-recipient |
| Attachment upload | P1 | ✅ | Base64 encoding |
| Drag-drop attachments | P2 | ✅ | File handling |

### 4.6 AI Features

| Feature | Priority | Backend Ready | Notes |
|---------|----------|---------------|-------|
| AI summarize email | P1 | ✅ | `/ai/summarize/:id` |
| Smart reply suggestions | P1 | ✅ | `/ai/smart-reply/:id` |
| AI compose email | P1 | ✅ | `/ai/compose` |
| Sentiment analysis | P2 | ✅ | `/ai/sentiment/:id` |
| Priority calculation | P2 | ✅ | `/ai/priority/:id` |
| Label suggestions | P2 | ✅ | `/ai/categorize/:id` |
| Full analysis | P2 | ✅ | `/ai/analyze/:id` |
| Daily briefing | P2 | ✅ | `/voltagent/briefing` |

### 4.7 Calendar Integration

| Feature | Priority | Backend Ready | Notes |
|---------|----------|---------------|-------|
| View calendar invite | P1 | ✅ | Parse ICS data |
| Accept/decline/tentative | P1 | ✅ | Creates calendar event |
| Send meeting invite | P2 | ✅ | ICS attachment |
| Cancel meeting | P2 | ✅ | Sends cancellation |

### 4.8 Advanced UX Features

| Feature | Priority | Backend Ready | Implementation |
|---------|----------|---------------|----------------|
| Keyboard shortcuts | P1 | N/A | `j/k` navigation, `e` archive |
| Split inbox (VIP) | P2 | ✅ | Filter by importance |
| Snooze email | P2 | ❌ | Client-side scheduling |
| Undo send | P1 | N/A | Client-side delay (30s) |
| Read receipts | P3 | ❌ | Not implemented |
| Email templates | P2 | N/A | Store in localStorage |
| Multiple signatures | P3 | N/A | User settings |

### 4.9 Bulk Operations

| Feature | Priority | Backend Ready | Notes |
|---------|----------|---------------|-------|
| Select multiple | P0 | ✅ | Checkbox selection |
| Select all (page) | P1 | ✅ | Header checkbox |
| Select all (folder) | P2 | ✅ | "Select all X emails" |
| Bulk delete | P0 | ✅ | `/emails/bulk` |
| Bulk archive | P0 | ✅ | Move to Archive |
| Bulk read/unread | P0 | ✅ | `/emails/bulk/read` |
| Bulk important | P0 | ✅ | **CONSOLIDATED** `/emails/bulk/flag` (star+flag = important) |
| Bulk move | P1 | ✅ | `/emails/bulk/move` |
| Bulk label | P1 | ✅ | `/emails/bulk/labels/add` |

### 4.10 Real-time Updates

| Feature | Priority | Backend Ready | Notes |
|---------|----------|---------------|-------|
| New email notification | P1 | ✅ | WebSocket `email:new` |
| Read status sync | P1 | ✅ | WebSocket `email:updated` |
| Folder count update | P1 | ✅ | WebSocket `folder:updated` |
| Sync status indicator | P2 | ✅ | WebSocket `sync:*` events |

### 4.11 Search & Filters

| Feature | Priority | Backend Ready | Notes |
|---------|----------|---------------|-------|
| Basic search | P0 | ✅ | `/emails/search` |
| Search by sender | P1 | ✅ | `from:` parameter |
| Search by date range | P1 | ✅ | `startDate/endDate` |
| Search with attachments | P1 | ✅ | `hasAttachments` |
| Advanced search UI | P2 | N/A | Build search form |
| Saved searches | P3 | N/A | Store in localStorage |

---

## 5. UI/UX Design Patterns

### 5.1 Layout Structure (Superhuman-inspired)

```
┌─────────────────────────────────────────────────────────────┐
│ Header (fixed, 56px)                                        │
├──────────┬─────────────────────────┬────────────────────────┤
│ Sidebar  │     Thread List         │    Email View          │
│ (240px)  │     (380px)             │    (flex: 1)           │
│          │                         │                        │
│ Folders  │  ☐ Sender      12:34pm │  From: Sender          │
│ ├ Inbox  │     Subject line        │  To: Me                │
│ ├ Sent   │  ☐ Sender      11:22am │  Subject: Re: Topic    │
│ ├ Drafts │     Subject line        │                        │
│ └ Trash  │  ☐ Sender      10:15am │  <Email Content>       │
│          │     Subject line        │                        │
│ Labels   │                         │                        │
│ ├ Work   │                         │  [Reply] [Forward]     │
│ └ Personal                         │                        │
├──────────┴─────────────────────────┴────────────────────────┤
│ Status Bar (optional, 24px)                                 │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Thread List Item (2-line design)

```tsx
// Clean 2-line layout (no snippet)
<Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', py: 1.5, px: 2 }}>
  {/* Checkbox - visible on hover/selection */}
  <Fade in={isHovered || isSelected}>
    <Checkbox size="small" />
  </Fade>

  {/* Avatar */}
  <Avatar sx={{ width: 28, height: 28 }}>{initials}</Avatar>

  {/* Content */}
  <Box sx={{ flex: 1, minWidth: 0 }}>
    {/* Line 1: Sender + indicators + date */}
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Typography sx={{ fontWeight: isUnread ? 600 : 400 }}>{sender}</Typography>
      {isStarred && <Star size={14} fill="#FFB300" />}
      {hasAttachments && <Paperclip size={14} />}
      {threadCount > 1 && <Chip label={threadCount} size="small" />}
      <Typography variant="caption" sx={{ ml: 'auto' }}>{date}</Typography>
    </Box>

    {/* Line 2: Subject only */}
    <Typography
      noWrap
      color="text.secondary"
      sx={{ fontWeight: isUnread ? 500 : 400 }}
    >
      {subject}
    </Typography>
  </Box>
</Box>
```

### 5.3 Keyboard Shortcuts

| Key | Action | Scope |
|-----|--------|-------|
| `j` | Next email | List view |
| `k` | Previous email | List view |
| `Enter` | Open email | List view |
| `Escape` | Close/deselect | Global |
| `e` | Archive | Email view |
| `#` | Delete | Email view |
| `r` | Reply | Email view |
| `f` | Forward | Email view |
| `c` | Compose | Global |
| `/` | Search | Global |
| `x` | Toggle selection | List view |
| `s` | Toggle star | Email view |
| `!` | Toggle important | Email view |
| `u` | Mark unread | Email view |

### 5.4 Optimistic Updates Pattern

```tsx
// From Zero-staging example
const useOptimisticAction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ emailId, action }) => {
      return api.updateEmail(emailId, action);
    },
    onMutate: async ({ emailId, action }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['emails'] });

      // Snapshot previous value
      const previousEmails = queryClient.getQueryData(['emails']);

      // Optimistically update
      queryClient.setQueryData(['emails'], (old) =>
        old.map(email =>
          email.id === emailId ? { ...email, ...action } : email
        )
      );

      // Show toast with undo
      toast.success('Email updated', {
        action: {
          label: 'Undo',
          onClick: () => {
            queryClient.setQueryData(['emails'], previousEmails);
          }
        }
      });

      return { previousEmails };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(['emails'], context.previousEmails);
      toast.error('Failed to update email');
    }
  });
};
```

### 5.5 Virtual List Implementation

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function EmailList({ emails }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: emails.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // Row height
    overscan: 10, // Render extra items for smooth scrolling
  });

  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: virtualRow.size,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <EmailListItem email={emails[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 6. Implementation Phases

### Phase 1: Foundation (Critical Path)
**Goal**: Minimum viable email client

| Task | Component | Dependencies |
|------|-----------|--------------|
| 1.1 | Create email API module | None |
| 1.2 | Create TanStack Query hooks | 1.1 |
| 1.3 | Create email list component | 1.2 |
| 1.4 | Create email view component | 1.2 |
| 1.5 | Create compose modal | 1.1 |
| 1.6 | Integrate with layout | 1.3, 1.4 |

**Validation**:
- [ ] Can list emails with pagination
- [ ] Can view email content
- [ ] Can send new email
- [ ] Can reply/forward

### Phase 2: Folder & Navigation
**Goal**: Full folder system

| Task | Component | Dependencies |
|------|-----------|--------------|
| 2.1 | Folder sidebar component | Phase 1 |
| 2.2 | Folder counts display | 2.1 |
| 2.3 | Special-use folder aggregation | 2.1 |
| 2.4 | Folder sync integration | 2.1 |
| 2.5 | Create/rename/delete folder | 2.1 |

**Validation**:
- [ ] Can navigate between folders
- [ ] Folder counts update correctly
- [ ] Can create new folders
- [ ] Aggregate folders work (All Inbox, All Sent)

### Phase 3: Actions & Bulk Operations
**Goal**: Email management

| Task | Component | Dependencies |
|------|-----------|--------------|
| 3.1 | Thread toolbar component | Phase 2 |
| 3.2 | Selection state management | 3.1 |
| 3.3 | Bulk operations UI | 3.2 |
| 3.4 | Optimistic updates | 3.3 |
| 3.5 | Undo toast notifications | 3.4 |

**Validation**:
- [ ] Can select multiple emails
- [ ] Bulk delete works
- [ ] Bulk move works
- [ ] Undo functionality works

### Phase 4: Labels & Organization ✅ COMPLETE
**Goal**: Custom organization

| Task | Component | Dependencies | Status |
|------|-----------|--------------|--------|
| 4.1 | Label sidebar section | Phase 3 | ✅ |
| 4.2 | Label CRUD operations | 4.1 | ✅ |
| 4.3 | Apply/remove labels | 4.2 | ✅ |
| 4.4 | Label color picker | 4.2 | ✅ |
| 4.5 | Single email labels | 4.2 | ✅ |
| 4.6 | Label filter in list | 4.1 | ✅ |

**Validation**:
- [x] Can create labels with colors
- [x] Can apply labels to emails (bulk + single)
- [x] Can remove labels from emails
- [x] Can filter by label in sidebar
- [x] Label chips display in email list

### Phase 5: Compose & Draft
**Goal**: Full email composition

| Task | Component | Dependencies |
|------|-----------|--------------|
| 5.1 | Tiptap editor integration | Phase 4 |
| 5.2 | Draft autosave (debounced) | 5.1 |
| 5.3 | Attachment upload | 5.1 |
| 5.4 | Recipient autocomplete | 5.1 |
| 5.5 | CC/BCC toggle | 5.1 |

**Validation**:
- [ ] Rich text editing works
- [ ] Drafts autosave
- [ ] Attachments upload
- [ ] Can send with multiple recipients

### Phase 6: Search & Filters
**Goal**: Find emails quickly

| Task | Component | Dependencies |
|------|-----------|--------------|
| 6.1 | Search bar component | Phase 5 |
| 6.2 | Search results view | 6.1 |
| 6.3 | Advanced filters panel | 6.2 |
| 6.4 | Date range picker | 6.3 |
| 6.5 | Search highlight | 6.2 |

**Validation**:
- [ ] Basic search works
- [ ] Filter by date range
- [ ] Filter by attachment
- [ ] Search results display correctly

### Phase 7: Real-time & Notifications
**Goal**: Live updates

| Task | Component | Dependencies |
|------|-----------|--------------|
| 7.1 | WebSocket connection | Phase 6 |
| 7.2 | New email notification | 7.1 |
| 7.3 | Sync status indicator | 7.1 |
| 7.4 | Folder count updates | 7.1 |
| 7.5 | Connection recovery | 7.1 |

**Validation**:
- [ ] New emails appear automatically
- [ ] Read status syncs
- [ ] Reconnection works

### Phase 8: AI Integration - PARTIAL (~40%)
**Goal**: Intelligent assistance

| Task | Component | Dependencies | Status |
|------|-----------|--------------|--------|
| 8.1 | AI summarize button | Phase 7 | ❌ Missing |
| 8.2 | Smart reply UI | 8.1 | ❌ Missing |
| 8.3 | AI compose modal | 8.1 | ✅ Complete |
| 8.4 | Priority indicator | 8.1 | ❌ Missing |
| 8.5 | Sentiment display | 8.1 | ❌ Missing |

**Completed:**
- `AiComposeMenu.tsx` - AI compose with tone, spelling, expand/shorten
- `AIInlineMenu.tsx` - Inline AI preview with accept/reject/modify
- `useAiCompose.ts` - TanStack Query mutation hook
- `DailyBriefing/index.tsx` - Full briefing component
- `CommandPalette` - AI commands (Shift+S, Shift+R, Cmd+J)
- `QuickActions.tsx` - Dashboard AI quick actions
- Full API layer in `lib/api/ai.ts`

**Missing:**
- Summarize button in ExpandedMessage.tsx
- Smart reply suggestions panel below email
- Priority badge on ThreadListItem
- Sentiment indicator in email view

**Validation**:
- [ ] Can summarize email ← Need UI button
- [x] Smart replies work ← API ready, need UI
- [x] AI compose generates draft ← COMPLETE
- [ ] Priority shows correctly ← Need UI indicator

### Phase 9: Advanced UX - PARTIAL (~20%)
**Goal**: Power user features

| Task | Component | Status | Notes |
|------|-----------|--------|-------|
| 9.1 | Keyboard shortcuts | PARTIAL | C=compose, Cmd+K=palette, NO j/k navigation |
| 9.2 | Undo send (30s delay) | MISSING | ScheduleSendDialog exists but no undo |
| 9.3 | Email templates | MISSING | Only AI draft templates in AiComposeMenu |
| 9.4 | Split inbox (VIP) | MISSING | senderImportance API param exists, no UI |
| 9.5 | Thread collapse/expand | ✅ COMPLETE | ThreadView with expandedIds + virtual scroll |

**Completed Components:**
- `ThreadView.tsx` - Expand/collapse all, individual message toggle
- `CollapsedMessage.tsx` - Single-line preview with click to expand
- `ExpandedMessage.tsx` - Full message view with actions
- `useThreadVirtualizer.ts` - Virtual scrolling for large threads
- `email.tsx` - 'C' key shortcut for compose
- `CommandPalette.tsx` - Cmd+K with Shift+S (search), Shift+R (settings)

**Validation**:
- [ ] j/k navigation works - NOT IMPLEMENTED
- [ ] Undo send cancels - NOT IMPLEMENTED
- [ ] Templates insert - NOT IMPLEMENTED
- [ ] VIP split works - NOT IMPLEMENTED
- [x] Thread collapse/expand works

### Phase 10: Performance & Polish - PARTIAL (~70%)

**Goal**: Production ready

| Task | Component | Status | Notes |
|------|-----------|--------|-------|
| 10.1 | Virtual list optimization | ✅ COMPLETE | @tanstack/react-virtual in ThreadList |
| 10.2 | Query caching strategy | ✅ COMPLETE | staleTime/gcTime in 13 query hooks |
| 10.3 | Loading skeletons | PARTIAL | FolderSidebar, LabelsSidebar have them |
| 10.4 | Error boundaries | ✅ COMPLETE | ErrorBoundary, PageErrorBoundary, SectionErrorBoundary |
| 10.5 | E2E tests | MISSING | No .e2e.ts files in frontend |

**Completed Components:**

- `ThreadList.tsx` - Virtual scrolling with @tanstack/react-virtual (60 FPS)
- `hooks/queries/*.ts` - 13 query hooks with staleTime/gcTime caching
- `ErrorBoundary.tsx` - Full error boundary with retry + home buttons
- `PageErrorBoundary` - Wrapper for page-level errors
- `SectionErrorBoundary` - Compact fallback for widget errors

**Validation**:

- [x] 60FPS scrolling with 1000+ emails - ThreadList uses virtual scroll
- [x] Instant navigation - Query caching configured
- [ ] No flash of loading - Need skeletons in email list
- [ ] All E2E tests pass - No E2E tests exist

---

## 7. File Structure

```
frontend/
├── components/
│   └── email/
│       ├── layout/
│       │   ├── EmailLayout.tsx        # Main 3-panel layout
│       │   ├── FolderSidebar.tsx      # Left sidebar
│       │   └── ThreadToolbar.tsx      # Action toolbar
│       │
│       ├── list/
│       │   ├── ThreadList.tsx         # Virtual list container
│       │   ├── ThreadListItem.tsx     # Single email row
│       │   ├── ThreadListHeader.tsx   # Select all, sort
│       │   └── EmptyState.tsx         # No emails view
│       │
│       ├── view/
│       │   ├── EmailView.tsx          # Email content display
│       │   ├── EmailHeader.tsx        # From, to, subject
│       │   ├── EmailBody.tsx          # HTML content
│       │   ├── EmailAttachments.tsx   # Attachment list
│       │   └── ThreadView.tsx         # Conversation view
│       │
│       ├── compose/
│       │   ├── ComposeModal.tsx       # Compose dialog
│       │   ├── ComposeEditor.tsx      # Tiptap editor
│       │   ├── RecipientInput.tsx     # To/CC/BCC input
│       │   └── AttachmentUpload.tsx   # File upload
│       │
│       ├── ai/
│       │   ├── AISummarize.tsx        # Summary button
│       │   ├── SmartReplies.tsx       # Reply suggestions
│       │   ├── AIComposeModal.tsx     # AI compose
│       │   └── PriorityBadge.tsx      # Priority indicator
│       │
│       └── shared/
│           ├── EmailAvatar.tsx        # Sender avatar
│           ├── StarButton.tsx         # Star toggle
│           ├── LabelChip.tsx          # Label display
│           └── DateDisplay.tsx        # Relative date
│
├── hooks/
│   └── queries/
│       ├── email-keys.ts              # Query key factory
│       ├── use-emails.ts              # Email list queries
│       ├── use-email.ts               # Single email query
│       ├── use-email-mutations.ts     # Send, update, delete
│       ├── use-folders.ts             # Folder queries
│       ├── use-labels.ts              # Label queries
│       └── index.ts                   # Export all
│
├── lib/
│   └── api/
│       └── emails.ts                  # Email API module
│
├── stores/
│   ├── email-ui-store.ts              # UI state (selection, view)
│   ├── compose-store.ts               # Compose state
│   └── search-store.ts                # Search state
│
└── locales/
    ├── en.ts                          # English strings
    └── it.ts                          # Italian strings
```

---

## 8. Validation Checklist

### Before Starting Each Phase

- [ ] All previous phase validations pass
- [ ] API endpoints documented and tested
- [ ] Types defined for all data structures
- [ ] Translations added for new strings
- [ ] Loading states designed

### After Completing Each Phase

- [ ] All features work in development
- [ ] TypeScript compiles without errors
- [ ] ESLint passes without warnings
- [ ] Manual testing completed
- [ ] Code reviewed for patterns compliance

### Production Readiness

- [ ] All 10 phases completed
- [ ] Performance benchmarks met
- [ ] E2E tests pass
- [ ] Accessibility audit passed
- [ ] Mobile responsive

---

## 9. Known Issues & Solutions

### MUI Dialog with TextField Label Overlap (December 30, 2025)

**Problem**: TextField label appears outside/above input field instead of floating properly.

**Root Cause**:
- MUI automatically removes DialogContent's top padding when DialogTitle is present
- CSS rule: `.MuiDialogTitle-root+.MuiDialogContent-root { padding-top: 0; }`
- TextField label needs space to float at top edge of input

**Solution**:
```typescript
// FormDialog.tsx
<DialogContent dividers sx={{ pt: 3 }}>{children}</DialogContent>

// FolderDialog.tsx
<TextField
  slotProps={{ inputLabel: { shrink: true } }}
  sx={{ mt: 1 }}
/>
```

**References**:
- [TextField label overlap issue](https://github.com/mui/material-ui/issues/46049)
- [DialogContent padding with DialogTitle](https://github.com/mui/material-ui/issues/27851)
- [TextField in DialogContent label cutoff](https://github.com/mui/material-ui/issues/14777)

### Gmail Custom Folders Display Fix (December 30, 2025)

**Problem**: Custom Gmail labels showed "Label_64" instead of actual names like "Pippo".

**Root Cause**:
- Backend stored invalid `specialUse` values for custom folders
- Frontend prioritized `specialUse` over `folder.name` for display

**Solution**:
```typescript
// backend/src/modules/email-sync/workers/folder-operations.worker.ts
import { isSystemFolder } from '../drivers/interfaces/canonical.types';

const folderType = createdFolder.type && createdFolder.type !== 'Custom' ? createdFolder.type : null;
const specialUse = folderType && isSystemFolder(folderType) ? folderType : null;
const isSystem = !!specialUse;

// frontend/components/email/folders/folder-utils.ts
export function getFolderDisplayName(
  folder: FolderType,
  getFolderLabel: (label: string) => string
): string {
  return folder.isSystem && folder.specialUse
    ? getFolderLabel(folder.specialUse)
    : folder.name;
}
```

---

## 10. Additional Features (Outside Email Scope)

### ✅ Avatar Editor - COMPLETE (January 20, 2026)

**Feature**: Modern profile picture editor with two modes:
1. **Upload & Crop** - react-avatar-editor with zoom/rotate controls
2. **Predefined Avatars** - DiceBear API with 10 styles (Avataaars, Robots, Pixel Art, etc.)

**Files Created/Modified**:
- `components/settings/AvatarEditorDialog.tsx` (NEW)
- `components/settings/AccountSettings.tsx`
- `components/dashboard/Settings.tsx`
- `components/layout/Header.tsx`
- `locales/en.ts`, `locales/it.ts`, `locales/index.ts`

**Technical Notes**:
- UTF-8 safe base64: `btoa(unescape(encodeURIComponent(svgText)))`
- Cross-component sync via Zustand auth store (`setUser()`)
- MUI Grid v7 syntax: `size={{ xs: 4, sm: 3 }}`

**DiceBear Styles**: avataaars, bottts, pixel-art, identicon, initials, lorelei, notionists, open-peeps, thumbs, fun-emoji

---

## Sources & References

### Email UX Patterns
- [Superhuman Mail Features](https://superhuman.com/products/mail)
- [Gmail Search Operators](https://support.google.com/mail/answer/7190)
- [Split Inbox Basics](https://help.superhuman.com/hc/en-us/articles/38449611367187)

### AI Email Features
- [Best AI Email Assistants 2025](https://zapier.com/blog/best-ai-email-assistant/)
- [Shortwave AI Features](https://www.shortwave.com/)
- [Gemini AI for Gmail](https://emailsorters.com/blog/gemini-ai-for-gmail/)

### Technical Implementation
- [@tanstack/react-virtual](https://tanstack.com/virtual/latest)
- [@dnd-kit Documentation](https://dndkit.com/)
- [Tiptap Editor](https://tiptap.dev/)
- [PWA Background Sync](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)

### Design Inspiration
- [Zero Mail Client](https://github.com/LUK3D/mail-client)
- [Inbox Zero](https://github.com/elie222/inbox-zero)
- [shadcn/ui](https://ui.shadcn.com/)
