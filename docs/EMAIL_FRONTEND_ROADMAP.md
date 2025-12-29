# Email Frontend Rebuild - Comprehensive Roadmap

> **IMPORTANT**: This is the 5th rebuild. Follow this roadmap exactly. No shortcuts.

## Audit Summary

### Backend Capabilities (Production Ready)

The backend provides comprehensive email functionality:

#### Email Endpoints (emails.controller.ts)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/emails` | GET | List emails with filters (folder, provider, read/unread, starred, labels, search, date range) |
| `/emails/conversations` | GET | List threaded conversations |
| `/emails/thread/:id` | GET | Get single thread with all messages |
| `/emails/:id` | GET | Get single email |
| `/emails/send` | POST | Send new email |
| `/emails/:id/reply` | POST | Reply to email |
| `/emails/:id/reply-all` | POST | Reply all |
| `/emails/:id/forward` | POST | Forward email |
| `/emails/bulk/read` | PATCH | Mark multiple as read (max 500) |
| `/emails/bulk/unread` | PATCH | Mark multiple as unread |
| `/emails/bulk/star` | PATCH | Star multiple emails |
| `/emails/bulk/unstar` | PATCH | Unstar multiple |
| `/emails/bulk/move` | PATCH | Move to folder |
| `/emails/bulk/delete` | DELETE | Soft delete |
| `/emails/bulk/add-labels` | PATCH | Add labels |
| `/emails/bulk/remove-labels` | PATCH | Remove labels |

#### Filter Parameters (EmailListParams)
```typescript
interface EmailListParams {
  page?: number;
  limit?: number;
  providerId?: string;
  folder?: string;
  specialUse?: string;       // RFC 6154: INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE
  isRead?: boolean;
  isStarred?: boolean;
  isFlagged?: boolean;
  isImportant?: boolean;
  hasAttachments?: boolean;
  search?: string;
  labelIds?: string[];
  startDate?: string;
  endDate?: string;
  excludeTrashSpam?: boolean;
}
```

#### Real-time Events (WebSocket)
| Event | Payload | Description |
|-------|---------|-------------|
| `email:new` | EmailEventPayload | New email received |
| `email:update` | EmailEventPayload | Email updated (read, starred, labels) |
| `email:delete` | EmailEventPayload | Email deleted |
| `email:thread_update` | ThreadUpdatePayload | Thread updated |
| `email:unread_count_update` | {folder, count, providerId} | Unread count changed |
| `email:folder_counts_update` | {folderId, totalCount, unreadCount} | Folder counts changed |
| `sync:status` | {status, progress, error} | Sync progress |

### Existing Frontend Patterns

#### API Module Pattern (lib/api/*.ts)
```typescript
// Example: contactsApi pattern to follow
export const emailsApi = {
  async listEmails(params: EmailListParams): Promise<EmailListResponse> {
    const response = await apiClient.get('/emails', { params });
    return response.data;
  },
  // ... more methods
};
```

#### TanStack Query Pattern (hooks/queries/use-*.ts)
```typescript
// Query keys factory
export const emailsKeys = {
  all: ['emails'] as const,
  lists: () => [...emailsKeys.all, 'list'] as const,
  list: (params?: EmailListParams) => [...emailsKeys.lists(), params ?? {}] as const,
  details: () => [...emailsKeys.all, 'detail'] as const,
  detail: (id: string) => [...emailsKeys.details(), id] as const,
  threads: () => [...emailsKeys.all, 'threads'] as const,
  thread: (id: string) => [...emailsKeys.threads(), id] as const,
};

// Query options (reusable)
export function emailsListOptions(params?: EmailListParams) {
  return queryOptions({
    queryKey: emailsKeys.list(params),
    queryFn: async () => emailsApi.listEmails(params),
    staleTime: 60 * 1000,      // 1 minute fresh
    gcTime: 10 * 60 * 1000,    // 10 minutes in cache
  });
}

// Hook
export function useEmails(params?: EmailListParams) {
  return useQuery(emailsListOptions(params));
}

// Mutation with optimistic update
export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => emailsApi.bulkMarkRead(ids),
    onMutate: async (ids) => {
      // Cancel ongoing queries
      await queryClient.cancelQueries({ queryKey: emailsKeys.lists() });
      // Snapshot previous value
      const previousEmails = queryClient.getQueryData(emailsKeys.list());
      // Optimistically update
      queryClient.setQueryData(emailsKeys.list(), (old) => /* update */);
      return { previousEmails };
    },
    onError: (err, ids, context) => {
      // Rollback on error
      queryClient.setQueryData(emailsKeys.list(), context?.previousEmails);
    },
    onSettled: () => {
      // Invalidate to refetch
      queryClient.invalidateQueries({ queryKey: emailsKeys.lists() });
    },
  });
}
```

