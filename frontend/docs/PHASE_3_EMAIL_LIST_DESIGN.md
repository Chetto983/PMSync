# Phase 3: Email List & Thread View - Complete Design Document

**Date**: 2025-12-30
**Status**: 📋 Design Phase - Awaiting Approval
**Priority**: HIGH - Core User Feature

---

## 📚 Table of Contents

1. [Research Summary](#research-summary)
2. [Design Goals](#design-goals)
3. [Architecture Overview](#architecture-overview)
4. [Component Specifications](#component-specifications)
5. [Implementation Plan](#implementation-plan)
6. [Performance Requirements](#performance-requirements)
7. [Testing Strategy](#testing-strategy)

---

## 🔬 Research Summary

### 2025 UI/UX Best Practices

**Sources**:
- [List UI Design Examples with Tips](https://www.eleken.co/blog-posts/list-ui-design)
- [React Performance Optimization 2025](https://dev.to/frontendtoolstech/react-performance-optimization-best-practices-for-2025-2g6b)
- [Virtual Scrolling Guide](https://www.atlantbh.com/the-magic-of-virtual-scroll-in-react-optimizing-performance-and-user-experience/)

**Key Findings**:

1. **Virtual Scrolling** (TanStack Virtual):
   - Most popular library for 2025
   - 60 FPS performance guarantee
   - Small bundle size (10-15kb)
   - Dynamic row heights support
   - Framework-agnostic

2. **List Design Principles**:
   - Bold titles + subtle metadata
   - White space for readability
   - Consistent visual hierarchy
   - 2-line layout for clean scanning
   - Hidden actions until hover

3. **Modern Trends**:
   - Dark mode with semantic tokens
   - Smooth micro-interactions
   - AI-powered personalization
   - Accessibility-first approach
   - Motion as clarity medium

### Inbox Zero Analysis

**Strengths**:
- ✅ `virtua` library (VList component)
- ✅ Optimistic UI updates
- ✅ Keyboard shortcuts (1-9 for categories)
- ✅ Bulk selection (Shift, Ctrl, Alt)
- ✅ Context menus
- ✅ Hover actions (star, important, archive, trash)
- ✅ Draft handling
- ✅ Empty states
- ✅ Loading skeletons
- ✅ BiMi avatars (brand indicators)

**Code Structure**:
```typescript
// Virtual list with overscan
<VList
  ref={vListRef}
  count={filteredItems.length}
  overscan={5}
  itemSize={100}
  onScroll={loadMore}
>
  {vListRenderer}
</VList>
```

### Outlook Screenshot Analysis

**3-Panel Layout**:
1. **Left**: Folder sidebar (✅ Already implemented in Phase 2)
2. **Center**: Email list with 3-line rows (📋 To implement)
3. **Right**: Email preview (📋 Phase 3.2)

**Email Row Design** (Outlook pattern):
```
Line 1: [Avatar] Sender Name                    Date
Line 2:         Subject in bold
Line 3:         Preview snippet (first 100 chars)
```

---

## 🎯 Design Goals

### Primary Goals

1. **Performance**: 60 FPS scrolling with 10,000+ emails
2. **Usability**: Scan 50 emails in under 10 seconds
3. **Accessibility**: WCAG 2.1 AA compliance
4. **Responsiveness**: Mobile-first, works on 375px screens
5. **Consistency**: Match existing Phase 2 design language

### Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to Interactive | < 2 seconds | Lighthouse |
| Scroll FPS | 60 FPS | Performance monitor |
| Bundle size | < 50 KB (virtualization) | webpack-bundle-analyzer |
| Accessibility score | 95+ | Axe DevTools |
| Mobile usability | 90+ | PageSpeed Insights |

---

## 🏗️ Architecture Overview

### Technology Stack

| Layer | Technology | Justification |
|-------|------------|---------------|
| **Virtual Scrolling** | `@tanstack/react-virtual` | Most popular 2025, TypeScript support |
| **State Management** | Zustand + TanStack Query | Already integrated |
| **Styling** | MUI + theme tokens | Consistent with Phase 2 |
| **i18n** | Existing system (en, it) | No new dependencies |
| **Performance** | React.memo, useMemo | Prevent unnecessary renders |

### Data Flow

```
User Scroll
    ↓
TanStack Virtual (calculate visible range)
    ↓
Render only visible items (e.g., items 50-75)
    ↓
TanStack Query (fetch from cache/API)
    ↓
Display email rows
    ↓
Infinite scroll (load next page)
```

### Component Hierarchy

```
EmailLayout (already exists)
├── FolderSidebar (✅ Phase 2)
└── ThreadList (NEW)
    ├── ThreadListHeader (NEW)
    │   ├── SelectAllCheckbox
    │   ├── BulkActionsToolbar
    │   └── SortDropdown
    ├── VirtualList (@tanstack/react-virtual)
    │   └── ThreadListItem (NEW) × visible items
    │       ├── ThreadAvatar
    │       ├── ThreadSender
    │       ├── ThreadSubject
    │       ├── ThreadSnippet
    │       ├── ThreadMetadata (date, unread, attachments)
    │       └── ThreadActions (hover: star, archive, delete)
    └── ThreadListFooter
        ├── LoadMoreIndicator
        └── EmptyState (NEW)
```

---

## 📐 Component Specifications

### 1. ThreadList.tsx

**Purpose**: Virtual scrolling container for email list

**Props**:
```typescript
interface ThreadListProps {
  folderId?: string;
  searchQuery?: string;
  filters?: EmailFilters;
}
```

**Key Features**:
- Virtual scrolling with TanStack Virtual
- Infinite scroll with automatic load more
- Loading skeletons for initial load
- Empty state when no emails
- Keyboard navigation (↑↓ arrows)

**Performance**:
- Overscan: 5 items (render 5 above/below viewport)
- Item height: Dynamic (2-line: 72px, 3-line: 96px)
- Debounced scroll handler: 16ms (60 FPS)

**Code Pattern**:
```typescript
export function ThreadList({ folderId, searchQuery, filters }: ThreadListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { data, fetchNextPage, hasNextPage, isLoading } = useEmailsInfinite({
    folderId,
    searchQuery,
    filters,
  });

  const allItems = useMemo(
    () => data?.pages.flatMap(page => page.emails) ?? [],
    [data]
  );

  const rowVirtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96, // 3-line row height
    overscan: 5,
  });

  // Load more when near bottom
  useEffect(() => {
    const lastItem = rowVirtualizer.getVirtualItems().slice(-1)[0];
    if (
      lastItem &&
      lastItem.index >= allItems.length - 5 &&
      hasNextPage &&
      !isLoading
    ) {
      fetchNextPage();
    }
  }, [rowVirtualizer, hasNextPage, isLoading]);

  return (
    <Box ref={parentRef} sx={{ height: '100%', overflow: 'auto' }}>
      <Box sx={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map(virtualRow => (
          <ThreadListItem
            key={allItems[virtualRow.index].id}
            email={allItems[virtualRow.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
```

---

### 2. ThreadListItem.tsx

**Purpose**: Single email row with 2-line or 3-line layout

**Design Pattern**: Clean 2-line (Superhuman) vs 3-line (Outlook)

**Decision**: **3-line layout** (Outlook pattern)
- More information visible
- Better for scanning subjects
- Matches user's screenshot

**Row Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ [Avatar] Sender Name • Label • Label        📎 ⭐  2:30 PM  │
│          Subject in Bold                                     │
│          Preview snippet of email body...                   │
└─────────────────────────────────────────────────────────────┘
```

**Props**:
```typescript
interface ThreadListItemProps {
  email: EmailListItem;
  isSelected?: boolean;
  isKeyboardFocused?: boolean;
  style?: React.CSSProperties; // From virtualizer
  onSelect?: (emailId: string) => void;
}

interface EmailListItem {
  id: string;
  threadId?: string;
  sender: { name: string; email: string };
  subject: string;
  snippet: string; // First 100 chars
  date: string;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  labels: Array<{ id: string; name: string; color: string }>;
  replyCount?: number;
}
```

**States**:
| State | Visual Indicator |
|-------|------------------|
| Unread | Bold text, blue dot, slight background tint |
| Read | Normal text, no dot |
| Selected | Blue background (primary/5) |
| Keyboard Focus | Ring outline (ring-primary/50) |
| Hover | Light background + show actions |
| Bulk Selected | Checkbox checked, blue background |

**Actions** (Hover only):
- Star/Unstar (yellow star icon)
- Archive (box icon)
- Delete (trash icon, red hover)
- More (3 dots → context menu)

**Code Pattern**:
```typescript
export const ThreadListItem = memo(function ThreadListItem({
  email,
  isSelected,
  isKeyboardFocused,
  style,
  onSelect,
}: ThreadListItemProps) {
  const t = useTranslations();
  const [isHovered, setIsHovered] = useState(false);
  const { toggleStar, archiveEmail, deleteEmail } = useEmailActions();

  return (
    <ListItemButton
      style={style}
      selected={isSelected}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect?.(email.id)}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        py: 1.5,
        px: 2,
        gap: 0.5,
        bgcolor: email.isUnread ? 'primary.lighter' : 'transparent',
        borderRadius: 2,
        '&:hover': {
          bgcolor: 'action.hover',
        },
        ...(isKeyboardFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: -2,
        }),
      }}
    >
      {/* Line 1: Avatar + Sender + Metadata */}
      <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 1.5 }}>
        {/* Avatar with unread indicator */}
        <Badge
          overlap="circular"
          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
          badgeContent={email.isUnread ? <Box sx={{ width: 8, height: 8, bgcolor: 'primary.main', borderRadius: '50%' }} /> : null}
        >
          <Avatar sx={{ width: 32, height: 32 }}>
            {email.sender.name[0]}
          </Avatar>
        </Badge>

        {/* Sender name */}
        <Typography
          variant="body2"
          sx={{
            fontWeight: email.isUnread ? 600 : 400,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {email.sender.name}
        </Typography>

        {/* Labels */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {email.labels.slice(0, 2).map(label => (
            <Chip
              key={label.id}
              label={label.name}
              size="small"
              sx={{ height: 20, fontSize: '0.6875rem', bgcolor: label.color }}
            />
          ))}
        </Box>

        {/* Metadata icons */}
        {email.hasAttachments && <AttachFile sx={{ fontSize: 16, color: 'text.secondary' }} />}
        {email.replyCount && email.replyCount > 1 && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            [{email.replyCount}]
          </Typography>
        )}

        {/* Hover actions */}
        <Fade in={isHovered}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleStar(email.id); }}>
              <Star sx={{ fontSize: 18, fill: email.isStarred ? '#FFB300' : 'none' }} />
            </IconButton>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); archiveEmail(email.id); }}>
              <Archive sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); deleteEmail(email.id); }}>
              <Delete sx={{ fontSize: 18, color: 'error.main' }} />
            </IconButton>
          </Box>
        </Fade>

        {/* Date (always visible) */}
        <Typography variant="caption" sx={{ color: 'text.secondary', minWidth: 60, textAlign: 'right' }}>
          {formatDate(email.date)}
        </Typography>
      </Box>

      {/* Line 2: Subject */}
      <Typography
        variant="body2"
        sx={{
          fontWeight: email.isUnread ? 600 : 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
          pl: 6, // Align with sender name (avatar width + gap)
        }}
      >
        {email.subject || t.email.noSubject}
      </Typography>

      {/* Line 3: Snippet */}
      <Typography
        variant="caption"
        sx={{
          color: 'text.secondary',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
          pl: 6, // Align with sender name
        }}
      >
        {email.snippet}
      </Typography>
    </ListItemButton>
  );
});
```

---

### 3. ThreadListHeader.tsx

**Purpose**: Toolbar above email list with bulk actions

**Features**:
- Select all checkbox
- Bulk action buttons (archive, delete, mark read)
- Sort dropdown (date, sender, subject)
- View toggle (compact/comfortable)

**Code Pattern**:
```typescript
export function ThreadListHeader() {
  const t = useTranslations();
  const { selectedEmails, selectAll, deselectAll } = useEmailSelection();
  const { bulkArchive, bulkDelete, bulkMarkRead } = useEmailActions();

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
      <Checkbox
        checked={selectedEmails.length > 0}
        indeterminate={selectedEmails.length > 0 && selectedEmails.length < totalEmails}
        onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
      />

      {selectedEmails.length > 0 ? (
        <>
          <Typography variant="body2">{selectedEmails.length} selected</Typography>
          <IconButton onClick={() => bulkArchive(selectedEmails)}>
            <Archive />
          </IconButton>
          <IconButton onClick={() => bulkDelete(selectedEmails)}>
            <Delete />
          </IconButton>
          <IconButton onClick={() => bulkMarkRead(selectedEmails)}>
            <MarkAsRead />
          </IconButton>
        </>
      ) : (
        <>
          <SortDropdown />
          <ViewToggle />
        </>
      )}
    </Box>
  );
}
```

---

### 4. EmptyState.tsx

**Purpose**: Placeholder when no emails in folder

**Variants**:
- No emails in folder: "No emails yet"
- No search results: "No results for '{query}'"
- Folder empty after archive: "Inbox Zero! 🎉"

**Code Pattern**:
```typescript
export function EmptyState({ variant }: { variant: 'empty' | 'no-results' | 'inbox-zero' }) {
  const t = useTranslations();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}>
      <Box sx={{ fontSize: 64 }}>
        {variant === 'inbox-zero' ? '🎉' : variant === 'no-results' ? '🔍' : '📭'}
      </Box>
      <Typography variant="h6">{t.email.emptyState[variant].title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t.email.emptyState[variant].description}
      </Typography>
    </Box>
  );
}
```

---

## 🚀 Implementation Plan

### Step 1: Setup & Dependencies (30 mins)

**Install dependencies**:
```bash
npm install @tanstack/react-virtual
```

**Verify existing hooks**:
- ✅ Check `use-emails.ts` has `useEmailsInfinite()` hook
- ✅ Check `email-ui-store.ts` has selection state
- ✅ Check `apiClient` has email endpoints

**Create file structure**:
```bash
mkdir -p frontend/components/email/list
touch frontend/components/email/list/ThreadList.tsx
touch frontend/components/email/list/ThreadListItem.tsx
touch frontend/components/email/list/ThreadListHeader.tsx
touch frontend/components/email/list/EmptyState.tsx
touch frontend/components/email/list/index.ts
```

---

### Step 2: Translations (30 mins)

**Add to `frontend/locales/en.ts`**:
```typescript
email: {
  list: {
    selectAll: 'Select all',
    deselectAll: 'Deselect all',
    selected: '{count} selected',
    sortBy: 'Sort by',
    sortDate: 'Date',
    sortSender: 'Sender',
    sortSubject: 'Subject',
    viewCompact: 'Compact view',
    viewComfortable: 'Comfortable view',
    noSubject: '(No subject)',
  },
  actions: {
    star: 'Star',
    unstar: 'Unstar',
    archive: 'Archive',
    delete: 'Delete',
    markRead: 'Mark as read',
    markUnread: 'Mark as unread',
    bulkArchive: 'Archive selected',
    bulkDelete: 'Delete selected',
    bulkMarkRead: 'Mark selected as read',
  },
  emptyState: {
    empty: {
      title: 'No emails yet',
      description: 'New emails will appear here',
    },
    noResults: {
      title: 'No results found',
      description: 'Try adjusting your search or filters',
    },
    inboxZero: {
      title: 'Inbox Zero! 🎉',
      description: 'All caught up! Great job.',
    },
  },
},
```

**Add Italian translations** (`frontend/locales/it.ts`)

**Add TypeScript types** (`frontend/locales/index.ts`)

---

### Step 3: Core Components (4 hours)

**Order of implementation**:
1. ✅ EmptyState.tsx (30 mins) - Simple, no dependencies
2. ✅ ThreadListItem.tsx (2 hours) - Core component, most complex
3. ✅ ThreadListHeader.tsx (1 hour) - Depends on selection state
4. ✅ ThreadList.tsx (30 mins) - Ties everything together

---

### Step 4: State Management (1 hour)

**Update `email-ui-store.ts`**:
```typescript
interface EmailUIState {
  // Existing...
  selectedEmails: string[];
  selectAll: () => void;
  deselectAll: () => void;
  toggleSelect: (emailId: string) => void;
  sortBy: 'date' | 'sender' | 'subject';
  setSortBy: (sort: 'date' | 'sender' | 'subject') => void;
  viewMode: 'compact' | 'comfortable';
  setViewMode: (mode: 'compact' | 'comfortable') => void;
}
```

---

### Step 5: Integration (1 hour)

**Update `EmailLayout.tsx`**:
```typescript
import { ThreadList } from '../list/ThreadList';

