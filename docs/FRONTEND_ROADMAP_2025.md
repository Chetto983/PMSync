# PMSync Frontend Refactoring Roadmap 2025

**Version:** 2.1
**Updated:** December 17, 2025
**Status:** Active Development

---

## Executive Summary

Based on comprehensive research into [2025 React/Next.js best practices](https://strapi.io/blog/react-and-nextjs-in-2025-modern-best-practices), [AI email UX patterns](https://blog.superhuman.com/best-ai-email-assistant/), and [dashboard design principles](https://www.uxpin.com/studio/blog/dashboard-design-principles/), this document outlines the complete roadmap for PMSync frontend.

**Current State:** 7.5/10 | **Target State:** 9.5/10

### Critical Finding: Backend Feature Gap
> **60% of backend AI features are NOT exposed in the frontend.**
> PMSync has unique features (Mem0 memory, VoltAgent, CRM Intelligence) that NO competitor has, but users can't access them.

---

## Part A: Technical Foundation (Weeks 1-3)

### Phase 1: Critical Fixes (Week 1)

#### 1.1 Hydration & SSR Issues

| Task | File | Priority | Effort |
|------|------|----------|--------|
| Replace null render with skeleton | `pages/_app.tsx:124-126` | Critical | 2h |
| Add error boundary to all pages | `pages/dashboard/*.tsx` | High | 4h |
| Fix button-in-button violations | `components/email/FolderSection.tsx` | High | 2h |
| Add proper loading states | All dashboard pages | Medium | 4h |

#### 1.2 Email Module Fixes

| Task | File | Priority | Effort |
|------|------|----------|--------|
| Add error boundary | `pages/dashboard/email.tsx` | Critical | 2h |
| Fix WebSocket reconnection | `hooks/use-websocket.ts` | High | 4h |
| Add retry logic to queries | `components/dashboard/Mailbox.tsx` | High | 3h |
| Fix conversation/thread mode | `Mailbox.tsx:822-865` | Medium | 4h |

#### 1.3 Console Cleanup & Logging

- Replace `console.*` with `logger` utility
- Remove debug logs from production hooks
- Add structured logging for debugging

---

### Phase 2: Performance Optimization (Week 2)

Based on [Next.js Performance Optimization Guide](https://pagepro.co/blog/nextjs-performance-optimization-in-9-steps/):

#### 2.1 Rendering Strategy (Hybrid Approach)

| Page | Current | Target | Why |
|------|---------|--------|-----|
| Landing | Client | **Server** | Faster TTFB, SEO |
| Dashboard | Client | **Hybrid** | Real-time + SSR stats |
| Email List | Client | **Hybrid** | Initial load fast |
| Settings | Client | **Server** | Static content |
| AI Chat | Client | Client | Real-time streaming |

#### 2.2 Code Splitting & Lazy Loading

```typescript
// Dynamic imports for heavy components
const TipTapEditor = dynamic(() => import('@/components/TipTapEditor'), {
  loading: () => <EditorSkeleton />,
  ssr: false
});

const FullCalendar = dynamic(() => import('@fullcalendar/react'), {
  loading: () => <CalendarSkeleton />,
  ssr: false
});

const RelationshipGraph = dynamic(() => import('@/components/crm/RelationshipGraph'), {
  loading: () => <GraphSkeleton />,
  ssr: false
});
```

#### 2.3 React Optimization

Based on [React Performance Optimization 2025](https://www.growin.com/blog/react-performance-optimization-2025/):

| Technique | Implementation | Impact |
|-----------|---------------|--------|
| React.memo | Wrap static components | -30% re-renders |
| useMemo | Expensive calculations | -20% CPU |
| useCallback | Event handlers | Prevent child re-renders |
| React Compiler | Enable in Next.js 15+ | Auto-optimization |

#### 2.4 Core Web Vitals Targets

| Metric | Current | Target | How |
|--------|---------|--------|-----|
| LCP | ~2.5s | <1.5s | Image optimization, SSR |
| INP | ~200ms | <100ms | Reduce JS, virtualization |
| CLS | ~0.15 | <0.1 | Reserved space, fonts |

---

### Phase 3: Component Architecture (Week 3)

#### 3.1 Mailbox Refactoring

Current: 1676 lines (too large)
Target: Modular architecture

```
components/email/
├── Mailbox/
│   ├── index.tsx              # Container (~100 lines)
│   ├── MailboxHeader.tsx      # Search, filters (~150 lines)
│   ├── MailboxSidebar.tsx     # Folders, labels (~200 lines)
│   ├── MailboxList.tsx        # Virtualized list (~300 lines)
│   ├── MailboxDetail.tsx      # Email view (~250 lines)
│   ├── MailboxCompose.tsx     # Compose modal (~300 lines)
│   ├── hooks/
│   │   ├── useMailboxState.ts
│   │   ├── useMailboxQuery.ts
│   │   └── useMailboxActions.ts
│   └── __tests__/
```

#### 3.2 Custom Hooks Extraction

| Hook | Source | Purpose |
|------|--------|---------|
| `useRetryWithBackoff` | `ai.tsx:771-797` | Reusable retry logic |
| `useVirtualList` | `ThreadList.tsx` | Virtualization wrapper |
| `useRealtime` | Multiple | WebSocket abstraction |
| `useKeyboardNavigation` | New | j/k/l navigation |
| `useCommandPalette` | New | Cmd+K handler |

---

## Part B: AI Feature Exposure (Weeks 4-6)

> **CRITICAL:** This is the highest-impact work. PMSync has features NO competitor offers.

### Phase 4: Dashboard Transformation (Week 4)

Based on [Dashboard UI Design Principles 2025](https://www.designstudiouiux.com/blog/dashboard-ui-design-guide/):

#### 4.1 New Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⌘K  Command Palette (Always accessible)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🌅 DAILY BRIEFING (AI-generated, dismissible)                        │   │
│  │ "Good morning! 3 urgent emails, 2 deadlines today, 5 stale contacts" │   │
│  │ [Show Details] [Dismiss for Today]                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │📬 INBOX    │  │⏰ DEADLINES│  │🔔 FOLLOW-UP│  │👥 CRM      │           │
│  │ Urgent: 3  │  │ Today: 2   │  │ Pending: 4 │  │ Stale: 5   │           │
│  │ Important:8│  │ Week: 7    │  │ Overdue: 1 │  │ Score: 78% │           │
│  │ Other: 45  │  │            │  │            │  │            │           │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘           │
│                                                                              │
│  ┌─────────────────────────────┐  ┌───────────────────────────────────┐    │
│  │ 📅 TODAY'S EVENTS           │  │ ⚡ AI ACTIONS (3 pending)          │    │
│  │ 09:00 Team standup          │  │ • Draft reply to John             │    │
│  │ 14:00 Client call           │  │ • Schedule follow-up with Sarah   │    │
│  │ 16:30 Project review        │  │ • Update meeting notes            │    │
│  │ [View Calendar]             │  │ [Review All →]                    │    │
│  └─────────────────────────────┘  └───────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ⭐ PRIORITY INBOX (AI-sorted)                                        │   │
│  │ [Email list with inline AI insights...]                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 4.2 New Dashboard Components

| Component | API Endpoint | Priority | Status |
|-----------|-------------|----------|--------|
| `DailyBriefing.tsx` | `GET /api/v1/voltagent/briefing` | P0 | ✅ Done |
| `DeadlineWidget.tsx` | `GET /api/v1/voltagent/deadlines` | P0 | ✅ Done |
| `FollowUpWidget.tsx` | `GET /api/v1/voltagent/followups` | P0 | ✅ Done |
| `CrmAlertsWidget.tsx` | `GET /api/v1/crm/stale-contacts` | P0 | ✅ Done |
| `PriorityInbox.tsx` | `GET /api/v1/emails?isImportant=true` | P0 | ✅ Done (Dec 17) |
| `SplitInbox.tsx` | `GET /api/v1/emails` + AI sorting | P1 | Pending |

#### 4.3 Dashboard Technical Improvements (December 17, 2025)

**Responsive Design:**
- All widgets use MUI Grid v2 with responsive breakpoints (`xs`, `sm`, `md`, `lg`)
- CSS Grid with `minmax()` for fluid layouts
- Theme-aware colors via `theme.palette.*` instead of hardcoded hex values

**PriorityInbox Refactor:**
- Changed from "last 5 unread emails" to "important emails" concept
- Uses provider-agnostic `isImportant` filter (backend combines `isStarred OR isFlagged`)
- Works across Gmail (starred), Outlook (flagged), and IMAP (flagged)
- TanStack Query with `useImportantEmails()` hook

**Unread Count Accuracy:**
- `getStats()` now excludes TRASH and SPAM folders from unread count
- Uses RFC 6154 `specialUse` folder types for proper filtering
- `recentUnreadEmails` query uses `specialUse: 'INBOX'` filter

---

### Phase 5: Command Palette & Keyboard Navigation (Week 4)

Based on [React Command Palette Patterns](https://react-cmdk.com/) and [Superhuman UX](https://blog.superhuman.com/spark-ai/):

#### 5.1 Command Palette (Cmd+K)

Using [cmdk](https://github.com/pacocoursey/cmdk) or [react-cmdk](https://react-cmdk.com/):

```typescript
// components/ai/CommandPalette.tsx
import { Command } from 'cmdk';

const commands = [
  // Navigation
  { id: 'inbox', name: 'Go to Inbox', shortcut: '⌘1', icon: Mail },
  { id: 'calendar', name: 'Go to Calendar', shortcut: '⌘2', icon: Calendar },
  { id: 'contacts', name: 'Go to Contacts', shortcut: '⌘3', icon: Users },
  { id: 'ai', name: 'Go to AI Assistant', shortcut: '⌘4', icon: Sparkles },

  // Actions
  { id: 'compose', name: 'Compose Email', shortcut: '⌘N', icon: PenSquare },
  { id: 'search', name: 'Search Emails', shortcut: '⌘F', icon: Search },

  // AI Actions
  { id: 'ai-summarize', name: 'AI: Summarize Email', shortcut: '⌘S', icon: Sparkles },
  { id: 'ai-reply', name: 'AI: Quick Reply', shortcut: '⌘R', icon: Reply },
  { id: 'ai-compose', name: 'AI: Compose with Context', icon: Wand },

  // Productivity
  { id: 'followups', name: 'View Follow-ups', icon: Bell },
  { id: 'deadlines', name: 'View Deadlines', icon: Clock },
  { id: 'stale', name: 'View Stale Contacts', icon: AlertTriangle },

  // AI Knowledge
  { id: 'search-memories', name: 'Search AI Memories', icon: Brain },
  { id: 'search-docs', name: 'Search Documents', icon: FileSearch },
];
```

#### 5.2 Keyboard Navigation (Vim-like)

```typescript
// hooks/useKeyboardNavigation.ts
const keyBindings = {
  // Navigation
  'j': 'nextEmail',
  'k': 'previousEmail',
  'l': 'openEmail',
  'h': 'closeEmail',
  'g i': 'goToInbox',
  'g s': 'goToStarred',
  'g d': 'goToDrafts',

  // Actions
  'e': 'archiveEmail',
  '#': 'deleteEmail',
  's': 'toggleStar',
  'r': 'replyEmail',
  'a': 'replyAll',
  'f': 'forwardEmail',

  // AI Actions
  'Shift+S': 'aiSummarize',
  'Shift+R': 'aiQuickReply',
  'Shift+C': 'aiCompose',
};
```

---

### Phase 6: Inline AI & Email Enhancement (Week 5)

Based on [AI Email Assistant UX Patterns](https://blog.superhuman.com/best-ai-email-assistant/):

#### 6.1 Email View with Inline AI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ From: john@company.com                            Dec 15, 2025 • 10:30 AM   │
│ Subject: Project deadline confirmation                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ 🤖 AI INSIGHTS (auto-generated)                          [Collapse] │    │
│ │                                                                      │    │
│ │ ⏰ Deadline: December 20, 2025 (5 days)                             │    │
│ │ 🔔 Follow-up: Response needed within 3 days                         │    │
│ │ 👤 Contact: John Smith                                              │    │
│ │    └─ Relationship: 85/100 • Last contact: 2 days ago               │    │
│ │ 📋 Action Items:                                                    │    │
│ │    • Send final report by Friday                                    │    │
│ │    • Confirm project timeline                                       │    │
│ │                                                                      │    │
│ │ [Add to Calendar] [Create Task] [Set Reminder]                      │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ Hi David,                                                                    │
│                                                                              │
│ Just wanted to confirm the project deadline is December 20th.                │
│ Can you please send the final report by Friday?                             │
│                                                                              │
│ Best,                                                                        │
│ John                                                                         │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ 💬 QUICK REPLIES (AI-generated based on your writing style)                 │
│ ┌───────────────┐ ┌───────────────┐ ┌─────────────────────┐                │
│ │ ✓ Confirm     │ │ ⏰ Request    │ │ ❓ Ask for details  │                │
│ │   deadline    │ │   extension   │ │                     │                │
│ └───────────────┘ └───────────────┘ └─────────────────────┘                │
│                                                                              │
│ 💡 Or type your own reply with AI assistance (⌘J)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ ⚡ [Reply] [Reply All] [Forward] [Archive] [🗑️] [⭐] [🏷️ Label]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 6.2 AI Compose Enhancement (Like Superhuman)

```typescript
// Cmd+J / Ctrl+J activates AI compose
const aiComposeFeatures = {
  'Write with AI': 'Draft email from prompt',
  'Quick Reply': 'Generate contextual responses',
  'Rephrase': 'Make writing clearer/concise',
  'Proofread': 'Check grammar and tone',
  'Tone Adjust': 'Professional/Friendly/Casual',
  'Translate': 'Multi-language support',
  'Summarize Thread': 'Condense long conversations',
};
```

#### 6.3 New Email Components

| Component | Description | Priority |
|-----------|-------------|----------|
| `InlineAIInsights.tsx` | Auto-generated insights panel | P0 |
| `QuickReplies.tsx` | AI-suggested responses | P0 |
| `AIComposer.tsx` | Enhanced compose with AI | P0 |
| `EmailActions.tsx` | Action extraction display | P1 |
| `ContactInsight.tsx` | Inline relationship info | P1 |

---

### Phase 7: CRM & Memory Features (Week 6)

#### 7.1 Contact Detail Enhancement

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ┌─────────┐                                                                  │
│ │ Avatar  │  John Smith                                    [Edit] [More]   │
│ │   JS    │  john@company.com • Acme Corp • CFO                            │
│ └─────────┘  📞 +1 555-0123 • 🔗 LinkedIn                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ RELATIONSHIP HEALTH                                                          │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░   85/100  │    │
│ │ 💚 Strong • Frequent communication • Good reciprocity               │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│ │ Last Contact│  │ Emails      │  │ Meetings    │  │ Response Time   │    │
│ │ 2 days ago  │  │ 47 total    │  │ 12 total    │  │ Avg: 2.3 hours  │    │
│ └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘    │
│                                                                              │
│ 🧠 AI INSIGHTS (from Mem0 long-term memory)                                 │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ • Prefers morning meetings (before 11 AM)                           │    │
│ │ • Quick email responder (usually within 2 hours)                    │    │
│ │ • Decision maker for Q1 budget                                      │    │
│ │ • Interested in product roadmap updates                             │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ INTERACTION TIMELINE                                                         │
│ ───────────────────────────────────────────────────────────────────────     │
│ Dec 14 │ 📧 Email received: "Project update"                                │
│ Dec 12 │ 📧 Email sent: "Proposal v2"                                       │
│ Dec 10 │ 📅 Meeting: Client review (45 min)                                 │
│ Dec 5  │ 📧 Email received: "Initial inquiry"                               │
│ ───────────────────────────────────────────────────────────────────────     │
│                                                                              │
│ [📧 Send Email] [📅 Schedule] [📋 Create Task] [🔔 Set Reminder]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 7.2 Memory Browser (New Page)

```
/dashboard/ai/memories

┌─────────────────────────────────────────────────────────────────────────────┐
│ 🧠 AI MEMORY BROWSER                           [Search memories...]  [+Add] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Categories: [All] [Preferences] [Facts] [Contacts] [Projects]               │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ 💡 PREFERENCES (89 memories)                                        │    │
│ ├─────────────────────────────────────────────────────────────────────┤    │
│ │ • Prefers formal email tone for external communication              │    │
│ │ • Usually works 9 AM - 6 PM CET                                     │    │
│ │ • Signs emails with "Best regards"                                  │    │
│ │ • Prefers bullet points over long paragraphs                        │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ 📊 FACTS (103 memories)                                             │    │
│ ├─────────────────────────────────────────────────────────────────────┤    │
│ │ • Works at PMSync company                                           │    │
│ │ • Main project is Q1 product launch                                 │    │
│ │ • Budget deadline is end of January                                 │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ 👥 CONTACTS (55 memories)                                           │    │
│ ├─────────────────────────────────────────────────────────────────────┤    │
│ │ • John Smith is project manager at Acme Corp                        │    │
│ │ • Sarah prefers Slack over email                                    │    │
│ │ • Mike is the technical lead for integration                        │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ Memory Stats: 247 total • Last updated: 2 hours ago • Storage: 12 MB       │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 7.3 Document Library (New Page)

```
/dashboard/ai/documents

┌─────────────────────────────────────────────────────────────────────────────┐
│ 📚 DOCUMENT LIBRARY                    [Search docs...] [Upload] [+ Folder] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Your documents are indexed for AI search (RAG). Ask questions in AI chat.   │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ 📁 Work Documents (23 files)                                        │    │
│ ├─────────────────────────────────────────────────────────────────────┤    │
│ │ 📄 Q1 Product Roadmap.pdf              12 MB    Dec 10, 2025        │    │
│ │ 📄 Team Guidelines.docx                 2 MB    Nov 28, 2025        │    │
│ │ 📄 Meeting Notes - Client.md          156 KB    Dec 14, 2025        │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ 📁 Personal (8 files)                                               │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ Usage: 156 MB / 1 GB • 31 documents indexed • Last sync: 5 min ago         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part C: Testing & Polish (Weeks 7-8)

### Phase 8: Testing (Week 7)

#### 8.1 Test Coverage Targets

| Area | Current | Target | Priority |
|------|---------|--------|----------|
| Unit tests | ~40% | 80% | High |
| Integration | ~20% | 60% | High |
| E2E (Playwright) | ~10% | 50% | Medium |

#### 8.2 Critical E2E Tests

```typescript
// e2e/critical-flows.spec.ts
describe('Critical User Flows', () => {
  test('Complete email workflow', async () => {
    // Login → View inbox → Open email → Reply → Send
  });

  test('AI assistant interaction', async () => {
    // Open AI → Send message → Receive streaming response → Approve action
  });

  test('Command palette navigation', async () => {
    // Cmd+K → Search → Navigate → Execute action
  });

  test('Follow-up and deadline tracking', async () => {
    // View deadlines → Click deadline → View source email
  });
});
```

---

### Phase 9: Localization & Polish (Week 8)

#### 9.1 Translation Completion

| Language | Status | Missing |
|----------|--------|---------|
| English (en) | 98% | 2 strings |
| Italian (it) | 95% | 5 strings |
| New AI features | 0% | ~30 strings |

#### 9.2 Accessibility Checklist

- [ ] WCAG 2.1 AA compliance
- [ ] Keyboard navigation (all features)
- [ ] Screen reader support
- [ ] Color contrast (4.5:1 minimum)
- [ ] Focus indicators visible
- [ ] Reduced motion support

---

## Component Architecture Summary

### New Components to Create

```
frontend/components/
├── ai/
│   ├── CommandPalette/
│   │   ├── index.tsx
│   │   ├── CommandItem.tsx
│   │   └── CommandGroup.tsx
│   ├── DailyBriefing/
│   │   ├── index.tsx
│   │   └── BriefingItem.tsx
│   ├── InlineAIInsights/
│   │   ├── index.tsx
│   │   ├── DeadlineInsight.tsx
│   │   ├── FollowUpInsight.tsx
│   │   └── ContactInsight.tsx
│   ├── QuickReplies/
│   │   ├── index.tsx
│   │   └── ReplyOption.tsx
│   ├── AIComposer/
│   │   ├── index.tsx
│   │   └── AIPromptInput.tsx
│   ├── MemoryBrowser/
│   │   ├── index.tsx
│   │   ├── MemoryList.tsx
│   │   └── MemoryCard.tsx
│   ├── DocumentLibrary/
│   │   ├── index.tsx
│   │   ├── DocumentList.tsx
│   │   └── UploadModal.tsx
│   └── AnalyticsDashboard/
│       ├── index.tsx
│       └── ChartCard.tsx
├── crm/
│   ├── ContactHealthBadge.tsx
│   ├── StaleContactsAlert.tsx
│   ├── ReconnectWidget.tsx
│   └── RelationshipGraph.tsx
├── productivity/
│   ├── DeadlineWidget.tsx
│   ├── FollowUpWidget.tsx
│   ├── ActionItemsList.tsx
│   └── SplitInbox.tsx
└── common/
    ├── KeyboardShortcuts.tsx
    └── ErrorBoundary.tsx
```

### New Hooks to Create

```
frontend/lib/hooks/
├── use-command-palette.ts
├── use-keyboard-navigation.ts
├── use-daily-briefing.ts
├── use-deadlines.ts
├── use-followups.ts
├── use-crm-alerts.ts
├── use-memories.ts
├── use-document-library.ts
└── use-retry-with-backoff.ts
```

### New API Methods

```typescript
// lib/api/voltagent.ts additions
export const voltagentApi = {
  // Existing...

  // NEW: Feature exposure
  getDailyBriefing: () => apiClient.get('/api/v1/voltagent/briefing'),
  getDeadlines: (params) => apiClient.get('/api/v1/voltagent/deadlines', { params }),
  getFollowUps: (params) => apiClient.get('/api/v1/voltagent/followups', { params }),
  getActionItems: (params) => apiClient.get('/api/v1/voltagent/action-items', { params }),
  getMemories: (params) => apiClient.get('/api/v1/voltagent/memories', { params }),
  searchKnowledge: (query) => apiClient.post('/api/v1/voltagent/knowledge/search', { query }),
  getAnalytics: (type, period) => apiClient.get(`/api/v1/voltagent/analytics/${type}`, { params: { period } }),
  getEmailInsights: (emailId) => apiClient.get(`/api/v1/voltagent/emails/${emailId}/insights`),
  getQuickReplies: (emailId) => apiClient.get(`/api/v1/voltagent/emails/${emailId}/quick-replies`),
};
```

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **Performance** | | | |
| Lighthouse Score | ~70 | 90+ | Lighthouse CI |
| LCP | ~2.5s | <1.5s | Web Vitals |
| Bundle Size | ~350KB | <200KB | Bundle analyzer |
| | | | |
| **Quality** | | | |
| Test Coverage | ~30% | 80% | Jest coverage |
| E2E Pass Rate | 60% | 100% | Playwright |
| Accessibility | ~80 | 95+ | axe-core |
| | | | |
| **Feature Adoption** | | | |
| Backend Exposure | 40% | 100% | Feature audit |
| AI Feature Usage | ~10% | 60% | Analytics |
| Command Palette | 0% | 50% | Usage tracking |
| Keyboard Nav | 0% | 40% | Usage tracking |

---

## Timeline Summary

| Week | Phase | Focus | Deliverables |
|------|-------|-------|--------------|
| 1 | Critical Fixes | Hydration, Email, Errors | Stable foundation |
| 2 | Performance | SSR, Code splitting, Vitals | Fast loading |
| 3 | Architecture | Mailbox refactor, Hooks | Clean code |
| 4 | Dashboard | New layout, Widgets | AI exposure |
| 5 | AI Features | Command palette, Inline AI | Power features |
| 6 | CRM/Memory | Contact enhancement, Browser | Differentiation |
| 7 | Testing | E2E, Unit tests | Quality |
| 8 | Polish | i18n, A11y, Docs | Production ready |

---

## Related Documents

- [MARKETING_UX_AUDIT_2025.md](./MARKETING_UX_AUDIT_2025.md) - Competitor analysis, UI mockups
- [AI_SECRETARY_IMPLEMENTATION_PLAN.md](./AI_SECRETARY_IMPLEMENTATION_PLAN.md) - Backend AI features

## Recommended UI Framework: TailAdmin

To accelerate development, we recommend integrating [TailAdmin for Next.js](https://tailadmin.com/nextjs):

### Why TailAdmin

| Feature | How It Helps PMSync |
|---------|---------------------|
| **500+ UI Components** | Ready-to-use dashboard elements |
| **7 Dashboard Templates** | Analytics, CRM, SaaS, AI variants |
| **ApexCharts** | Email analytics visualization |
| **AI Dashboard Pages** | Pre-built AI assistant layouts |
| **Dark/Light Mode** | Already compatible |
| **TypeScript + Tailwind** | Matches our stack |

### TailAdmin Components to Use

| PMSync Feature | TailAdmin Component |
|----------------|---------------------|
| Daily Briefing | Alert/Notification cards |
| Deadlines Widget | Counter cards + tables |
| Follow-ups | Task lists + badges |
| CRM Alerts | Warning cards + stats |
| Contact Health | Progress bars + charts |
| Memory Browser | Data tables + search |
| Analytics | ApexCharts dashboard |
| Command Palette | Modal + search input |

### Integration Approach

```bash
# Option 1: Use TailAdmin components directly
npm install tailadmin-nextjs

# Option 2: Copy specific components needed
# Download from TailAdmin and adapt to our MUI+Tailwind setup
```

**Recommendation:** Start with Option 2 - copy the CRM and Analytics dashboard layouts, adapt them to work with our existing MUI components.

---

## Sources

- [React & Next.js Best Practices 2025](https://strapi.io/blog/react-and-nextjs-in-2025-modern-best-practices)
- [Next.js Performance Optimization](https://pagepro.co/blog/nextjs-performance-optimization-in-9-steps/)
- [React Performance Optimization 2025](https://www.growin.com/blog/react-performance-optimization-2025/)
- [Dashboard UI Design Principles 2025](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
- [Best AI Email Assistant 2025](https://blog.superhuman.com/best-ai-email-assistant/)
- [Superhuman vs Spark Comparison](https://blog.superhuman.com/spark-ai/)
- [React Command Palette (cmdk)](https://react-cmdk.com/)
- [Building Command Palette in React](https://blog.logrocket.com/react-command-palette-tailwind-css-headless-ui/)
- [TailAdmin for Next.js](https://tailadmin.com/nextjs)
- [TanStack Query v5](https://tanstack.com/query/latest)

---

*Last Updated: December 17, 2025*

---

## Changelog

### v2.2 (December 18, 2025)

**Email List Redesign (Superhuman/shadcn-ui Inspired):**

- ✅ **Clean 2-Line Layout** - Sender+date on line 1, subject on line 2 (no snippet)
- ✅ **Hidden Checkbox** - Checkbox only appears on hover (Superhuman style)
- ✅ **Compact Avatar** - Reduced to 28px for cleaner list density
- ✅ **Subtle Hover Effects** - Smooth 150ms transitions on hover
- ✅ **Floating Action Bar** - Actions appear on hover, positioned on right
- ✅ **Inline Indicators** - Star, attachment, thread count as small icons
- ✅ **Unread Styling** - Subtle blue tint for unread items

**References:**
- [shadcn/ui](https://ui.shadcn.com/) - Clean, minimal components
- [Inbox Zero](https://github.com/elie222/inbox-zero) - AI email management UI
- [Superhuman](https://superhuman.com/) - Premium email UX inspiration

### v2.1 (December 17, 2025)

**Dashboard Improvements:**
- ✅ **Responsive Dashboard** - All dashboard components now use MUI Grid responsive breakpoints
- ✅ **Theme Colors** - Replaced all hardcoded colors (#7c3aed, #10b981, etc.) with `theme.palette.*` references
- ✅ **PriorityInbox Enhancement** - Changed from "useless 5 unread emails" to provider-agnostic "Important emails" (starred OR flagged)
- ✅ **Unread Count Fix** - Excluded TRASH/SPAM folders from unread count using RFC 6154 `specialUse`
- ✅ **Provider-Agnostic Important Concept** - Backend `isImportant` filter combines `isStarred OR isFlagged`
- ✅ **TanStack Query Pattern** - All dashboard queries use `queryOptions` pattern with proper caching
- ✅ **Translations** - Added new translation keys for important emails widget