#### Zustand Store Pattern (stores/*.ts)
```typescript
// For UI-only state (not server data)
interface EmailUIState {
  selectedIds: string[];
  focusedId: string | null;
  viewMode: 'list' | 'split' | 'conversation';

  // Actions
  selectEmail: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  setFocusedId: (id: string | null) => void;
  setViewMode: (mode: 'list' | 'split' | 'conversation') => void;
}

export const useEmailUIStore = create<EmailUIState>((set) => ({
  selectedIds: [],
  focusedId: null,
  viewMode: 'list',

  selectEmail: (id) => set({ selectedIds: [id] }),
  toggleSelection: (id) => set((s) => ({
    selectedIds: s.selectedIds.includes(id)
      ? s.selectedIds.filter(i => i !== id)
      : [...s.selectedIds, id]
  })),
  clearSelection: () => set({ selectedIds: [] }),
  setFocusedId: (id) => set({ focusedId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
}));
```

### Zero Example Patterns (To Adopt)

#### 1. Infinite Scroll with useInfiniteQuery
```typescript
const threadsQuery = useInfiniteQuery({
  queryKey: ['threads', folder, search],
  queryFn: ({ pageParam }) => fetchThreads({ cursor: pageParam, folder, search }),
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  staleTime: 60 * 1000,
});

const threads = useMemo(() =>
  threadsQuery.data?.pages.flatMap(p => p.threads) ?? [],
  [threadsQuery.data]
);
```

#### 2. Optimistic Actions with Undo
```typescript
// Key pattern: delay API call, allow undo during toast duration
function optimisticMarkAsRead(ids: string[]) {
  // 1. Immediately update UI
  addOptimisticAction({ type: 'READ', ids, read: true });

  // 2. Show toast with undo button
  toast('Marked as read', {
    action: { label: 'Undo', onClick: () => removeOptimisticAction(id) },
    onAutoClose: () => executeApiCall(),  // Only call API after toast closes
  });
}
```

#### 3. Keyboard Navigation (j/k, arrows)
```typescript
useHotkeys('j', () => moveFocus('down'));
useHotkeys('k', () => moveFocus('up'));
useHotkeys('ArrowDown', () => moveFocus('down'));
useHotkeys('ArrowUp', () => moveFocus('up'));
useHotkeys('Enter', () => openSelected());
useHotkeys('Escape', () => clearSelection());
```

#### 4. Virtual List for Performance
```typescript
// Use react-virtualized or @tanstack/react-virtual
<VirtualList
  items={threads}
  itemHeight={56}
  renderItem={(thread, index) => (
    <ThreadListItem
      thread={thread}
      focused={focusedIndex === index}
    />
  )}
/>
```

---

## Implementation Phases

### Phase 1: Foundation (API + Types + Hooks)

**Goal**: Create the data layer without any UI components.

#### Step 1.1: Email API Module
Create `frontend/lib/api/emails.ts`:
- Types: `Email`, `Thread`, `EmailListParams`, `EmailListResponse`, `ThreadResponse`
- API methods: `listEmails`, `getThread`, `sendEmail`, `replyEmail`, `forwardEmail`
- Bulk methods: `bulkMarkRead`, `bulkMarkUnread`, `bulkStar`, `bulkMove`, `bulkDelete`