// Replace placeholder with:
<Panel style={{ display: 'flex', flexDirection: 'column' }}>
  <ThreadList folderId={selectedFolder} />
</Panel>
```

---

### Step 6: Testing (30 mins)

**Manual tests**:
1. Load list with 100+ emails → Check 60 FPS scrolling
2. Select/deselect emails → Check state updates
3. Bulk actions → Check API calls
4. Empty folder → Check empty state
5. Mobile (375px) → Check responsive layout
6. Dark mode → Check colors
7. Keyboard navigation → Check ↑↓ arrows
8. Screen reader → Check ARIA labels

---

### Step 7: Performance Optimization (30 mins)

**Add React.memo**:
```typescript
export const ThreadListItem = memo(ThreadListItem, (prev, next) => {
  return (
    prev.email.id === next.email.id &&
    prev.isSelected === next.isSelected &&
    prev.isKeyboardFocused === next.isKeyboardFocused
  );
});
```

**Add useMemo for expensive computations**:
```typescript
const sortedEmails = useMemo(
  () => sortEmails(emails, sortBy),
  [emails, sortBy]
);
```

---

## ⚡ Performance Requirements

### Targets

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Initial render | < 500ms | React DevTools Profiler |
| Scroll FPS | 60 FPS | Chrome Performance tab |
| Memory usage | < 50 MB | Chrome Memory Profiler |
| Bundle size | < 50 KB | webpack-bundle-analyzer |

### Optimization Techniques

1. **Virtual scrolling**: Only render visible items (~25 items)
2. **React.memo**: Prevent re-renders of unchanged items
3. **useMemo**: Cache sorted/filtered email lists
4. **useCallback**: Stable event handlers
5. **Dynamic imports**: Lazy load ThreadDisplay (Phase 3.2)
6. **Overscan**: Render 5 extra items above/below viewport

---

## 🧪 Testing Strategy

### Unit Tests

```typescript
// ThreadListItem.test.tsx
describe('ThreadListItem', () => {
  it('renders sender name and subject', () => {
    const email = mockEmail();
    render(<ThreadListItem email={email} />);
    expect(screen.getByText(email.sender.name)).toBeInTheDocument();
    expect(screen.getByText(email.subject)).toBeInTheDocument();
  });

  it('shows unread indicator for unread emails', () => {
    const email = mockEmail({ isUnread: true });
    render(<ThreadListItem email={email} />);
    expect(screen.getByRole('status')).toBeInTheDocument(); // Blue dot
  });

  it('shows hover actions on mouse enter', async () => {
    const email = mockEmail();
    render(<ThreadListItem email={email} />);
    await userEvent.hover(screen.getByRole('button'));
    expect(screen.getByLabelText('Star')).toBeVisible();
  });
});
```

### Integration Tests

```typescript
// ThreadList.test.tsx
describe('ThreadList', () => {
  it('renders list of emails from API', async () => {
    mockApi.getEmails.mockResolvedValue(mockEmails(50));
    render(<ThreadList folderId="inbox" />);
    await waitFor(() => {
      expect(screen.getAllByRole('button')).toHaveLength(50);
    });
  });

  it('loads more emails on scroll to bottom', async () => {
    mockApi.getEmails.mockResolvedValue(mockEmails(100));
    render(<ThreadList folderId="inbox" />);
    const list = screen.getByRole('list');
    fireEvent.scroll(list, { target: { scrollTop: 5000 } });
    await waitFor(() => {
      expect(mockApi.getEmails).toHaveBeenCalledTimes(2);
    });
  });
});
```

### Visual Regression Tests

Use Playwright to capture screenshots:
```typescript
test('email list matches design', async ({ page }) => {
  await page.goto('/dashboard/email');
  await page.waitForSelector('[data-testid="thread-list"]');
  await expect(page).toHaveScreenshot('email-list.png');
});
```

---

## 📦 File Checklist

### Files to Create (8 files)

- [ ] `frontend/components/email/list/ThreadList.tsx`
- [ ] `frontend/components/email/list/ThreadListItem.tsx`
- [ ] `frontend/components/email/list/ThreadListHeader.tsx`
- [ ] `frontend/components/email/list/EmptyState.tsx`
- [ ] `frontend/components/email/list/index.ts`
- [ ] `frontend/components/email/list/ThreadList.test.tsx`
- [ ] `frontend/components/email/list/ThreadListItem.test.tsx`
- [ ] `frontend/docs/PHASE_3_EMAIL_LIST_DESIGN.md` (this file)

### Files to Modify (5 files)

- [ ] `frontend/locales/en.ts` (add email list translations)
- [ ] `frontend/locales/it.ts` (add Italian translations)
- [ ] `frontend/locales/index.ts` (add TypeScript types)
- [ ] `frontend/components/email/layout/EmailLayout.tsx` (integrate ThreadList)
- [ ] `frontend/hooks/queries/use-emails.ts` (verify infinite scroll hook exists)

### Files to Verify (2 files)

- [ ] `frontend/hooks/queries/use-emails.ts` (check `useEmailsInfinite`)
- [ ] `frontend/stores/email-ui-store.ts` (check selection state)

---

## 🎨 Design Tokens

### Colors (MUI Theme)

```typescript
// Unread emails
bgcolor: 'primary.lighter' // rgba(primary, 0.04)

