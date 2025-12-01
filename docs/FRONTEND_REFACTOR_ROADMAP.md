# MailAgent Frontend Refactoring Roadmap

**Version:** 1.0
**Date:** 2025-12-01
**Status:** Planning Phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Target Architecture](#3-target-architecture)
4. [Technology Decisions](#4-technology-decisions)
5. [Refactoring Phases](#5-refactoring-phases)
6. [Component Library Design](#6-component-library-design)
7. [State Management Strategy](#7-state-management-strategy)
8. [AI Integration Architecture](#8-ai-integration-architecture)
9. [Performance Optimization](#9-performance-optimization)
10. [Testing Strategy](#10-testing-strategy)
11. [Migration Plan](#11-migration-plan)

---

## 1. Executive Summary

### Vision
Transform MailAgent's frontend into a modern, performant, and maintainable email client that rivals industry leaders like Gmail, Outlook, and Superhuman while providing superior AI-powered productivity features.

### Goals
- **Performance**: Sub-second page loads, 60fps interactions
- **Maintainability**: Clean architecture, comprehensive testing
- **Scalability**: Handle 100K+ emails without performance degradation
- **Accessibility**: WCAG 2.1 AA compliance
- **Developer Experience**: Type-safe, well-documented, easy to extend

### Key Improvements Over Zero Example
| Aspect | Zero | MailAgent Target |
|--------|------|------------------|
| Framework | React Router v7 | Next.js 14+ App Router |
| State | Jotai (atoms) | Zustand + TanStack Query (already using) |
| UI Library | shadcn/ui | Custom MUI + Tailwind hybrid → **Unified shadcn/ui** |
| Calendar | Not implemented | Full FullCalendar integration |
| Contacts | Not implemented | Complete CRM-lite features |
| AI | Basic compose | **Full multi-agent system with HITL** |
| Offline | IndexedDB cache | **Progressive Web App (PWA)** |
| Real-time | PartySocket | **Socket.io (already integrated)** |

---

## 2. Current State Analysis

### 2.1 Technology Stack (Current)
```
Framework:     Next.js 16.0.3 + React 19.2.0
UI:            MUI v7 + Tailwind v4 + Emotion (MIXED - needs consolidation)
State:         Zustand v5 (7 stores)
API:           Axios + Custom API modules
Real-time:     Socket.io-client
Editor:        TipTap v3
Calendar:      FullCalendar v6
i18n:          Custom (1,200+ keys)
```

### 2.2 Identified Issues

#### Critical (Must Fix)
| Issue | Impact | Files Affected |
|-------|--------|----------------|
| Mixed styling (MUI + Tailwind + Emotion) | Inconsistent UI, bundle bloat | All components |
| 212 console.log statements | Performance, security | All stores/hooks |
| No component tests | Regression risk | 84 components |
| Direct localStorage usage | SSR hydration errors | 7 stores |

#### High Priority
| Issue | Impact | Files Affected |
|-------|--------|----------------|
| Dual theme systems | Maintenance complexity | lib/theme/, theme/ |
| Generic error handling | Poor UX | All API calls |
| No loading skeletons | Layout shift (CLS) | Dashboard, Lists |
| Magic strings | Type safety | folders-store, constants |

#### Medium Priority
| Issue | Impact | Files Affected |
|-------|--------|----------------|
| Prop drilling | Readability | Email components |
| No React.memo optimization | Unnecessary re-renders | Lists, heavy components |
| Missing JSDoc comments | Developer onboarding | All files |
| Outdated next-auth v4 | Security, features | Auth system |

#### Known Bugs (To Address)

| Issue | Impact | Files Affected | Status |
|-------|--------|----------------|--------|
| WebSocket event listener accumulation | Memory leak, stale handlers | hooks/use-websocket.ts | LOW - Cleanup exists |
| Missing optimistic update rollback | Inconsistent state on error | hooks/use-email-actions.ts | **FIXED** ✅ |
| Translation type safety (`t as any`) | Runtime errors, no autocomplete | AI components, Mailbox.tsx | **FIXED** ✅ |
| ComposeDialog file upload size limits | No validation, API errors | ComposeDialog/ComposeDialog.tsx | **FIXED** ✅ |
| API client auth token mismatch | 401 errors on auth | lib/api-client.ts | **FIXED** ✅ |

##### Bug Audit Details (2025-12-01)

**1. WebSocket Event Listeners** - LOW RISK

- Cleanup function properly unsubscribes all 25 listeners
- Zustand store functions are stable references
- Action: Monitor only

**2. Missing Optimistic Update Rollback** - FIXED ✅

All functions now have rollback on API failure:

- `handleDelete` ✅ - Saves email, restores via `addEmail()` on error
- `handleBulkDelete` ✅ - Saves all emails, restores each on error
- `handleMarkAsRead` ✅ - Saves previous `isRead` states, reverts on error
- `handleArchive` ✅ - Saves previous `folder` values, reverts on error
- `handleMoveToFolder` ✅ - Saves previous `folder` values, reverts on error
- `handleToggleRead` ✅
- `handleToggleStar` ✅
- `handleToggleImportant` ✅

Tests added: 12 tests in `hooks/use-email-actions.test.ts`

**3. Translation Type Safety** - FIXED

- Added `locale: LocaleKey` to `AppTranslations` interface
- Updated en.ts and it.ts with `locale` property
- Fixed `(t as any)?.locale` in ai.tsx and ComposeDialog.tsx
- Remaining `t as any` are for optional nested keys

**4. ComposeDialog File Upload** - FIXED ✅

- Per-file limit: 10MB ✅
- Total attachment size limit: 25MB ✅
- File type validation: Whitelist of safe MIME types and extensions ✅
- Translation keys added: `fileTypeNotAllowed`, `totalSizeExceeded` (EN/IT)
- Tests added: 27 tests in `components/email/ComposeDialog/ComposeDialog.test.tsx`

**5. API Client Auth Token Mismatch** - FIXED ✅

- Root cause: API client read from `auth_token` but store saved to `auth-storage`
- Fixed: API client now reads from correct Zustand persist storage format

### 2.3 Component Inventory (84 files)

```
components/
├── dashboard/          8 files   → Refactor with new design system
├── dashboard/ai/       5 files   → Enhance with real-time updates
├── email/             20 files   → Major refactor (virtualization, optimization)
├── email/ai/           3 files   → Integrate with VoltAgent
├── calendar/           3 files   → Enhance with AI scheduling
├── contacts/           5 files   → Add bulk operations, import/export
├── labels/             3 files   → Drag-drop reordering
├── layout/             3 files   → Responsive sidebar, command palette
├── providers/          4 files   → OAuth flow improvements
├── ui/                 9 files   → Replace with shadcn/ui
├── landing/            6 files   → Marketing page refresh
└── debug/              1 file    → Dev tools enhancement
```

---

## 3. Target Architecture

### 3.1 Folder Structure (New)

```
frontend/
├── app/                          # Next.js App Router (migrate from pages/)
│   ├── (auth)/                   # Auth routes group
│   │   ├── login/
│   │   ├── register/
│   │   └── oauth-callback/
│   ├── (dashboard)/              # Protected dashboard group
│   │   ├── layout.tsx            # Dashboard shell
│   │   ├── page.tsx              # Dashboard home
│   │   ├── mail/
│   │   │   ├── page.tsx          # Inbox
│   │   │   ├── [folder]/page.tsx # Dynamic folder
│   │   │   └── compose/page.tsx  # Compose modal route
│   │   ├── calendar/
│   │   ├── contacts/
│   │   ├── ai/
│   │   └── settings/
│   ├── api/                      # API routes (if needed)
│   ├── layout.tsx                # Root layout
│   └── globals.css
│
├── components/
│   ├── ui/                       # shadcn/ui primitives (auto-generated)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   └── ... (40+ components)
│   ├── mail/                     # Email feature components
│   │   ├── thread-list/
│   │   │   ├── thread-list.tsx
│   │   │   ├── thread-list-item.tsx
│   │   │   ├── thread-list-skeleton.tsx
│   │   │   └── index.ts
│   │   ├── thread-view/
│   │   ├── compose/
│   │   └── search/
│   ├── calendar/
│   ├── contacts/
│   ├── ai/                       # AI-specific components
│   │   ├── chat-panel/
│   │   ├── smart-reply/
│   │   ├── compose-assistant/
│   │   └── insights-widget/
│   ├── layout/
│   │   ├── app-sidebar.tsx
│   │   ├── header.tsx
│   │   ├── command-palette.tsx
│   │   └── notification-center.tsx
│   └── shared/                   # Cross-feature components
│       ├── empty-state.tsx
│       ├── error-boundary.tsx
│       └── loading-skeleton.tsx
│
├── hooks/                        # Custom React hooks
│   ├── use-threads.ts
│   ├── use-optimistic-action.ts
│   ├── use-keyboard-shortcuts.ts
│   ├── use-websocket.ts
│   └── use-media-query.ts
│
├── lib/
│   ├── api/                      # API client (keep existing, enhance)
│   ├── utils/
│   │   ├── cn.ts                 # Class name utility
│   │   ├── date.ts
│   │   └── email.ts
│   └── constants.ts              # Replace magic strings
│
├── stores/                       # Zustand stores (keep, enhance)
│   ├── ui-store.ts               # UI state (sidebar, modals)
│   ├── email-store.ts            # Email state (optimistic updates)
│   ├── calendar-store.ts
│   ├── contact-store.ts
│   └── ai-store.ts               # AI chat sessions, pending actions
│
├── providers/                    # React context providers
│   ├── query-provider.tsx        # TanStack Query
│   ├── theme-provider.tsx
│   ├── auth-provider.tsx
│   └── websocket-provider.tsx
│
├── types/                        # TypeScript definitions
│   ├── email.ts
│   ├── calendar.ts
│   ├── contact.ts
│   ├── ai.ts
│   └── api.ts
│
├── locales/                      # i18n (keep existing)
│
└── config/
    ├── site.ts                   # Site metadata
    └── navigation.ts             # Route definitions
```

### 3.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Next.js App Router                       │
├─────────────────────────────────────────────────────────────────┤
│  Providers Layer                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Auth    │ │  Theme   │ │  Query   │ │WebSocket │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
├─────────────────────────────────────────────────────────────────┤
│  Layout Shell                                                    │
│  ┌─────────┐ ┌─────────────────────────────────────────────┐   │
│  │ Sidebar │ │              Main Content                    │   │
│  │         │ │  ┌─────────────┐ ┌─────────────────────┐    │   │
│  │ - Mail  │ │  │ Thread List │ │ Thread View / AI    │    │   │
│  │ - Cal   │ │  │ (Virtual)   │ │ Panel               │    │   │
│  │ - Cont  │ │  └─────────────┘ └─────────────────────┘    │   │
│  │ - AI    │ └─────────────────────────────────────────────┘   │
│  └─────────┘                                                     │
├─────────────────────────────────────────────────────────────────┤
│  State Management                                                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Zustand      │ │ TanStack     │ │ URL State    │            │
│  │ (UI State)   │ │ Query (API)  │ │ (nuqs)       │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
├─────────────────────────────────────────────────────────────────┤
│  API Layer                                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ REST Client  │ │ WebSocket    │ │ AI Streaming │            │
│  │ (Axios)      │ │ (Socket.io)  │ │ (SSE)        │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Technology Decisions

### 4.1 UI Component Library: shadcn/ui

**Decision**: Migrate from MUI + Tailwind mix to **shadcn/ui** (Radix + Tailwind)

**Rationale**:
- Consistent styling with Tailwind (already using)
- Copy-paste components (full control, no version lock)
- Excellent accessibility (Radix primitives)
- Smaller bundle than MUI
- Better dark mode support
- Active community, modern patterns

**Migration Strategy**:
```bash
# Initialize shadcn/ui
npx shadcn@latest init

# Add components incrementally
npx shadcn@latest add button dialog input card tabs
```

### 4.2 Data Fetching: TanStack Query ✅ IMPLEMENTED

**Decision**: Add TanStack Query v5 alongside existing API modules

**Benefits**:
- Automatic caching and background refetching
- Optimistic updates with rollback
- Infinite scroll support
- DevTools for debugging
- Request deduplication

**Implementation** (Completed 2025-12-01):

```typescript
// hooks/queries/email-keys.ts - Query key factory pattern
export const emailKeys = {
  all: ['emails'] as const,
  lists: () => [...emailKeys.all, 'list'] as const,
  list: (params?: EmailListParams) => [...emailKeys.lists(), params ?? {}] as const,
  detail: (id: string) => [...emailKeys.details(), id] as const,
  // ... more keys for threads, search, stats, drafts
} as const;

// hooks/queries/use-emails.ts - Query hooks with queryOptions
export function emailListOptions(params?: EmailListParams) {
  return queryOptions({
    queryKey: emailKeys.list(params),
    queryFn: async () => (await emailApi.listEmails(params)).data,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useEmails(params?: EmailListParams) {
  return useQuery(emailListOptions(params));
}

// hooks/mutations/use-email-mutations.ts - Mutations with optimistic updates
export function useUpdateEmail(callbacks?: MutationCallbacks) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ emailId, data }) => emailApi.updateEmail(emailId, data),
    onMutate: async ({ emailId, data }) => {
      await queryClient.cancelQueries({ queryKey: emailKeys.lists() });
      const previousEmail = queryClient.getQueryData(emailKeys.detail(emailId));
      // Optimistically update cache
      queryClient.setQueryData(emailKeys.detail(emailId), { ...previousEmail, ...data });
      return { previousEmail };
    },
    onError: (_error, { emailId }, context) => {
      // Rollback on error
      queryClient.setQueryData(emailKeys.detail(emailId), context?.previousEmail);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: emailKeys.lists() }),
  });
}
```

**Files Created**:

- `lib/query-client.tsx` - QueryClient configuration and provider
- `hooks/queries/email-keys.ts` - Query key factory
- `hooks/queries/use-emails.ts` - All query hooks
- `hooks/mutations/use-email-mutations.ts` - All mutation hooks with optimistic updates

### 4.3 URL State: nuqs

**Decision**: Use nuqs for URL-based state management

**Benefits**:
- Shareable URLs (deep linking)
- Browser history support
- Type-safe URL parameters
- SSR compatible

**Use Cases**:
- Selected email ID: `/mail/inbox?thread=abc123`
- Search query: `/mail/inbox?q=from:john`
- View mode: `/mail/inbox?view=split`

### 4.4 Form Management: React Hook Form + Zod

**Decision**: Standardize on React Hook Form with Zod validation

**Benefits**:
- Minimal re-renders
- Built-in validation
- TypeScript integration
- Easy error handling

```typescript
const composeSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  body: z.string(),
  attachments: z.array(z.instanceof(File)).optional(),
});

type ComposeFormData = z.infer<typeof composeSchema>;
```

---

## 5. Refactoring Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Set up new architecture without breaking existing features
**Status**: ✅ Completed (2025-12-01)

#### 1.1 Setup shadcn/ui ✅

- [x] Initialize shadcn/ui with Tailwind v4 (already configured)
- [x] Configure components.json (existing)
- [x] Add base components: button, input, dialog, card, tabs (existing in components/ui/)
- [x] Create design tokens (`config/design-tokens.ts`, `styles/globals.css`)

#### 1.2 Cleanup Technical Debt

- [x] Create logger utility (`lib/logger.ts`) - replaces console.log in production
- [x] Create constants file for magic strings (`types/constants.ts`)
- [x] Fix localStorage SSR issues (`stores/auth-store.ts` with persist middleware, `components/providers/store-hydration.tsx`)
- [x] Consolidate theme systems (next-themes + MUI synced via `pages/_app.tsx`)

#### 1.3 Add TanStack Query ✅

- [x] Install and configure QueryClient (`lib/query-client.tsx`)
- [x] Create query provider (integrated in `pages/_app.tsx`)
- [x] Implement query hooks for emails (`hooks/queries/use-emails.ts`)
- [x] Implement mutation hooks with optimistic updates (`hooks/mutations/use-email-mutations.ts`)
- [x] Create query key factory pattern (`hooks/queries/email-keys.ts`)

#### 1.4 Setup Testing Infrastructure ✅

- [x] Configure Jest with TypeScript support (`jest.config.js`)
- [x] Add React Testing Library
- [x] Create test utilities and mocks (`jest.setup.ts`)
- [x] Add comprehensive tests (150 tests passing)

#### 1.5 Type System ✅

- [x] Create entity types from Prisma schema (`types/entities.ts`)
- [x] Create API request/response DTOs (`types/api.ts`)
- [x] Create WebSocket event types (`types/websocket.ts`)
- [x] Create constants matching backend enums (`types/constants.ts`)

### Phase 2: Email Module Refactor (Week 3-4)
**Goal**: Modern email experience with optimal performance
**Status**: ✅ Complete (2025-12-01)

#### 2.0 TanStack Query Email Hooks ✅

- [x] Query hooks: `useEmails`, `useEmail`, `useEmailStats`, `useEmailThread`, `useEmailSearch`
- [x] Infinite scroll: `useInfiniteEmails` with pagination support
- [x] Conversation queries: `useConversations`
- [x] Draft management: `useDraft`
- [x] Mutation hooks with optimistic updates:
  - `useUpdateEmail`, `useDeleteEmail`
  - `useBulkMarkRead`, `useBulkStar`, `useBulkFlag`
  - `useBulkMoveToFolder`, `useBulkDelete`
  - `useBulkAddLabels`, `useBulkRemoveLabels`
  - `useSendEmail`, `useReplyEmail`, `useForwardEmail`
  - `useSaveDraft`, `useDeleteDraft`
  - `useSyncProvider`, `useFetchArchivedEmail`

#### 2.1 Thread List Redesign ✅ (Completed 2025-12-01)

- [x] Implement virtual scrolling (TanStack Virtual)
  - Auto-enables for lists > 50 items
  - Uses unique ID keys (not indices) for stable rendering
  - Configurable overscan (5 items default) for smooth scrolling
  - Dynamic sizing with `measureElement` for variable height items
- [x] Add skeleton loading states (`components/email/ThreadListSkeleton.tsx`)
  - Matches exact structure of ThreadListItem
  - Uses MUI Skeleton component (no extra dependencies)
  - Configurable count and checkbox visibility
- [x] Implement optimistic updates for actions (via TanStack Query mutations)
- [x] Add bulk selection with keyboard support (`hooks/use-bulk-selection.ts`)
  - Shift+Click for range selection
  - Ctrl/Cmd+Click for toggle selection (macOS support)
  - Ctrl/Cmd+A to select all
  - Escape to clear selection
  - Max selection limit (100 items) to respect backend batch size
  - `onMaxSelectionReached` callback for user feedback
- [ ] Implement swipe gestures (mobile)

#### 2.2 Thread View Enhancement

- [x] Split pane layout (resizable) - `ResizableEmailLayout` using react-resizable-panels
  - Resizable sidebar (10-25%), list (20-50%), and detail panels
  - Panel sizes persisted to localStorage
  - Custom drag handle with visual feedback
  - Mobile-responsive (drawer on mobile)
- [x] Inline reply composer (`InlineReplyComposer.tsx`)
  - Collapsed state with "Click to reply" prompt
  - Expanded quick reply text field
  - Keyboard shortcut: Ctrl+Enter to send/expand
  - Expand to full ComposeDialog for advanced features
  - Reply and Reply-All support with proper recipients
- [x] Image lazy loading with blur placeholder
  - `LazyImage` component with Intersection Observer
  - `EmailBody` component wraps HTML with lazy-loaded images
  - Skeleton shimmer animation while loading
  - Smooth fade-in transitions
- [x] Attachment preview panel (`AttachmentPreview.tsx`)
  - Image preview with zoom/rotate controls
  - File type icons with category colors
  - Download functionality
  - Panel and inline (chips) variants
- [x] Thread actions toolbar (in `ThreadDisplay.tsx`)
  - Reply, Reply All, Forward actions
  - Star, Archive, Delete actions
  - Label selector integration
  - Expand/Collapse all controls for threads

#### 2.3 Compose Dialog Refactor
- [x] Recipient autocomplete with contacts
  - MUI Autocomplete with freeSolo for custom emails
  - Searches contacts by name and email
  - Shows "Name \<email\>" format in dropdown
- [x] Full-screen compose mode (desktop toggle) ✅
  - Desktop fullscreen toggle button (Maximize2/Minimize2)
  - Keyboard shortcut: F11 to toggle, Escape to exit fullscreen
  - Smooth CSS transition animation
- [x] Attachment drag-and-drop zone ✅
  - Visual drop zone overlay with Upload icon
  - Supports same file type validation as button upload
  - Drag counter for proper leave detection
- [x] Draft auto-save conflict detection ✅
  - Server version tracking with serverVersionRef
  - Conflict detection before save (compares server updatedAt)
  - DraftConflict interface with keepLocal/keepServer resolution
  - hasConflict state and forceSave function exposed
- [x] Schedule send feature ✅
  - Send button with dropdown menu (ChevronDown)
  - Quick presets: "Tomorrow 9AM", "Next Monday 9AM"
  - Custom datetime-local picker in Popover
  - Scheduled chip shows formatted time with delete
  - scheduledAt field added to SendEmailPayload
- [x] Mobile-optimized compose ✅
  - EditorToolbar compact mode with larger touch targets (40px)
  - Simplified mobile toolbar: AI, Undo/Redo, Bold, Italic, List
  - Desktop-only: Underline, Strike, Headings, Numbered list, Blockquote
  - Scrollable toolbar with hidden scrollbar on mobile

#### 2.4 Search Experience

- [x] Command palette (Cmd+K) for global search ✅
  - `CommandPalette.tsx` with MUI Dialog and keyboard navigation
  - `useCommandPalette` hook for global Cmd/Ctrl+K shortcut
  - Navigation commands (Inbox, Sent, Drafts, Archive, Trash, Starred, Calendar, Contacts, AI, Settings)
  - Action commands (Compose, Advanced Search, Manage Labels)
  - Email search with debounced API calls (300ms)
  - Recent searches persisted to localStorage (max 5)
  - Arrow key navigation with visual selection indicator
  - Enter to select, Escape to close
  - i18n support (EN/IT translations added)
  - 25 tests passing in `CommandPalette.test.tsx`
- [x] Search suggestions and history ✅ (integrated in CommandPalette)
- [x] Advanced search filters UI ✅ (already exists in `AdvancedSearchDialog/AdvancedSearchDialog.tsx`)
  - Standard filters: text search, from/to/subject, labels, date range
  - Status filters: hasAttachments, isStarred, isRead
  - AI/Semantic search tab with natural language queries
  - Two tabs: Standard Search and AI Search
  - Active filters counter badge
- [x] Highlighted search results ✅
  - `SearchHighlight.tsx` component with 25 tests
  - Highlights multiple search terms in subject and snippet
  - Supports quoted phrases ("exact phrase")
  - Merges overlapping highlights
  - Case-insensitive matching
  - Optional context extraction for snippets
  - Customizable highlight colors
  - Integrated into `ThreadListItem` with `searchQuery` prop
  - `useSearchMatch` hook for checking if text contains query

### Phase 3: AI Integration Enhancement (Week 5-6)
**Goal**: Seamless AI assistance throughout the app

#### 3.1 AI Chat Panel
- [ ] Streaming responses with typing indicator
- [ ] Message history with persistence
- [ ] Context-aware suggestions
- [ ] Action confirmation UI (HITL)
- [ ] Knowledge source attribution

#### 3.2 Smart Compose
- [ ] Real-time writing suggestions
- [ ] Tone adjustment slider
- [ ] Grammar/spell checking
- [ ] Smart subject generation
- [ ] Reply suggestions based on email content

#### 3.3 Email Intelligence
- [ ] Inline email summary (expandable)
- [ ] Priority indicators with AI reasoning
- [ ] Category badges (auto-labeled)
- [ ] Related emails suggestions
- [ ] Follow-up reminders

#### 3.4 Dashboard AI Widgets
- [ ] Real-time insights updates
- [ ] Learning progress visualization
- [ ] Pending actions queue
- [ ] AI usage analytics

### Phase 4: Calendar Module (Week 7-8)
**Goal**: Full-featured calendar with AI scheduling

#### 4.1 Calendar Views
- [ ] Month, Week, Day, Agenda views
- [ ] Mini calendar navigation
- [ ] Multi-calendar overlay
- [ ] Event color coding by type

#### 4.2 Event Management
- [ ] Quick event creation (click + drag)
- [ ] Event detail sidebar
- [ ] Recurring events UI
- [ ] Attendee management
- [ ] Video conferencing integration

#### 4.3 AI Scheduling
- [ ] Smart scheduling suggestions
- [ ] Availability detection
- [ ] Meeting duration recommendations
- [ ] Conflict resolution assistant

### Phase 5: Contacts Module (Week 9-10)
**Goal**: CRM-lite contact management

#### 5.1 Contact List
- [ ] Alphabetical grouping
- [ ] Search and filters
- [ ] Bulk operations (merge, delete, export)
- [ ] Import from CSV/vCard

#### 5.2 Contact Detail
- [ ] Contact card with all info
- [ ] Communication history timeline
- [ ] Related emails and events
- [ ] Notes and tags

#### 5.3 Contact Intelligence
- [ ] Auto-complete from email signatures
- [ ] Duplicate detection
- [ ] Contact enrichment suggestions

### Phase 6: Dashboard & Settings (Week 11-12)
**Goal**: Comprehensive dashboard and user preferences

#### 6.1 Dashboard Redesign
- [ ] Customizable widget grid
- [ ] Real-time metric updates
- [ ] Activity timeline
- [ ] Quick actions panel

#### 6.2 Settings Overhaul
- [ ] Organized settings categories
- [ ] Account management
- [ ] Notification preferences
- [ ] Keyboard shortcuts customization
- [ ] Data export/import

#### 6.3 Accessibility & Mobile
- [ ] WCAG 2.1 AA audit and fixes
- [ ] Screen reader testing
- [ ] Mobile-responsive layouts
- [ ] Touch gesture support
- [ ] PWA installation

---

## 6. Component Library Design

### 6.1 Design Tokens

```typescript
// config/design-tokens.ts
export const tokens = {
  colors: {
    brand: {
      primary: 'hsl(189, 70%, 62%)',    // Cyan
      secondary: 'hsl(258, 55%, 57%)',  // Purple
      accent: 'hsl(320, 70%, 60%)',     // Magenta
    },
    semantic: {
      email: 'hsl(210, 100%, 56%)',
      calendar: 'hsl(28, 100%, 54%)',
      contacts: 'hsl(258, 55%, 57%)',
      tasks: 'hsl(142, 71%, 45%)',
      ai: 'hsl(189, 70%, 62%)',
    },
    status: {
      success: 'hsl(142, 71%, 45%)',
      warning: 'hsl(38, 92%, 50%)',
      error: 'hsl(0, 84%, 60%)',
      info: 'hsl(210, 100%, 56%)',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  radius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    full: '9999px',
  },
};
```

### 6.2 Component Patterns

```typescript
// components/ui/button.tsx (shadcn/ui pattern)
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);
```

---

## 7. State Management Strategy

### 7.1 State Categories

| Category | Tool | Examples |
|----------|------|----------|
| **Server State** | TanStack Query | Emails, contacts, calendar events |
| **UI State** | Zustand | Sidebar open, selected items, modals |
| **URL State** | nuqs | Current folder, search query, thread ID |
| **Form State** | React Hook Form | Compose form, settings forms |
| **Real-time** | WebSocket + Zustand | New email notifications, sync status |

### 7.2 Zustand Store Pattern

```typescript
// stores/ui-store.ts
import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

interface UIState {
  sidebarCollapsed: boolean;
  activePanel: 'thread' | 'ai' | null;
  composeOpen: boolean;
  commandPaletteOpen: boolean;

  // Actions
  toggleSidebar: () => void;
  setActivePanel: (panel: 'thread' | 'ai' | null) => void;
  openCompose: (options?: ComposeOptions) => void;
  closeCompose: () => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        sidebarCollapsed: false,
        activePanel: null,
        composeOpen: false,
        commandPaletteOpen: false,

        toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
        setActivePanel: (panel) => set({ activePanel: panel }),
        openCompose: () => set({ composeOpen: true }),
        closeCompose: () => set({ composeOpen: false }),
      }),
      { name: 'ui-store' }
    )
  )
);
```

### 7.3 Optimistic Updates Pattern

```typescript
// hooks/use-optimistic-action.ts
export function useOptimisticAction<T>() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (action: Action) => {
      // Execute action
      return await executeAction(action);
    },
    onMutate: async (action) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: ['threads'] });

      // Snapshot previous value
      const previousThreads = queryClient.getQueryData(['threads']);

      // Optimistically update
      queryClient.setQueryData(['threads'], (old) =>
        applyOptimisticUpdate(old, action)
      );

      // Show toast with undo option
      toast({
        title: getActionMessage(action),
        action: <Button onClick={() => undoAction(action)}>Undo</Button>,
      });

      return { previousThreads };
    },
    onError: (err, action, context) => {
      // Rollback on error
      queryClient.setQueryData(['threads'], context?.previousThreads);
      toast.error('Action failed. Changes reverted.');
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['threads'] });
    },
  });
}
```

---

## 8. AI Integration Architecture

### 8.1 AI Components Structure

```
components/ai/
├── chat-panel/
│   ├── chat-panel.tsx           # Main container
│   ├── message-list.tsx         # Message history
│   ├── message-item.tsx         # Single message
│   ├── input-area.tsx           # Input with suggestions
│   └── action-confirmation.tsx  # HITL approval UI
├── smart-reply/
│   ├── smart-reply-bar.tsx      # Suggestions bar
│   └── reply-chip.tsx           # Clickable suggestion
├── compose-assistant/
│   ├── ai-compose-panel.tsx     # Side panel in compose
│   ├── tone-selector.tsx        # Formal/Casual slider
│   └── suggestion-overlay.tsx   # Inline suggestions
├── insights-widget/
│   ├── ai-insights.tsx          # Dashboard widget
│   ├── pending-actions.tsx      # Action queue
│   └── learning-progress.tsx    # AI learning stats
└── shared/
    ├── ai-avatar.tsx            # AI assistant avatar
    ├── typing-indicator.tsx     # "AI is thinking..."
    └── source-citation.tsx      # Knowledge source link
```

### 8.2 AI Chat Implementation

```typescript
// components/ai/chat-panel/chat-panel.tsx
export function AiChatPanel() {
  const { messages, sendMessage, isStreaming } = useAiChat();
  const { pendingActions, approveAction, rejectAction } = usePendingActions();

  return (
    <div className="flex flex-col h-full">
      <header className="border-b p-4">
        <h2 className="font-semibold">AI Assistant</h2>
      </header>

      <ScrollArea className="flex-1 p-4">
        <MessageList messages={messages} />
        {isStreaming && <TypingIndicator />}

        {pendingActions.length > 0 && (
          <PendingActionsQueue
            actions={pendingActions}
            onApprove={approveAction}
            onReject={rejectAction}
          />
        )}
      </ScrollArea>

      <InputArea
        onSend={sendMessage}
        suggestions={getContextualSuggestions()}
        disabled={isStreaming}
      />
    </div>
  );
}
```

### 8.3 Streaming Response Hook

```typescript
// hooks/use-ai-chat.ts
export function useAiChat(sessionId?: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    // Add user message immediately
    const userMessage = { role: 'user', content, id: nanoid() };
    setMessages((prev) => [...prev, userMessage]);

    // Start streaming response
    setIsStreaming(true);
    const assistantMessage = { role: 'assistant', content: '', id: nanoid() };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: content, sessionId }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value);
        setMessages((prev) => {
          const updated = [...prev];
          const lastMsg = updated[updated.length - 1];
          lastMsg.content += chunk;
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
    }
  }, [sessionId]);

  return { messages, sendMessage, isStreaming };
}
```

---

## 9. Performance Optimization

### 9.1 Bundle Optimization

```typescript
// next.config.ts
const config: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/*'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};
```

### 9.2 Virtual Scrolling for Email Lists

```typescript
// components/mail/thread-list/thread-list.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

export function ThreadList({ threads }: { threads: Thread[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Estimated row height
    overscan: 10,
  });

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <ThreadListItem
            key={threads[virtualRow.index].id}
            thread={threads[virtualRow.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

### 9.3 Image Optimization

```typescript
// components/mail/email-content/inline-image.tsx
import Image from 'next/image';

export function InlineImage({ src, alt }: { src: string; alt: string }) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative">
      {!isLoaded && <Skeleton className="w-full h-48" />}
      <Image
        src={src}
        alt={alt}
        width={600}
        height={400}
        className={cn('rounded-md', !isLoaded && 'invisible')}
        onLoadingComplete={() => setIsLoaded(true)}
        loading="lazy"
        placeholder="blur"
        blurDataURL={BLUR_PLACEHOLDER}
      />
    </div>
  );
}
```

### 9.4 Code Splitting

```typescript
// Lazy load heavy components
const ComposeDialog = dynamic(() => import('@/components/mail/compose/compose-dialog'), {
  loading: () => <ComposeDialogSkeleton />,
});

const AiChatPanel = dynamic(() => import('@/components/ai/chat-panel/chat-panel'), {
  loading: () => <AiPanelSkeleton />,
  ssr: false,
});

const CalendarView = dynamic(() => import('@/components/calendar/calendar-view'), {
  loading: () => <CalendarSkeleton />,
});
```

---

## 10. Testing Strategy

### 10.1 Test Structure

```
__tests__/
├── unit/
│   ├── hooks/
│   │   ├── use-threads.test.ts
│   │   └── use-optimistic-action.test.ts
│   └── utils/
│       └── email-utils.test.ts
├── components/
│   ├── mail/
│   │   ├── thread-list.test.tsx
│   │   └── compose-dialog.test.tsx
│   └── ai/
│       └── chat-panel.test.tsx
├── integration/
│   ├── email-flow.test.tsx
│   └── ai-chat-flow.test.tsx
└── e2e/
    ├── login.spec.ts
    ├── send-email.spec.ts
    └── ai-compose.spec.ts
```

### 10.2 Component Test Example

```typescript
// __tests__/components/mail/thread-list.test.tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThreadList } from '@/components/mail/thread-list';

const mockThreads = [
  { id: '1', subject: 'Test Email', from: 'john@example.com', unread: true },
  { id: '2', subject: 'Another Email', from: 'jane@example.com', unread: false },
];

describe('ThreadList', () => {
  it('renders thread items', () => {
    render(<ThreadList threads={mockThreads} />);

    expect(screen.getByText('Test Email')).toBeInTheDocument();
    expect(screen.getByText('Another Email')).toBeInTheDocument();
  });

  it('highlights unread threads', () => {
    render(<ThreadList threads={mockThreads} />);

    const unreadThread = screen.getByText('Test Email').closest('[data-thread]');
    expect(unreadThread).toHaveClass('font-semibold');
  });

  it('calls onSelect when thread clicked', async () => {
    const onSelect = vi.fn();
    render(<ThreadList threads={mockThreads} onSelect={onSelect} />);

    await userEvent.click(screen.getByText('Test Email'));

    expect(onSelect).toHaveBeenCalledWith('1');
  });
});
```

### 10.3 Coverage Targets

| Category | Target | Current |
|----------|--------|---------|
| Unit Tests (hooks, utils) | 90% | ~40% |
| Component Tests | 80% | ~30% |
| Integration Tests | 70% | 0% |
| E2E Critical Paths | 100% | 0% |

**Test Summary (as of 2025-12-01):**

Frontend Tests:

- `CommandPalette.test.tsx`: 25 tests (rendering, search, navigation, keyboard, recent searches)
- `lib/utils.test.ts`: 5 tests
- `lib/query-client.test.tsx`: 4 tests
- `stores/auth-store.test.ts`: 8 tests
- `stores/email-store.test.ts`: 12 tests

Backend Email Module Tests (108 total):

- `email-send.service.spec.ts`: 19 tests (send, schedule, reply, forward)
- `emails.service.spec.ts`: 41 tests (CRUD, bulk ops, search, threads, attachments)
- `scheduled-email.service.spec.ts`: 12 tests
- `email-retention.service.spec.ts`: 12 tests
- `email-cleanup.service.spec.ts`: 12 tests
- `google-sync.service.spec.ts`: 12 tests

---

## 11. Migration Plan

### 11.1 Incremental Migration Strategy

**Principle**: Migrate incrementally, never break production

```
Week 1-2:   Foundation (shadcn, cleanup, testing setup)
            ↓ Deploy: Feature flags enabled
Week 3-4:   Email Module (new components alongside old)
            ↓ Deploy: A/B test new email UI
Week 5-6:   AI Integration (enhance existing)
            ↓ Deploy: Gradual rollout
Week 7-8:   Calendar Module (new implementation)
            ↓ Deploy: Full release
Week 9-10:  Contacts Module (new implementation)
            ↓ Deploy: Full release
Week 11-12: Dashboard & Settings (final polish)
            ↓ Deploy: Complete migration
```

### 11.2 Feature Flags

```typescript
// lib/feature-flags.ts
export const FEATURE_FLAGS = {
  NEW_EMAIL_UI: 'new-email-ui',
  AI_COMPOSE_V2: 'ai-compose-v2',
  CALENDAR_V2: 'calendar-v2',
  CONTACTS_V2: 'contacts-v2',
} as const;

// Usage
export function EmailPage() {
  const { isEnabled } = useFeatureFlag(FEATURE_FLAGS.NEW_EMAIL_UI);

  if (isEnabled) {
    return <NewEmailLayout />;
  }
  return <LegacyEmailLayout />;
}
```

### 11.3 Rollback Plan

Each phase includes:
1. Feature flag to disable new code
2. Database migrations are backward compatible
3. API versioning for breaking changes
4. Monitoring alerts for error rate spikes

---

## Success Metrics

### Performance
- [ ] Lighthouse Performance Score > 90
- [ ] First Contentful Paint < 1.5s
- [ ] Time to Interactive < 3s
- [ ] Cumulative Layout Shift < 0.1

### Quality
- [ ] Test Coverage > 80%
- [ ] TypeScript strict mode enabled
- [ ] Zero accessibility violations (axe)
- [ ] Bundle size < 500KB (gzipped)

### User Experience
- [ ] Email list scroll: 60fps
- [ ] Search results: < 500ms
- [ ] AI response start: < 1s
- [ ] Compose autosave: < 2s

---

## Appendix: Quick Reference

### Commands
```bash
# Development
pnpm dev                    # Start dev server
pnpm lint                   # Run ESLint
pnpm test                   # Run tests
pnpm test:coverage          # Test with coverage

# shadcn/ui
npx shadcn@latest add [component]

# Build
pnpm build                  # Production build
pnpm analyze                # Bundle analysis
```

### Key Files
| Purpose | Location |
|---------|----------|
| Theme config | `tailwind.config.ts` |
| shadcn config | `components.json` |
| Design tokens | `config/design-tokens.ts` |
| API client | `lib/api/` |
| Stores | `stores/` |
| Types | `types/` |

---

**Document Version:** 1.0
**Last Updated:** 2025-12-01
**Author:** Claude Code