#### Step 1.2: Query Keys + Options
Create `frontend/hooks/queries/emails-keys.ts`:
- Query key factory with all combinations
- Reusable queryOptions for each query type

#### Step 1.3: Query Hooks
Create `frontend/hooks/queries/use-emails.ts`:
- `useEmails(params)` - list emails
- `useEmailsInfinite(params)` - infinite scroll list
- `useThread(threadId)` - single thread
- Export from `frontend/hooks/queries/index.ts`

#### Step 1.4: Mutation Hooks
Create `frontend/hooks/queries/use-email-mutations.ts`:
- `useMarkAsRead()` / `useMarkAsUnread()`
- `useToggleStar()`
- `useMoveToFolder()`
- `useDeleteEmails()`
- `useAddLabels()` / `useRemoveLabels()`
- `useSendEmail()` / `useReplyEmail()` / `useForwardEmail()`
- All with optimistic updates

**Validation**:
- Run `npm run type-check` - no errors
- Run `npm run lint` - no errors

---

### Phase 2: UI State Management

**Goal**: Create Zustand store for UI-only state.

#### Step 2.1: Email UI Store
Create `frontend/stores/email-ui-store.ts`:
```typescript
interface EmailUIState {
  // Selection
  selectedIds: string[];
  focusedId: string | null;

  // View state
  viewMode: 'list' | 'split' | 'conversation';
  isComposeOpen: boolean;
  composeMode: 'new' | 'reply' | 'reply-all' | 'forward' | null;
  replyToEmail: Email | null;

  // Actions
  selectEmail(id: string): void;
  toggleSelection(id: string): void;
  selectAll(ids: string[]): void;
  clearSelection(): void;
  setFocusedId(id: string | null): void;
  setViewMode(mode: 'list' | 'split' | 'conversation'): void;
  openCompose(mode: 'new' | 'reply' | 'reply-all' | 'forward', email?: Email): void;
  closeCompose(): void;
}
```

#### Step 2.2: Optimistic State Store
Create `frontend/stores/optimistic-store.ts`:
```typescript
interface OptimisticAction {
  id: string;
  type: 'READ' | 'STAR' | 'MOVE' | 'DELETE' | 'LABEL';
  emailIds: string[];
  payload: Record<string, unknown>;
}

interface OptimisticState {
  actions: OptimisticAction[];
  addAction(action: Omit<OptimisticAction, 'id'>): string;
  removeAction(id: string): void;
  getOptimisticValue<T>(emailId: string, field: keyof Email, original: T): T;
}
```

**Validation**:
- Run `npm run type-check` - no errors
- Run `npm run lint` - no errors

---

### Phase 3: Translations

**Goal**: Add all email-related translations before any UI.

#### Step 3.1: Add to locales/en.ts
```typescript
email: {
  // Folders
  folders: {
    inbox: 'Inbox',
    sent: 'Sent',
    drafts: 'Drafts',
    trash: 'Trash',
    spam: 'Spam',
    archive: 'Archive',
    starred: 'Starred',
    important: 'Important',
    allMail: 'All Mail',
  },

  // Actions
  actions: {
    compose: 'Compose',
    reply: 'Reply',
    replyAll: 'Reply All',
    forward: 'Forward',
    archive: 'Archive',
    delete: 'Delete',
    markAsRead: 'Mark as read',
    markAsUnread: 'Mark as unread',
    star: 'Star',
    unstar: 'Unstar',
    moveToFolder: 'Move to folder',
    addLabel: 'Add label',
    removeLabel: 'Remove label',
  },

  // Messages
  messages: {
    noEmails: 'No emails in this folder',
    loading: 'Loading emails...',
    loadMore: 'Load more',
    markedAsRead: 'Marked as read',
    markedAsUnread: 'Marked as unread',
    movedToTrash: 'Moved to trash',
    archived: 'Archived',
  },

  // Compose
  compose: {
    to: 'To',
    cc: 'Cc',
    bcc: 'Bcc',
    subject: 'Subject',
    body: 'Message',
    send: 'Send',
    discard: 'Discard',
    saveDraft: 'Save draft',
    attachments: 'Attachments',
    addAttachment: 'Add attachment',
  },

  // Thread view
  thread: {
    showQuoted: 'Show quoted text',
    hideQuoted: 'Hide quoted text',
    expandAll: 'Expand all',
    collapseAll: 'Collapse all',
  },
}
```

