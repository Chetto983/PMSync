# AI Integration Roadmap - MailAgent

**Version:** 2.0.0
**Last Updated:** 2025-11-26
**Status:** Active Development

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [Gap Analysis](#3-gap-analysis)
4. [Priority Matrix](#4-priority-matrix)
5. [Phase 1: Email AI Integration](#5-phase-1-email-ai-integration)
6. [Phase 2: Backend Completion](#6-phase-2-backend-completion)
7. [Phase 3: Calendar AI Integration](#7-phase-3-calendar-ai-integration)
8. [Phase 4: Contacts Refactor + AI](#8-phase-4-contacts-refactor--ai)
9. [Phase 5: Advanced Features](#9-phase-5-advanced-features)
10. [Technical Specifications](#10-technical-specifications)
11. [Testing Strategy](#11-testing-strategy)
12. [Success Metrics](#12-success-metrics)

---

## 1. Executive Summary

### Vision
Transform MailAgent into an **Intelligent Secretary** that proactively assists users with email, calendar, and contact management through AI-powered features with human-in-the-loop safety.

### Current Status
- **Multi-Agent Backend**: ✅ 85% Complete
- **AI Chat Interface**: ✅ Complete (modern design)
- **Email AI Features**: ⚠️ 30% Complete (API exists, minimal UI)
- **Calendar AI Features**: ⚠️ 20% Complete (basic via chat)
- **Contacts AI Features**: ❌ 10% Complete (needs refactor first)

### Industry Context (2024-2025)
Based on research:
- Microsoft's Magentic-One: Orchestrator + 4 specialized agents pattern
- Intercom Fin: Separate processing for email vs chat
- Model Context Protocol (MCP): Anthropic's new standard for AI tools
- Agentic AI market: $5.25B → $7.55B (43.8% CAGR)

---

## 2. Current State Assessment

### 2.1 Backend Multi-Agent System

```
┌─────────────────────────────────────────────────────────────┐
│                    IMPLEMENTED ✅                            │
├─────────────────────────────────────────────────────────────┤
│ • MultiAgentService (orchestrator)                          │
│ • RouterAgent (intent classification via Mistral)           │
│ • EmailAgent, CalendarAgent, ContactsAgent, GeneralAgent    │
│ • HitlService (Human-in-the-Loop approval workflow)         │
│ • FeedbackService (learning loop with confidence adjust)    │
│ • MemoryService (FIFO conversation history)                 │
│ • ActionExecutorService (15+ action handlers)               │
│ • Real-time WebSocket events for AI actions                 │
└─────────────────────────────────────────────────────────────┘
```

**Location:** `backend/src/modules/ai/multi-agent/`

### 2.2 Frontend AI Components

| Component | File | Status |
|-----------|------|--------|
| AI Chat Page | `pages/dashboard/ai.tsx` | ✅ Complete |
| Multi-Agent API Client | `lib/api/multi-agent.ts` | ✅ Complete |
| AI API Client | `lib/api/ai.ts` | ✅ Complete |
| Personalization API | `lib/api/personalization.ts` | ✅ Complete |
| WebSocket AI Events | `lib/websocket-client.ts` | ✅ Complete |
| AI Search Bar | `components/email/AISearchBar.tsx` | ✅ Complete |
| Settings AI Panel | `components/dashboard/Settings.tsx` | ⚠️ Partial |

### 2.3 What's Working

1. **Chat-based AI Assistant** - Full conversation with intent routing
2. **Pending Actions Workflow** - Approve/reject actions from sidebar
3. **Semantic Email Search** - Memory-based search via AI
4. **Real-time Notifications** - WebSocket events for action lifecycle
5. **Personalization Profile** - Job role, communication style, response length

---

## 3. Gap Analysis

### 3.1 Backend Gaps

#### Missing Action Executors (5)

| Action Type | Priority | Effort | Status |
|-------------|----------|--------|--------|
| `GET_CONTACT` | HIGH | 2h | ❌ Defined, no handler |
| `GET_UNREAD` | HIGH | 2h | ❌ Referenced, no handler |
| `CATEGORIZE_EMAIL` | MEDIUM | 4h | ❌ Not implemented |
| `RESCHEDULE_EVENT` | MEDIUM | 4h | ❌ Not implemented |
| `ENRICH_CONTACT` | LOW | 8h | ❌ Not implemented |

#### ContactsAgent Integration Issue
- Agent writes directly to Prisma, bypassing `ContactsService`
- Provider sync (Google/Microsoft) never triggered from agent actions
- **Fix:** Route through ContactsService for proper sync

### 3.2 Frontend Gaps

#### Email Module - Missing AI Features

| Feature | API Exists | Backend | UI Component | Priority |
|---------|------------|---------|--------------|----------|
| Smart Replies in Thread | ✅ `aiApi.generateSmartReplies()` | ✅ | ❌ | **P0** |
| Email Summarization Panel | ✅ `aiApi.summarizeEmail()` | ✅ | ❌ | **P0** |
| AI Categorization Badges | ✅ `aiApi.categorizeEmail()` | ⚠️ | ❌ | P1 |
| Smart Compose Assistant | ❌ | ❌ | ❌ | P1 |
| Triage Chips | ❌ | ❌ | ❌ | P2 |

#### Calendar Module - Missing AI Features

| Feature | API Exists | Backend | UI Component | Priority |
|---------|------------|---------|--------------|----------|
| Scheduling Drawer | ⚠️ Via multi-agent | ✅ | ❌ | **P0** |
| Conflict Detection | ❌ | ❌ | ❌ | P1 |
| Attendee Availability | ❌ | ❌ | ❌ | P1 |
| Meeting Duration Suggestions | ❌ | ❌ | ❌ | P2 |

#### Contacts Module - Needs Refactor First

See: [contacts-refactor-plan.md](./contacts-refactor-plan.md)

| Feature | Status | Priority |
|---------|--------|----------|
| Modular Components | ❌ | **P0** |
| Multi-selection | ❌ | **P0** |
| AI Deduplication Panel | ❌ | P1 |
| Contact Enrichment | ❌ | P2 |

### 3.3 Settings Persistence Gap

**Issue:** AI feature toggles in Settings don't persist to backend.

```typescript
// Current: Local state only (doesn't save)
const [smartRepliesEnabled, setSmartRepliesEnabled] = useState(true);

// Needed: Sync with backend
const handleToggle = async (feature, enabled) => {
  await personalizationApi.updateProfile({ [feature]: enabled });
};
```

---

## 4. Priority Matrix

### Impact vs Effort Grid

```
                    HIGH IMPACT
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    │  Smart Replies ⭐   │  Scheduling        │
    │  Summarization ⭐   │  Drawer            │
    │  Missing Handlers  │                    │
    │                    │                    │
LOW ├────────────────────┼────────────────────┤ HIGH
EFFORT                   │                    EFFORT
    │                    │                    │
    │  Settings          │  Contacts          │
    │  Persistence       │  Refactor          │
    │  Triage Chips      │  Smart Compose     │
    │                    │                    │
    └────────────────────┼────────────────────┘
                         │
                    LOW IMPACT
```

### Priority Order

1. **P0 - Critical** (Do First)
   - Smart Replies in Email Thread
   - Email Summarization Panel
   - Missing Backend Action Handlers

2. **P1 - High** (Next Sprint)
   - Scheduling Drawer for Calendar
   - Settings Persistence
   - AI Categorization

3. **P2 - Medium** (Future)
   - Contacts Refactor
   - Smart Compose
   - Contact Deduplication

4. **P3 - Low** (Backlog)
   - Contact Enrichment
   - Topic Auto-Generation
   - Voice Assistant

---

## 5. Phase 1: Email AI Integration

**Duration:** 1-2 weeks
**Goal:** Surface AI features directly in email workflow

### 5.1 Smart Replies Component

**File:** `frontend/components/email/SmartReplySuggestions.tsx`

```typescript
interface SmartReplySuggestionsProps {
  emailId: string;
  threadId?: string;
  onSelectReply: (reply: string) => void;
  onDismiss?: () => void;
}
```

**UI Design:**
```
┌─────────────────────────────────────────────────────────────┐
│ 💡 Smart Replies                                    [✕]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Thanks for the  │  │ I'll review and │  │ Let me check│ │
│  │ update! I'll... │  │ get back to you │  │ and confirm │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
│                                                             │
│  [↻ Generate More]                      [⚙️ Tone: Casual ▼] │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Steps:**

1. Create component with loading/error states
2. Call `aiApi.generateSmartReplies(emailId)`
3. Display as clickable chips
4. On click → open composer with reply text
5. Add tone selector (formal/casual/technical)

**Integration Point:** `components/email/ThreadDisplay.tsx` or `EmailDetail.tsx`

### 5.2 Email Summary Panel

**File:** `frontend/components/email/EmailSummaryPanel.tsx`

```typescript
interface EmailSummaryPanelProps {
  emailId: string;
  defaultExpanded?: boolean;
  showActions?: boolean; // Extract tasks, events, etc.
}
```

**UI Design:**
```
┌─────────────────────────────────────────────────────────────┐
│ 📝 AI Summary                                   [▼ Expand]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  John is requesting approval for the Q4 budget proposal.    │
│  Key points:                                                │
│  • Budget increase of 15% requested                         │
│  • Deadline: November 30th                                  │
│  • Requires department head sign-off                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 📅 Extracted: "Meeting Nov 30" [Add to Calendar]     │   │
│  │ ✓ Extracted: "Review budget" [Add as Task]           │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [↻ Regenerate]  [📋 Copy]                                  │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Steps:**

1. Create collapsible panel component
2. Call `aiApi.summarizeEmail(emailId)` on expand
3. Cache summary in local state or store
4. Parse for extractable items (dates, tasks)
5. Add action buttons for extracted items

### 5.3 AI Categorization Badges

**File:** `frontend/components/email/AICategoryBadge.tsx`

Display AI-suggested categories on email list items.

```typescript
interface AICategoryBadgeProps {
  categories: string[];
  confidence: number;
  onAccept?: (category: string) => void;
  onReject?: (category: string) => void;
}
```

**UI:** Small colored chips next to email subject showing suggested labels.

### 5.4 Files to Modify

| File | Changes |
|------|---------|
| `components/email/ThreadDisplay.tsx` | Add SmartReplySuggestions |
| `components/email/EmailDetail.tsx` | Add EmailSummaryPanel |
| `components/email/ThreadListItem.tsx` | Add AICategoryBadge |
| `stores/email-store.ts` | Add AI-related state |
| `locales/en.ts`, `locales/it.ts` | Add translations |

---

## 6. Phase 2: Backend Completion

**Duration:** 3-5 days
**Goal:** Complete missing action executors

### 6.1 GET_CONTACT Handler

**File:** `backend/src/modules/ai/multi-agent/services/action-executor.service.ts`

```typescript
private async executeGetContact(
  action: AgentAction,
  context: AgentContext,
): Promise<ActionResult> {
  const { contactId, email, name } = action.payload;

  let contact;
  if (contactId) {
    contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId: context.tenantId },
      include: { providerContacts: true },
    });
  } else if (email) {
    contact = await this.prisma.contact.findFirst({
      where: {
        tenantId: context.tenantId,
        emails: { has: email },
      },
    });
  } else if (name) {
    contact = await this.prisma.contact.findFirst({
      where: {
        tenantId: context.tenantId,
        OR: [
          { displayName: { contains: name, mode: 'insensitive' } },
          { firstName: { contains: name, mode: 'insensitive' } },
          { lastName: { contains: name, mode: 'insensitive' } },
        ],
      },
    });
  }

  return {
    success: !!contact,
    data: contact,
    message: contact ? `Found contact: ${contact.displayName}` : 'Contact not found',
  };
}
```

### 6.2 GET_UNREAD Handler

```typescript
private async executeGetUnread(
  action: AgentAction,
  context: AgentContext,
): Promise<ActionResult> {
  const { limit = 10, providerId } = action.payload;

  const whereClause: any = {
    tenantId: context.tenantId,
    isRead: false,
    isDeleted: false,
  };

  if (providerId) {
    whereClause.providerId = providerId;
  }

  const emails = await this.prisma.email.findMany({
    where: whereClause,
    orderBy: { receivedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      subject: true,
      from: true,
      receivedAt: true,
      snippet: true,
    },
  });

  return {
    success: true,
    data: { count: emails.length, emails },
    message: `Found ${emails.length} unread emails`,
  };
}
```

### 6.3 CATEGORIZE_EMAIL Handler

```typescript
private async executeCategorizeEmail(
  action: AgentAction,
  context: AgentContext,
): Promise<ActionResult> {
  const { emailId, categories, labels } = action.payload;

  const email = await this.prisma.email.findFirst({
    where: { id: emailId, tenantId: context.tenantId },
  });

  if (!email) {
    return { success: false, message: 'Email not found' };
  }

  // Update email with new labels/categories
  const updatedEmail = await this.prisma.email.update({
    where: { id: emailId },
    data: {
      labels: {
        push: labels || categories,
      },
      // Could also update a separate 'aiCategories' field
    },
  });

  return {
    success: true,
    data: updatedEmail,
    message: `Email categorized with: ${(labels || categories).join(', ')}`,
  };
}
```

### 6.4 RESCHEDULE_EVENT Handler

```typescript
private async executeRescheduleEvent(
  action: AgentAction,
  context: AgentContext,
): Promise<ActionResult> {
  const { eventId, newStartTime, newEndTime, reason } = action.payload;

  const event = await this.prisma.calendarEvent.findFirst({
    where: { id: eventId, tenantId: context.tenantId },
    include: { calendar: { include: { provider: true } } },
  });

  if (!event) {
    return { success: false, message: 'Event not found' };
  }

  // Update via CalendarService for proper provider sync
  const updatedEvent = await this.calendarService.updateEvent(
    event.calendar.providerId,
    event.calendarId,
    eventId,
    {
      startTime: new Date(newStartTime),
      endTime: new Date(newEndTime),
      description: event.description
        ? `${event.description}\n\n[Rescheduled: ${reason}]`
        : `[Rescheduled: ${reason}]`,
    },
    context.userId,
  );

  return {
    success: true,
    data: updatedEvent,
    message: `Event rescheduled to ${newStartTime}`,
  };
}
```

### 6.5 Update Switch Statement

Add cases to the main `execute()` method:

```typescript
case AgentActionType.GET_CONTACT:
  return this.executeGetContact(action, context);
case AgentActionType.GET_UNREAD:
  return this.executeGetUnread(action, context);
case AgentActionType.CATEGORIZE_EMAIL:
  return this.executeCategorizeEmail(action, context);
case AgentActionType.RESCHEDULE_EVENT:
  return this.executeRescheduleEvent(action, context);
```

---

## 7. Phase 3: Calendar AI Integration

**Duration:** 1 week
**Goal:** AI-powered scheduling and event management

### 7.1 Scheduling Drawer Component

**File:** `frontend/components/calendar/SchedulingDrawer.tsx`

```typescript
interface SchedulingDrawerProps {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string; // e.g., "Schedule meeting with John next week"
  onEventCreated?: (event: CalendarEvent) => void;
}
```

**UI Design:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🗓️ AI Scheduling Assistant                           [✕]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  What would you like to schedule?                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Schedule a 1-hour meeting with John next week        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  📅 Suggested Times                                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ○ Mon, Nov 27 at 2:00 PM - 3:00 PM                  │    │
│  │   ✓ You're free  ✓ John's calendar shows available  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ○ Tue, Nov 28 at 10:00 AM - 11:00 AM                │    │
│  │   ✓ You're free  ⚠️ Conflicts with "Team Standup"   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ○ Wed, Nov 29 at 3:00 PM - 4:00 PM                  │    │
│  │   ✓ You're free  ✓ Best time based on your pattern  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Event Details                                              │
│  Title:    [ Meeting with John                        ]     │
│  Location: [ Video Call                               ]     │
│  Notes:    [ Discuss Q4 planning                      ]     │
│                                                             │
│  [Cancel]                            [Create Event ✓]       │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Implementation Flow

```
User opens drawer → Enters natural language request
         ↓
Frontend calls multiAgentApi.processMessage()
         ↓
CalendarAgent analyzes request
         ↓
Returns proposed action: CREATE_EVENT with suggested times
         ↓
Frontend displays suggestions with availability check
         ↓
User selects time → Approves action
         ↓
Backend executes → Event created
         ↓
WebSocket notifies → Calendar refreshes
```

### 7.3 Backend: Availability Check Endpoint

**New endpoint:** `GET /calendar/availability`

```typescript
@Get('availability')
async checkAvailability(
  @Request() req,
  @Query('start') start: string,
  @Query('end') end: string,
  @Query('duration') duration: number, // minutes
  @Query('attendees') attendees?: string[], // emails
) {
  // Query user's calendar for busy times
  // Optionally check attendee calendars (if accessible)
  // Return available slots
}
```

### 7.4 Files to Create/Modify

| File | Action |
|------|--------|
| `components/calendar/SchedulingDrawer.tsx` | Create |
| `components/calendar/TimeSlotPicker.tsx` | Create |
| `components/calendar/ConflictIndicator.tsx` | Create |
| `components/dashboard/Calendar.tsx` | Add drawer trigger |
| `lib/api/calendar.ts` | Add availability endpoint |
| `backend/.../calendar.controller.ts` | Add availability endpoint |

---

## 8. Phase 4: Contacts Refactor + AI

**Duration:** 1-2 weeks
**Goal:** Modular contacts with AI features

**Reference:** [contacts-refactor-plan.md](./contacts-refactor-plan.md)

### 8.1 Component Structure

```
frontend/components/contacts/
├── index.ts
├── ContactLayout.tsx        # 3-panel responsive layout
├── ContactList.tsx          # Virtualized list with infinite scroll
├── ContactListItem.tsx      # Item with checkbox, avatar, hover actions
├── ContactActionBar.tsx     # Hover action buttons
├── ContactBulkActionBar.tsx # Bulk operations bar
├── ContactSidebar.tsx       # Filters, sync, new contact
├── ContactDetail.tsx        # Detail view with tabs
└── ai/
    ├── ContactDedupePanel.tsx    # AI deduplication suggestions
    ├── ContactEnrichPanel.tsx    # AI enrichment from emails
    └── SimilarContactsCard.tsx   # Similar contact suggestions
```

### 8.2 AI Deduplication Panel

**File:** `frontend/components/contacts/ai/ContactDedupePanel.tsx`

```typescript
interface DuplicateGroup {
  primaryContact: Contact;
  duplicates: Contact[];
  similarity: number; // 0-1
  matchReasons: string[]; // "Same email", "Similar name", etc.
}

interface ContactDedupePanelProps {
  groups: DuplicateGroup[];
  onMerge: (primaryId: string, duplicateIds: string[]) => Promise<void>;
  onDismiss: (groupId: string) => void;
}
```

**UI:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Potential Duplicates (3 groups found)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 👤 John Smith (Primary)          john@acme.com        │  │
│  │    ├── John Smith               john.smith@gmail.com  │  │
│  │    └── J. Smith                 jsmith@work.com       │  │
│  │                                                       │  │
│  │ Match: 92% (Same name, company overlap)               │  │
│  │                                                       │  │
│  │ [Merge All] [Keep Separate] [Review]                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 Store Enhancement

**File:** `frontend/stores/contact-store.ts`

```typescript
interface ContactState {
  // Existing
  contacts: Contact[];
  selectedContact: Contact | null;
  isLoading: boolean;
  searchQuery: string;

  // NEW: Pagination
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };

  // NEW: Multi-selection
  selectedIds: Set<string>;

  // NEW: Filters
  filters: {
    providerId?: string;
    hasEmail?: boolean;
    hasPhone?: boolean;
    company?: string;
  };

  // NEW: AI State
  duplicateGroups: DuplicateGroup[];
  enrichmentSuggestions: EnrichmentSuggestion[];

  // Actions...
}
```

---

## 9. Phase 5: Advanced Features

**Duration:** 2-4 weeks
**Goal:** Proactive AI and advanced patterns

### 9.1 Topic Auto-Generation (Zero-main Pattern)

Automatically detect user interests from email subjects:

```typescript
// Backend service
async generateUserTopics(userId: string, tenantId: string) {
  // 1. Fetch recent email subjects
  const emails = await this.prisma.email.findMany({
    where: { tenantId, folder: 'INBOX' },
    select: { subject: true },
    take: 100,
  });

  // 2. Use AI to extract topics
  const topics = await this.mistral.chat({
    messages: [{
      role: 'user',
      content: `Extract 5-10 key topics/interests from these email subjects: ${subjects.join(', ')}`
    }]
  });

  // 3. Store as user profile data
  // 4. Create labels in email providers
}
```

### 9.2 Proactive Notifications

**Pattern:** AI notices something and suggests action

```
┌─────────────────────────────────────────────────────────────┐
│ 💡 AI Suggestion                                    [✕]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  I noticed you have 3 unread emails from your manager       │
│  from the last 2 days. Would you like me to:                │
│                                                             │
│  [📧 Summarize them]  [📝 Draft responses]  [Later]         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Writing Style Learning (Zero-main Pattern)

Analyze sent emails to learn user's writing style:

```typescript
interface WritingStyleMatrix {
  formality: 'formal' | 'casual' | 'technical';
  averageLength: 'concise' | 'moderate' | 'detailed';
  commonPhrases: string[];
  signatureStyle: string;
  greetingStyle: string;
  responsePatterns: Map<string, string>; // context → typical response
}
```

### 9.4 Smart Compose Assistant

Real-time suggestions while typing:

```
┌─────────────────────────────────────────────────────────────┐
│ To: john@acme.com                                           │
│ Subject: Re: Q4 Budget Proposal                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Hi John,                                                    │
│                                                             │
│ Thank you for sending the budget proposal. I've reviewed    │
│ [the attached documents and have a few questions:]  ← AI    │
│                                                             │
│ ───────────────────────────────────────────────────────────│
│ Press [Tab] to accept suggestion                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Technical Specifications

### 10.1 API Contracts

#### Smart Replies Endpoint
```
GET /ai/email/:id/smart-replies
Response: {
  replies: Array<{
    text: string;
    tone: 'formal' | 'casual' | 'technical';
    confidence: number;
  }>;
  generatedAt: string;
}
```

#### Email Summary Endpoint
```
GET /ai/email/:id/summary
Response: {
  summary: string;
  keyPoints: string[];
  extractedItems: Array<{
    type: 'date' | 'task' | 'action';
    text: string;
    metadata: object;
  }>;
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
}
```

#### Availability Check Endpoint
```
GET /calendar/availability
Query: {
  start: ISO8601,
  end: ISO8601,
  duration: number (minutes),
  attendees?: string[]
}
Response: {
  slots: Array<{
    start: ISO8601,
    end: ISO8601,
    quality: 'optimal' | 'good' | 'acceptable';
    conflicts: string[];
  }>;
}
```

### 10.2 State Management

```typescript
// AI-specific store slice
interface AIState {
  // Active session
  sessionId: string | null;
  conversationHistory: Message[];

  // Pending actions
  pendingActions: PendingAction[];
  pendingActionsLoading: boolean;

  // Feature states
  smartReplies: Map<string, SmartReply[]>; // emailId → replies
  summaries: Map<string, EmailSummary>;     // emailId → summary

  // User preferences
  aiEnabled: boolean;
  autoApproveThreshold: number;
  preferredTone: 'formal' | 'casual' | 'technical';
}
```

### 10.3 WebSocket Events

```typescript
// New events to add
type AIWebSocketEvent =
  | { type: 'AI_SUGGESTION_READY'; data: { type: string; payload: object } }
  | { type: 'AI_PROCESSING_START'; data: { requestId: string } }
  | { type: 'AI_PROCESSING_COMPLETE'; data: { requestId: string; result: object } }
  | { type: 'AI_PROACTIVE_INSIGHT'; data: { insight: string; actions: object[] } };
```

---

## 11. Testing Strategy

### 11.1 Unit Tests

| Component | Test File | Coverage Target |
|-----------|-----------|-----------------|
| SmartReplySuggestions | `SmartReplySuggestions.test.tsx` | 80% |
| EmailSummaryPanel | `EmailSummaryPanel.test.tsx` | 80% |
| SchedulingDrawer | `SchedulingDrawer.test.tsx` | 80% |
| ActionExecutor handlers | `action-executor.service.spec.ts` | 90% |

### 11.2 Integration Tests

```typescript
describe('Email AI Integration', () => {
  it('should generate smart replies for an email', async () => {
    const { result } = renderHook(() => useSmartReplies(emailId));
    await waitFor(() => expect(result.current.replies).toHaveLength(3));
  });

  it('should insert selected reply into composer', async () => {
    render(<EmailThreadWithAI />);
    fireEvent.click(screen.getByText(/Thanks for the update/));
    expect(screen.getByRole('textbox')).toHaveValue(/Thanks for the update/);
  });
});
```

### 11.3 E2E Tests

```typescript
test('user can get AI summary and create task from it', async ({ page }) => {
  await page.goto('/dashboard/email');
  await page.click('[data-testid="email-item-1"]');
  await page.click('[data-testid="ai-summary-toggle"]');
  await page.waitForSelector('[data-testid="summary-content"]');
  await page.click('[data-testid="extracted-task-add"]');
  await expect(page.locator('.toast')).toContainText('Task created');
});
```

---

## 12. Success Metrics

### 12.1 Adoption Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Smart Reply Usage | 30% of replies | Track click-through |
| Summary Panel Opens | 50% of thread views | Track expand events |
| AI Chat Sessions/Day | 5 per active user | Session count |
| Action Approval Rate | >80% | Approved / Total |

### 12.2 Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Smart Reply Relevance | >4/5 rating | User feedback |
| Summary Accuracy | >90% | Spot checks |
| False Positive Rate | <5% | Rejected actions |
| Learning Improvement | +10% approval/month | FeedbackService stats |

### 12.3 Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Smart Reply Latency | <2s | P95 |
| Summary Generation | <3s | P95 |
| Action Execution | <1s | P95 |
| Chat Response | <5s | P95 |

---

## Appendix A: File Checklist

### Phase 1 Files
- [ ] `frontend/components/email/SmartReplySuggestions.tsx`
- [ ] `frontend/components/email/EmailSummaryPanel.tsx`
- [ ] `frontend/components/email/AICategoryBadge.tsx`
- [ ] `frontend/locales/en.ts` (email AI translations)
- [ ] `frontend/locales/it.ts` (email AI translations)

### Phase 2 Files
- [ ] `backend/src/modules/ai/multi-agent/services/action-executor.service.ts`
- [ ] `backend/src/modules/ai/multi-agent/services/action-executor.service.spec.ts`

### Phase 3 Files
- [ ] `frontend/components/calendar/SchedulingDrawer.tsx`
- [ ] `frontend/components/calendar/TimeSlotPicker.tsx`
- [ ] `backend/src/modules/calendar/calendar.controller.ts` (availability endpoint)

### Phase 4 Files
- [ ] See [contacts-refactor-plan.md](./contacts-refactor-plan.md) for full list

---

## Appendix B: External References

### Architecture
- [Microsoft AI Agent Design Patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [LangGraph Multi-Agent Workflows](https://blog.langchain.dev/langgraph-multi-agent-workflows/)
- [Model Context Protocol (MCP)](https://anthropic.com/news/model-context-protocol)

### Email AI
- [Intercom Fin over Email](https://www.intercom.com/blog/fin-over-email-how-we-built/)
- [Zapier AI Email Assistants 2025](https://zapier.com/blog/best-ai-email-assistant/)
- [Gmail AI Agent Guide](https://blog.arcade.dev/how-to-build-an-ai-agent-for-gmail-a-complete-guide-for-2025)

### UI/UX
- [Nielsen Norman - Dialog Design](https://www.nngroup.com/articles/dialog-design/)
- [MUI Components](https://mui.com/material-ui/)
- [MUI X Data Grid](https://mui.com/x/react-data-grid/)

---

**Document Maintainer:** MailAgent Team
**Review Cycle:** Bi-weekly
**Next Review:** 2025-12-10