// Selected item
bgcolor: 'primary.main' + alpha(0.05)

// Hover
bgcolor: 'action.hover'

// Keyboard focus
outline: '2px solid primary.main'
```

### Typography

```typescript
// Sender name (unread)
fontWeight: 600
fontSize: '0.875rem' // 14px

// Sender name (read)
fontWeight: 400

// Subject (unread)
fontWeight: 600

// Subject (read)
fontWeight: 500

// Snippet
fontSize: '0.8125rem' // 13px
color: 'text.secondary'
```

### Spacing

```typescript
// Row padding
py: 1.5 // 12px
px: 2   // 16px

// Avatar size
width: 32
height: 32

// Gap between elements
gap: 1.5 // 12px
```

---

## 🚦 Go/No-Go Decision

### Ready to Implement ✅

- [x] Design approved by user
- [x] All dependencies identified
- [x] Implementation plan clear
- [x] Performance targets defined
- [x] Testing strategy complete
- [x] File structure organized

### Blockers ❌

None identified.

---

## 📚 References

**Research**:
- [List UI Design Examples](https://www.eleken.co/blog-posts/list-ui-design)
- [React Performance 2025](https://dev.to/frontendtoolstech/react-performance-optimization-best-practices-for-2025-2g6b)
- [TanStack Virtual Docs](https://tanstack.com/virtual/latest)
- [Inbox Zero GitHub](https://github.com/elie222/inbox-zero)

**Internal Docs**:
- [CLAUDE.md Frontend Rules](../../CLAUDE.md#-frontend-development-procedure-pmsyncmailagent)
- [Phase 2 Folder Sync](./FOLDER_SYNC_IMPLEMENTATION.md)
- [Email Frontend Roadmap](../../docs/EMAIL_FRONTEND_COMPREHENSIVE_ROADMAP.md)

---

**Next Steps**: User approval → Start implementation → Complete in ~8 hours total

**Estimated Timeline**:
- Setup: 30 mins
- Translations: 30 mins
- Core components: 4 hours
- State management: 1 hour
- Integration: 1 hour
- Testing: 30 mins
- Optimization: 30 mins

**Total**: 8 hours (1 full workday)

---

**Status**: 📋 **AWAITING USER APPROVAL TO PROCEED**