#### Step 3.2: Add to locales/it.ts
Same structure with Italian translations.

#### Step 3.3: Update locales/index.ts types

**Validation**:
- Run `npm run type-check` - no errors

---

### Phase 4: Core Components (Atoms)

**Goal**: Create small, reusable components.

#### Step 4.1: Email Avatar
`frontend/components/email/atoms/EmailAvatar.tsx`
- 28px avatar with sender initials
- Optional photo support

#### Step 4.2: Email Badge
`frontend/components/email/atoms/EmailBadge.tsx`
- Unread indicator
- Attachment icon
- Thread count badge

#### Step 4.3: Email Checkbox
`frontend/components/email/atoms/EmailCheckbox.tsx`
- Hidden by default, visible on hover
- Controlled by selection state

#### Step 4.4: Email Date
`frontend/components/email/atoms/EmailDate.tsx`
- Smart formatting: "2:30 PM", "Yesterday", "Dec 15"

#### Step 4.5: Thread Count Badge
`frontend/components/email/atoms/ThreadCountBadge.tsx`
- Shows count when > 1 message in thread

**Validation**:
- Run `npm run type-check` - no errors
- Run `npm run lint` - no errors

---

### Phase 5: List Components

**Goal**: Build the email list UI.

#### Step 5.1: ThreadListItem
`frontend/components/email/list/ThreadListItem.tsx`
- Clean 2-line layout (Superhuman-style)
- Line 1: Sender + indicators + date
- Line 2: Subject only (no snippet)
- Hover effects + checkbox reveal
- Props: thread, selected, focused, onSelect, onClick

#### Step 5.2: ThreadList
`frontend/components/email/list/ThreadList.tsx`
- Virtual list for performance
- Keyboard navigation (j/k)
- Infinite scroll
- Empty state
- Loading skeleton

#### Step 5.3: ThreadListToolbar
`frontend/components/email/list/ThreadListToolbar.tsx`
- Select all checkbox
- Bulk actions (archive, delete, mark read)
- Refresh button

#### Step 5.4: EmailListSkeleton
`frontend/components/email/list/EmailListSkeleton.tsx`
- Skeleton loading state

**Validation**:
- Run `npm run type-check` - no errors
- Visual test with Playwright screenshot

---

### Phase 6: Thread/Conversation View

**Goal**: Build email reading experience.

#### Step 6.1: ThreadHeader
`frontend/components/email/thread/ThreadHeader.tsx`
- Subject
- Labels
- Actions (reply, forward, delete)

#### Step 6.2: MessageItem
`frontend/components/email/thread/MessageItem.tsx`
- Sender info + date
- Collapsible body
- Quoted text handling
- Attachments

#### Step 6.3: ThreadView
`frontend/components/email/thread/ThreadView.tsx`
- Header
- Message list (collapsed by default, latest expanded)
- Quick reply box

#### Step 6.4: ThreadActions
`frontend/components/email/thread/ThreadActions.tsx`
- Reply, Reply All, Forward buttons
- More actions menu

**Validation**:
- Run `npm run type-check` - no errors
- Visual test with Playwright screenshot

---

### Phase 7: Compose

**Goal**: Email composition UI.

#### Step 7.1: ComposeDialog
`frontend/components/email/compose/ComposeDialog.tsx`
- Modal dialog for compose
- Full-screen on mobile

#### Step 7.2: ComposeForm
`frontend/components/email/compose/ComposeForm.tsx`
- To, Cc, Bcc fields (autocomplete)
- Subject
- Rich text body
- Attachments

#### Step 7.3: RecipientField
`frontend/components/email/compose/RecipientField.tsx`
- Autocomplete with contacts
- Multiple recipients as chips

#### Step 7.4: AttachmentList
`frontend/components/email/compose/AttachmentList.tsx`
- File preview
- Remove button
- Progress indicator

**Validation**:
- Run `npm run type-check` - no errors
- Test send flow manually

---

### Phase 8: Sidebar + Navigation

**Goal**: Folder navigation.

#### Step 8.1: EmailSidebar
`frontend/components/email/sidebar/EmailSidebar.tsx`
- Smart filters (Unread, Today, This Week)
- Aggregate folders (All Inbox, All Sent)
- Provider folders grouped
- Labels section

#### Step 8.2: FolderItem
`frontend/components/email/sidebar/FolderItem.tsx`
- Icon + label + count
- Active state
- Drag-and-drop target

#### Step 8.3: LabelItem
`frontend/components/email/sidebar/LabelItem.tsx`
- Color dot + label + count
- Context menu (edit, delete)

**Validation**:
- Run `npm run type-check` - no errors
- Visual test with Playwright screenshot

---

### Phase 9: Container + Layout

**Goal**: Main mailbox container.

#### Step 9.1: Mailbox
`frontend/components/dashboard/Mailbox.tsx`
- Combines sidebar + list + thread view
- Responsive layout (mobile/tablet/desktop)
- Split view or full-width

#### Step 9.2: MailboxContent
`frontend/components/dashboard/MailboxContent.tsx`
- List panel
- Thread panel (when selected)
- Resizable divider

**Validation**:
- Run `npm run type-check` - no errors
- Visual test at multiple breakpoints

---

### Phase 10: WebSocket Integration

**Goal**: Real-time updates.

#### Step 10.1: useEmailRealtime Hook
`frontend/hooks/use-email-realtime.ts`
- Connect to WebSocket on mount
- Handle email:new, email:update, email:delete events
- Invalidate/update TanStack Query cache
- Update folder counts in Zustand store

#### Step 10.2: Integration
- Add hook to Mailbox component
- Test with backend sync events

**Validation**:
- Send test email, verify real-time update
- Verify folder counts update

---

### Phase 11: Keyboard Shortcuts

**Goal**: Power user features.

#### Step 11.1: useEmailKeyboard Hook
`frontend/hooks/use-email-keyboard.ts`
- j/k: Navigate list
- Enter: Open email
- e: Archive
- #: Delete
- r: Reply
- a: Reply all
- f: Forward
- c: Compose
- /: Search

**Validation**:
- Test all shortcuts manually

---

### Phase 12: Polish + Testing

**Goal**: Final quality pass.

#### Step 12.1: Accessibility
- ARIA labels
- Focus management
- Screen reader testing

#### Step 12.2: Performance
- Lighthouse audit
- Virtual list tuning
- Query prefetching

#### Step 12.3: Error Handling
- Network errors
- Empty states
- Loading states

**Validation**:
- Full manual QA
- All type checks pass
- All lint checks pass

---

## File Structure

```
frontend/
├── components/
│   ├── email/
│   │   ├── atoms/
│   │   │   ├── EmailAvatar.tsx
│   │   │   ├── EmailBadge.tsx
│   │   │   ├── EmailCheckbox.tsx
│   │   │   ├── EmailDate.tsx
│   │   │   └── ThreadCountBadge.tsx
│   │   ├── list/
│   │   │   ├── ThreadList.tsx
│   │   │   ├── ThreadListItem.tsx
│   │   │   ├── ThreadListToolbar.tsx
│   │   │   └── EmailListSkeleton.tsx
│   │   ├── thread/
│   │   │   ├── ThreadView.tsx
│   │   │   ├── ThreadHeader.tsx
│   │   │   ├── MessageItem.tsx
│   │   │   └── ThreadActions.tsx
│   │   ├── compose/
│   │   │   ├── ComposeDialog.tsx
│   │   │   ├── ComposeForm.tsx
│   │   │   ├── RecipientField.tsx
│   │   │   └── AttachmentList.tsx
│   │   └── sidebar/
│   │       ├── EmailSidebar.tsx
│   │       ├── FolderItem.tsx
│   │       └── LabelItem.tsx
│   └── dashboard/
│       ├── Mailbox.tsx
│       └── MailboxContent.tsx
├── hooks/
│   ├── queries/
│   │   ├── emails-keys.ts
│   │   ├── use-emails.ts
│   │   ├── use-email-mutations.ts
│   │   └── index.ts (export all)
│   ├── use-email-realtime.ts
│   └── use-email-keyboard.ts
├── lib/
│   └── api/
│       └── emails.ts
├── stores/
│   ├── email-ui-store.ts
│   └── optimistic-store.ts
└── locales/
    ├── en.ts (add email section)
    ├── it.ts (add email section)
    └── index.ts (update types)
```

---

## Validation Checklist (After Each Phase)

- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] No console errors in browser
- [ ] Responsive at all breakpoints (375px, 768px, 1024px, 1440px)
- [ ] Dark mode works correctly
- [ ] Translations work (switch language)

---

## Rules to Follow

1. **NO hardcoded strings** - Use translations
2. **NO raw apiClient in components** - Use TanStack Query hooks
3. **NO useState for server data** - Use TanStack Query
4. **NO complex state in components** - Use Zustand
5. **ALWAYS handle loading/error/empty states**
6. **ALWAYS use MUI theme colors** - No custom CSS colors
7. **MAX 500 lines per file** - Split if larger
8. **TEST after each phase** - Don't accumulate errors

---

## Quick Reference: Existing Patterns

### API Module
See: `frontend/lib/api/contacts.ts`

### Query Hook
See: `frontend/hooks/queries/use-contacts.ts`

### Zustand Store
See: `frontend/stores/folders-store.ts`

### Folder Types
See: `frontend/lib/api/folders.ts` (FolderItem, parseFolderId)

---

## Dependencies to Add

```bash
# Virtual list (RECOMMENDED - most popular 2025)
npm install @tanstack/react-virtual

# Keyboard shortcuts (most downloads, hook-based API)
npm install react-hotkeys-hook

# Toast notifications with undo support
npm install sonner

# Drag and drop (RECOMMENDED - modern, hooks-based)
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# Rich text editor for compose (RECOMMENDED - best docs, collab support)
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder

# Email recipient autocomplete chips
npm install @smastrom/react-email-autocomplete
# OR use MUI Autocomplete with custom chips
```

---

## Research Findings (2025 Best Practices)

### Virtualization Libraries Comparison

| Library | Weekly Downloads | Bundle Size | Best For |
|---------|-----------------|-------------|----------|
| **@tanstack/react-virtual** | 955K+ | 10-15kb | Modern apps, custom layouts, 60FPS |
| react-window | 2.8M+ | 6kb | Simple lists, minimal footprint |
| react-virtualized | 1M+ | 30kb | Complex grids, legacy projects |

**Recommendation**: Use **@tanstack/react-virtual** for:
- Headless design (full UI control)
- Works with TanStack Query ecosystem
- Dynamic row heights
- 60 FPS guarantee

Source: [npm-compare.com](https://npm-compare.com/@tanstack/react-virtual,react-infinite-scroll-component,react-virtualized,react-window)

### Drag & Drop Libraries Comparison

| Library | Status | Best For |
|---------|--------|----------|
| **@dnd-kit** | Active, Modern | Fine control, custom animations, grids |
| react-beautiful-dnd | **DEPRECATED** | - |
| @hello-pangea/dnd | Fork of rbd | List-based kanban, accessibility |
| pragmatic-drag-and-drop | New (Atlassian) | Performance-critical, minimal bundle |
| react-dnd | Stable | Complex nested interactions |

**Recommendation**: Use **@dnd-kit** for:
- Email drag to folders
- Folder reordering
- Label drag & drop
- Custom collision detection

Source: [puckeditor.com/blog](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react)

### Rich Text Editor Comparison

| Library | Best For | Collaboration | Documentation |
|---------|----------|---------------|---------------|
| **Tiptap** | Modern apps, extensible | Built-in via Yjs | Excellent |
| Lexical | Performance, accessibility | Requires setup | Overwhelming |
| Slate | Maximum flexibility | External setup | Sparse |

**Recommendation**: Use **Tiptap** for email compose because:
- Best documentation
- Plugin ecosystem for email features
- Real-time collaboration ready
- ProseMirror foundation (battle-tested)

Source: [liveblocks.io/blog](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025)

### Toast/Snackbar Libraries

| Library | Best For |
|---------|----------|
| **Sonner** | Modern React 18+, shadcn/ui ecosystem, promise support |
| NotiStack | MUI apps, stackable notifications |
| React Hot Toast | Minimal, 5kb |

**Recommendation**: Use **Sonner** for:
- Optimistic updates with undo
- Promise-based async operations
- Dark mode support
- TypeScript-first

Source: [blog.logrocket.com](https://blog.logrocket.com/react-toast-libraries-compared-2025/)

### Keyboard Shortcuts

| Library | Best For |
|---------|----------|
| **react-hotkeys-hook** | Modern hooks API, scopes, good maintenance |
| mousetrap | Sequences, battle-tested, needs wrapper |

**Recommendation**: Use **react-hotkeys-hook** for declarative, hook-based shortcuts.

Source: [npmtrends.com](https://npmtrends.com/mousetrap-vs-react-hot-keys-vs-react-hotkeys-hook)

---

## UX Design Patterns (Superhuman-Inspired)

### Core Principles

1. **Speed First** - Emails render under 100ms
2. **Keyboard-First** - 100+ shortcuts, faster than mouse
3. **Minimal Interface** - Clean, distraction-free design
4. **AI Assistance** - Invisible automation (no manual chatbot)

### Split Inbox Categories (Superhuman)

| Tab | Description |
|-----|-------------|
| Important | Urgent emails requiring action |
| VIP | From key contacts/stakeholders |
| News | Newsletters and updates |
| Calendar | Meeting invites and scheduling |
| Other | Everything else |

### Key UI Patterns

1. **2-Line List Item** (Superhuman style)
   - Line 1: Sender + indicators + date
   - Line 2: Subject only (NO snippet preview)
   - Checkbox hidden until hover

2. **Instant Triage**
   - Treat email as task list
   - Quick actions: archive, snooze, remind

3. **Thread Summarization** (AI)
   - Bullet-point digests
   - Under 2 seconds generation

4. **Smart Reply** (AI)
   - Context-aware suggestions
   - Tone customization
   - Learn from user's writing style

Source: [blog.superhuman.com](https://blog.superhuman.com/gmail-vs-superhuman/)

---

## Backend AI Capabilities (Already Available)

The backend exposes comprehensive AI features in `lib/api/ai.ts`:

### Email Intelligence

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ai/summarize/:emailId` | POST | Thread summarization |
| `/ai/smart-reply/:emailId` | POST | Generate reply suggestions |
| `/ai/compose` | POST | AI-assisted email composition |
| `/ai/categorize/:emailId` | POST | Auto-categorize email |
| `/ai/sentiment/:emailId` | POST | Sentiment analysis |
| `/ai/priority/:emailId` | POST | Priority scoring |
| `/ai/analyze/:emailId` | POST | Comprehensive analysis |
| `/ai/memory/search` | POST | Search past conversations |

### VoltAgent (AI Secretary)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/voltagent/chat` | POST | AI chat (non-streaming) |
| `/voltagent/chat/stream` | POST | AI chat with SSE streaming |
| `/voltagent/briefing` | GET | Daily email briefing |
| `/voltagent/deadlines` | GET | Deadline tracking |
| `/voltagent/follow-ups` | GET | Follow-up reminders |
| `/voltagent/action-items` | GET | Action item extraction |
| `/voltagent/memory` | GET/POST | Long-term memory |

### AI Compose Integration

```typescript
// Example: AI compose email
const { data } = await aiApi.composeEmail({
  prompt: 'Write a follow-up email about the Q4 report',
  to: ['john@example.com'],
  tone: 'professional', // casual, formal, friendly
  locale: 'en',
});
// Returns: { success: true, body: '...', subject: '...' }
```

### Smart Reply Integration

```typescript
// Example: Get smart reply suggestions
const { data } = await aiApi.generateSmartReplies(emailId, 'en', 'professional');
// Returns: { success: true, suggestions: ['Thanks for...', 'I'll review...', 'Let me check...'] }
```

---

## Phase 13: AI Features (NEW)

**Goal**: Integrate AI capabilities into email UI.

### Step 13.1: AI Compose Button

Add AI compose option to ComposeForm:
- "Write with AI" button (Cmd+J / Ctrl+J)
- Prompt input for intent
- Tone selector (casual, professional, friendly)
- Generate draft from prompt

### Step 13.2: Smart Reply Suggestions

Add to ThreadView:
- Show 3 suggested replies under thread
- Click to populate compose field
- Learn from user selections

### Step 13.3: Thread Summarization

Add to ThreadHeader:
- "Summarize" button for long threads
- Expandable summary panel
- Key points bullet list

### Step 13.4: Email Categorization

Add to ThreadListItem:
- AI-assigned category badge
- Importance indicator
- Urgency highlighting

### Step 13.5: Action Item Extraction

Add to MessageItem:
- Detect and highlight action items
- "Add to tasks" quick action
- Due date extraction

**Validation**:
- Test AI features with various emails
- Verify response times < 2 seconds

---

## Phase 14: Drag & Drop (NEW)

**Goal**: Email and folder drag operations.

### Step 14.1: Drag Email to Folder

Using @dnd-kit:
- ThreadListItem becomes draggable
- FolderItem becomes droppable
- Visual feedback during drag
- Optimistic move on drop

### Step 14.2: Reorder Folders

Using @dnd-kit/sortable:
- Custom folders reorderable
- System folders locked position
- Persist order to backend

### Step 14.3: Drag & Drop Labels

- Drag label to email
- Drag email to label in sidebar
- Multi-select drag support

**Validation**:
- Test drag on mobile (touch)
- Test keyboard accessibility

---

## MUI Joy UI Email Template Reference

MUI provides an official email template that can serve as inspiration:
- GitHub: [material-ui/docs/data/joy/getting-started/templates/email/](https://github.com/mui/material-ui/blob/master/docs/data/joy/getting-started/templates/email/App.tsx)

Components to study:
- Layout structure
- Navigation patterns
- Email list design
- Thread view

---

## External References

### Design Inspiration
- [Superhuman](https://superhuman.com) - Premium email UX
- [Zero](https://0.email) - Open source AI email (Next.js/React)
- [Inbox Zero](https://github.com/elie222/inbox-zero) - AI email management
- [TailAdmin](https://tailadmin.com) - Dashboard components

### Documentation
- [@tanstack/react-virtual](https://tanstack.com/virtual/latest)
- [@dnd-kit](https://dndkit.com)
- [Tiptap](https://tiptap.dev)
- [react-hotkeys-hook](https://react-hotkeys-hook.vercel.app)
- [Sonner](https://sonner.emilkowal.ski)

### Backend API Reference
- Swagger: `http://localhost:3000/api/docs`
- AI endpoints: `/ai/*` and `/api/v1/voltagent/*`
